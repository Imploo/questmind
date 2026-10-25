import * as logger from './utils/logger';
import { GoogleGenAI, Part } from '@google/genai';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFunctions } from 'firebase-admin/functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { getAiFeatureConfig, getTranscriptionSegmentationConfig } from './utils/ai-settings';
import { buildGenerationParams } from './utils/gemini-config';
import { AIFeatureConfig } from './types/audio-session.types';
import { WorkerQueueService } from './services/worker-queue.service';
import { buildRawStoryPrompt, buildSegmentRawStoryPrompt } from './audio/transcription-prompt';
import { fetchKankaContextForTranscription } from './services/kanka.service';
import { captureException, wrapCallable } from './utils/sentry-error-handler';
import { sanitizeSessionLog } from './audio/session-log-sanitizer';
import {
  CampaignVoiceIntroSettings,
  VoiceIntroAudio,
  loadVoiceIntroAudio,
} from './audio/voice-intro.service';
import { buildVoiceIntroReferencePrompt } from './prompts/raw-story-transcription.prompt';

/** One audio segment to transcribe (a time-slice of a longer recording). */
/** Base delay between transcription attempts of one segment (multiplied by the attempt number). */
const RETRY_BACKOFF_MS = 5000;

/** Name of the task-queue function that does the actual transcription work. */
const TRANSCRIPTION_WORKER_NAME = 'transcribeAudioFastWorker';
const TRANSCRIPTION_WORKER_REGION = 'europe-west1';

/**
 * Upper bound for one transcription run (segments + story generation).
 * 1800s is the maximum Cloud Tasks dispatch deadline.
 */
const TRANSCRIPTION_WORKER_TIMEOUT_SECONDS = 1800;

export interface AudioSegmentRef {
  /** 0-based order of this segment within the recording. */
  index: number;
  /** Gemini Files API URI for this segment's audio. */
  fileUri: string;
  /** Approximate start offset within the full recording, in seconds. */
  startSec?: number;
  /** Approximate end offset within the full recording, in seconds. */
  endSec?: number;
}

export interface TranscribeAudioFastRequest {
  campaignId: string;
  sessionId: string;
  /** Single-segment (legacy) audio reference. */
  fileUri?: string;
  /** Multi-segment audio references (ticket #67). Takes priority over fileUri. */
  fileUris?: AudioSegmentRef[];
  audioFileName: string;
  audioFileSize?: number;
  userCorrections?: string;
}

/**
 * Normalize the request's audio references into an ordered segment list.
 * Filters out empty URIs and falls back to the legacy single `fileUri`.
 */
function normalizeSegments(
  fileUris: AudioSegmentRef[] | undefined,
  fileUri: string | undefined
): AudioSegmentRef[] {
  if (Array.isArray(fileUris) && fileUris.length > 0) {
    return fileUris
      .filter((s): s is AudioSegmentRef => !!s && typeof s.fileUri === 'string' && s.fileUri.length > 0)
      .map((s, i) => ({
        index: typeof s.index === 'number' ? s.index : i,
        fileUri: s.fileUri,
        startSec: s.startSec,
        endSec: s.endSec,
      }))
      .sort((a, b) => a.index - b.index);
  }
  if (typeof fileUri === 'string' && fileUri.length > 0) {
    return [{ index: 0, fileUri }];
  }
  return [];
}

interface GeminiFileStateResponse {
  state?: string | { name?: string };
  error?: unknown;
}

/**
 * Fast transcription using direct Gemini API call
 *
 * 1. Validates input and updates progress
 * 2. Enqueues the work on the `transcribeAudioFastWorker` task queue
 * 3. Returns immediately to frontend (which monitors Firestore)
 *
 * The work itself runs in the task function, NOT after this callable has
 * responded: Cloud Run throttles CPU and reclaims idle instances once a
 * request has finished, which silently killed long background runs.
 */
export const transcribeAudioFast = onCall(
  {
    memory: '1GiB',
    secrets: ['GOOGLE_AI_API_KEY', 'KANKA_API_TOKEN'],
  },
  wrapCallable<TranscribeAudioFastRequest, { success: boolean; message: string }>(
    'transcribeAudioFast',
    async (request): Promise<{ success: boolean; message: string }> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const {
      campaignId,
      sessionId,
      fileUri,
      fileUris,
      audioFileName,
      userCorrections,
    } = request.data;

    const segments = normalizeSegments(fileUris, fileUri);

    // Validate required fields
    if (!campaignId || !sessionId || segments.length === 0 || !audioFileName) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: campaignId, sessionId, fileUri/fileUris, audioFileName'
      );
    }

    const googleAiKey = process.env.GOOGLE_AI_API_KEY;
    if (!googleAiKey) {
      throw new HttpsError(
        'failed-precondition',
        'Google AI API key not configured'
      );
    }

    const db = getFirestore();
    const sessionRef = db
      .collection('campaigns')
      .doc(campaignId)
      .collection('audioSessions')
      .doc(sessionId);

    // Validate session exists
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      throw new HttpsError(
        'not-found',
        `Audio session ${sessionId} not found`
      );
    }

    // Update progress to transcribing (70-80% range)
    await ProgressTrackerService.updateProgress(
      campaignId,
      sessionId,
      'transcribing',
      70,
      'Fast transcription started...'
    );

    // Fetch Kanka + voice-intro settings from campaign settings
    const { kankaEnabled, voiceIntro, voiceIntroRoster } = await getCampaignTranscriptionSettings(campaignId);

    // Store fast transcription metadata
    await sessionRef.update({
      transcriptionFast: {
        mode: 'fast',
        enableKankaContext: kankaEnabled,
        userCorrections,
        fileUri: segments[0].fileUri,         // first segment — kept for backward compatibility
        segmentCount: segments.length,
        segments: segments.map((s) => ({
          index: s.index,
          fileUri: s.fileUri,
          startSec: s.startSec ?? null,
          endSec: s.endSec ?? null,
          status: 'pending',
        })),
        audioFileName,
        submittedAt: FieldValue.serverTimestamp(),
        status: 'processing',
      },
    });

    const payload: TranscriptionTaskPayload = {
      campaignId,
      sessionId,
      segments,
      audioFileName,
      kankaEnabled,
      voiceIntro: voiceIntro ?? null,
      voiceIntroRoster: voiceIntroRoster ?? null,
      userCorrections: userCorrections ?? null,
    };
    await getFunctions()
      .taskQueue(`locations/${TRANSCRIPTION_WORKER_REGION}/functions/${TRANSCRIPTION_WORKER_NAME}`)
      .enqueue(payload, { dispatchDeadlineSeconds: TRANSCRIPTION_WORKER_TIMEOUT_SECONDS });

    // Return immediately - frontend will monitor Firestore for updates
      return {
        success: true,
        message: 'Fast transcription started',
      };
    }
  ),
);

/** Data handed from the callable to the transcription task (JSON-serialisable: no undefined). */
interface TranscriptionTaskPayload {
  campaignId: string;
  sessionId: string;
  segments: AudioSegmentRef[];
  audioFileName: string;
  kankaEnabled: boolean;
  voiceIntro: CampaignVoiceIntroSettings | null;
  voiceIntroRoster: string | null;
  userCorrections: string | null;
}

/**
 * Task-queue worker that runs the transcription (and the story generation it
 * triggers) inside a live request, so the instance stays up until it is done.
 * Not retried by Cloud Tasks: failures are written to Firestore instead, and a
 * re-run would redo every Gemini call.
 */
export const transcribeAudioFastWorker = onTaskDispatched<TranscriptionTaskPayload>(
  {
    timeoutSeconds: TRANSCRIPTION_WORKER_TIMEOUT_SECONDS,
    memory: '1GiB',
    secrets: ['GOOGLE_AI_API_KEY', 'KANKA_API_TOKEN'],
    retryConfig: { maxAttempts: 1 },
  },
  async (request) => {
    const {
      campaignId,
      sessionId,
      segments,
      audioFileName,
      kankaEnabled,
      voiceIntro,
      voiceIntroRoster,
      userCorrections,
    } = request.data;

    await processTranscriptionAsync(
      campaignId,
      sessionId,
      segments,
      audioFileName,
      kankaEnabled,
      voiceIntro ?? undefined,
      voiceIntroRoster ?? undefined,
      userCorrections ?? undefined,
      process.env.GOOGLE_AI_API_KEY ?? ''
    );
  }
);

interface CampaignTranscriptionSettings {
  kankaEnabled: boolean;
  voiceIntro?: CampaignVoiceIntroSettings;
  /** Free-text speaking order of the voice intro, written by the campaign owner. */
  voiceIntroRoster?: string;
}

/**
 * Helper function to fetch the transcription-related campaign settings
 * (Kanka context toggle and voice-intro reference, ticket #68)
 */
async function getCampaignTranscriptionSettings(
  campaignId: string
): Promise<CampaignTranscriptionSettings> {
  const db = getFirestore();
  const campaignRef = db.collection('campaigns').doc(campaignId);
  const campaignSnap = await campaignRef.get();

  if (!campaignSnap.exists) {
    logger.warn(`Campaign ${campaignId} not found, defaulting kankaEnabled to false`);
    return { kankaEnabled: false };
  }

  const settings = campaignSnap.data()?.settings;
  return {
    kankaEnabled: settings?.kankaEnabled ?? false,
    voiceIntro: settings?.voiceIntro?.storagePath ? settings.voiceIntro : undefined,
    voiceIntroRoster:
      typeof settings?.voiceIntroRoster === 'string' ? settings.voiceIntroRoster : undefined,
  };
}

/**
 * Parts that precede every segment's prompt when a voice intro is available:
 * an explanation (including the speaking order, if given) followed by the intro audio itself.
 */
function buildVoiceIntroParts(
  voiceIntroAudio: VoiceIntroAudio | null,
  voiceIntroRoster: string | undefined
): Part[] {
  if (!voiceIntroAudio) {
    return [];
  }
  return [
    { text: buildVoiceIntroReferencePrompt(voiceIntroRoster) },
    { inlineData: { mimeType: voiceIntroAudio.mimeType, data: voiceIntroAudio.data } },
  ];
}

/**
 * Run the transcription for all segments, store the raw story and trigger story generation.
 * Never throws: failures are written to the session in Firestore.
 */
async function processTranscriptionAsync(
  campaignId: string,
  sessionId: string,
  segments: AudioSegmentRef[],
  audioFileName: string,
  enableKankaContext: boolean,
  voiceIntro: CampaignVoiceIntroSettings | undefined,
  voiceIntroRoster: string | undefined,
  userCorrections: string | undefined,
  googleAiKey: string
): Promise<void> {
  const db = getFirestore();
  const sessionRef = db
    .collection('campaigns')
    .doc(campaignId)
    .collection('audioSessions')
    .doc(sessionId);

  const startTime = Date.now();

  try {
    logger.debug(`[Fast Transcription] Starting for session ${sessionId}`);

    // 1. Get AI settings
    const transcriptionConfig = await getAiFeatureConfig('transcription');
    const segmentationConfig = await getTranscriptionSegmentationConfig();
    const model = transcriptionConfig.model;
    const mimeType = resolveMimeType(audioFileName);

    logger.debug(`[Fast Transcription] Using model: ${model}`);

    // 2. Fetch Kanka context if enabled
    const kankaContext = await fetchKankaContextForTranscription(
      campaignId,
      sessionId,
      enableKankaContext
    );

    // 3. Load the campaign's voice intro (ticket #68). Optional and non-fatal:
    //    without it the transcription behaves exactly as before.
    const voiceIntroAudio = await loadVoiceIntroAudio(campaignId, voiceIntro);
    const hasVoiceIntro = voiceIntroAudio !== null;
    const voiceIntroParts = buildVoiceIntroParts(voiceIntroAudio, voiceIntroRoster);
    await sessionRef.update({ 'transcriptionFast.voiceIntroUsed': hasVoiceIntro });

    // 4. Transcribe each segment with its own Gemini call, then join in order.
    //    A single segment (the common/legacy case) uses the full-session prompt;
    //    multiple segments each use a segment-aware prompt and are concatenated.
    const googleAi = new GoogleGenAI({ apiKey: googleAiKey });
    const fullPrompt = buildRawStoryPrompt(kankaContext, { hasVoiceIntro });
    // Used when a segment has to be retried WITHOUT the intro audio: the voice-intro
    // prompt would then point the model at a reference it never receives.
    const fullPromptWithoutIntro = hasVoiceIntro ? buildRawStoryPrompt(kankaContext) : fullPrompt;
    const total = segments.length;

    const concurrency = Math.max(1, segmentationConfig.concurrency);
    logger.debug(
      `[Fast Transcription] Transcribing ${total} segment(s) for session ${sessionId} (concurrency ${Math.min(concurrency, total)}, onFailure ${segmentationConfig.onSegmentFailure})`
    );

    // Segments are transcribed in parallel (bounded by the configured concurrency).
    // mapWithConcurrency preserves INPUT order regardless of which segment
    // finishes first, and each segment also carries its index/offsets — so the
    // story is always joined back together in the right order.
    let completedSegments = 0;
    const voiceIntroFallbackSegments: number[] = [];
    const segmentTexts = await mapWithConcurrency(segments, concurrency, async (seg, i) => {
      const segmentMeta = { index: i + 1, total, startSec: seg.startSec ?? 0, endSec: seg.endSec ?? 0 };
      const segmentPrompt =
        total === 1
          ? fullPrompt
          : buildSegmentRawStoryPrompt(segmentMeta, kankaContext, { hasVoiceIntro });
      const segmentPromptWithoutIntro =
        total === 1
          ? fullPromptWithoutIntro
          : hasVoiceIntro
            ? buildSegmentRawStoryPrompt(segmentMeta, kankaContext)
            : segmentPrompt;

      let segmentText: string;
      try {
        const segmentResult = await transcribeSegment(
          googleAi,
          model,
          segmentPrompt,
          segmentPromptWithoutIntro,
          mimeType,
          seg.fileUri,
          voiceIntroParts,
          transcriptionConfig,
          googleAiKey,
          segmentationConfig.maxAttempts,
          i + 1,
          total
        );
        segmentText = segmentResult.text;
        if (segmentResult.voiceIntroDropped) {
          voiceIntroFallbackSegments.push(i + 1);
        }
        if (segmentText.trim().startsWith('ERROR:') && total > 1) {
          logger.warn(`[Fast Transcription] Segment ${i + 1}/${total} returned ${segmentText.trim()}`);
          segmentText = `[Segment ${i + 1} van ${total}: geen verstaanbare audio.]`;
        }
      } catch (segmentError) {
        // Single-pass always hard-fails; multi-segment honours the configured
        // failure policy ('fail' = sink the session, 'gap' = continue).
        if (total === 1 || segmentationConfig.onSegmentFailure === 'fail') {
          throw segmentError;
        }
        // Don't let one bad clip sink the whole session — leave a transparent gap
        // marker (never fabricate the missing content) and continue.
        logger.warn(
          `[Fast Transcription] Segment ${i + 1}/${total} failed after retries, inserting gap marker`,
          segmentError
        );
        segmentText = `[Segment ${i + 1} van ${total} kon niet worden getranscribeerd.]`;
      }

      // Gap markers and ERROR responses are control output, not log content — leave them intact.
      const isControlOutput = /^(\[Segment \d+ van \d+|ERROR:)/.test(segmentText.trim());
      if (!isControlOutput) {
        const { text, dropped } = sanitizeSessionLog(segmentText);
        if (dropped.length > 0) {
          logger.warn(
            `[Fast Transcription] Segment ${i + 1}/${total}: dropped ${dropped.length} line(s) outside the log format`,
            { sample: dropped.slice(0, 3).map((l) => l.slice(0, 200)) }
          );
        }
        segmentText =
          text.length > 0 || total === 1
            ? text
            : `[Segment ${i + 1} van ${total}: geen verstaanbare audio.]`;
      }

      completedSegments += 1;
      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'transcribing',
        70 + Math.round((completedSegments / total) * 8),
        total > 1
          ? `Transcribed ${completedSegments} of ${total} segments...`
          : 'Transcribing audio...'
      );

      return segmentText.trim();
    });

    if (voiceIntroFallbackSegments.length > 0) {
      await sessionRef.update({
        'transcriptionFast.voiceIntroFallbackSegments': voiceIntroFallbackSegments.sort((a, b) => a - b),
      });
    }

    // 5. Join segments in order into the raw story
    const rawStory = segmentTexts.join('\n\n').trim();

    // Check for error prefixes
    if (rawStory.startsWith('ERROR:')) {
      throw new Error(rawStory);
    }

    // Validate minimum length
    if (rawStory.length < 50) {
      throw new Error(`Raw story too short (${rawStory.length} chars), likely invalid`);
    }

    const processingTimeMs = Date.now() - startTime;

    logger.debug(
      `[Fast Transcription] Raw story: ${rawStory.length} characters in ${processingTimeMs}ms`
    );

    // 6. Update Firestore with raw story
    await sessionRef.update({
      rawStory,
      transcriptionCompletedAt: FieldValue.serverTimestamp(),
      'transcriptionFast.status': 'completed',
      'transcriptionFast.processingTimeMs': processingTimeMs,
      'transcriptionFast.modelUsed': model,
      'transcriptionFast.completedAt': FieldValue.serverTimestamp(),
      'modelsUsed.transcription': model,
    });

    await ProgressTrackerService.updateProgress(
      campaignId,
      sessionId,
      'transcribing',
      80,
      'Transcription complete, preparing story generation...'
    );

    logger.debug(`[Fast Transcription] Triggering story generation worker...`);

    // 7. Trigger story generation worker (pass pre-fetched Kanka context so it doesn't need to re-fetch)
    const { storyGenerationWorkerHandler } = await import(
      './workers/story-generation-worker'
    );
    await WorkerQueueService.triggerWorker(storyGenerationWorkerHandler, {
      campaignId,
      sessionId,
      transcriptionText: rawStory,
      kankaContext,
      userCorrections,
    });

    logger.debug(`[Fast Transcription] Complete for session ${sessionId}`);
  } catch (error: unknown) {
    logger.error('[Fast Transcription] Processing error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update session with failure
    await ProgressTrackerService.markFailed(
      campaignId,
      sessionId,
      'transcribing',
      errorMessage
    );

    await sessionRef.update({
      'transcriptionFast.status': 'failed',
      'transcriptionFast.error': errorMessage,
      'transcriptionFast.failedAt': FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Run `fn` over `items` with at most `limit` running at once, returning the
 * results in INPUT order (independent of completion order). If `fn` rejects,
 * the whole call rejects (used to preserve single-segment hard-fail behaviour).
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) {
        return;
      }
      results[current] = await fn(items[current], current);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

interface SegmentTranscription {
  text: string;
  /** True when the voice intro was dropped for the final (fallback) attempt. */
  voiceIntroDropped: boolean;
}

/**
 * Transcribe one audio segment via Gemini. `referenceParts` (e.g. the campaign
 * voice intro) are sent before `prompt`. If every attempt WITH reference parts
 * fails — e.g. Gemini rejects the intro audio — one final attempt is made without
 * them, using `promptWithoutReference`, so a bad voice intro can never sink the
 * session (ticket #68) and the model is never told about a reference it does not get.
 */
async function transcribeSegment(
  googleAi: GoogleGenAI,
  model: string,
  prompt: string,
  promptWithoutReference: string,
  mimeType: string,
  fileUri: string,
  referenceParts: Part[],
  config: AIFeatureConfig,
  apiKey: string,
  maxAttempts: number,
  segmentNumber: number,
  totalSegments: number
): Promise<SegmentTranscription> {
  try {
    const text = await transcribeSegmentWithRetries(
      googleAi, model, prompt, mimeType, fileUri, referenceParts,
      config, apiKey, maxAttempts, segmentNumber, totalSegments
    );
    return { text, voiceIntroDropped: false };
  } catch (error) {
    if (referenceParts.length === 0) {
      throw error;
    }
    logger.warn(
      `[Fast Transcription] Segment ${segmentNumber}/${totalSegments} failed with voice intro, retrying once without it`,
      error
    );
    captureException(error instanceof Error ? error : new Error(String(error)), {
      feature: 'voiceIntro',
      segment: `${segmentNumber}/${totalSegments}`,
    });
    const text = await transcribeSegmentWithRetries(
      googleAi, model, promptWithoutReference, mimeType, fileUri, [],
      config, apiKey, 1, segmentNumber, totalSegments
    );
    return { text, voiceIntroDropped: true };
  }
}

/**
 * Transcribe one audio segment via Gemini, with a small retry budget.
 * Waits for the Gemini file to become ACTIVE, logs usage/truncation, and
 * returns the raw response text. Throws if all attempts fail.
 */
async function transcribeSegmentWithRetries(
  googleAi: GoogleGenAI,
  model: string,
  prompt: string,
  mimeType: string,
  fileUri: string,
  referenceParts: Part[],
  config: AIFeatureConfig,
  apiKey: string,
  maxAttempts: number,
  segmentNumber: number,
  totalSegments: number
): Promise<string> {
  let lastError: unknown;
  const attempts = Math.max(1, maxAttempts);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // Gemini Files can take a short time to become ACTIVE after upload finalize.
      await waitForGeminiFileToBecomeActive(fileUri, apiKey);

      const result = await googleAi.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              ...referenceParts,
              { text: prompt },
              { fileData: { mimeType, fileUri } },
            ],
          },
        ],
        config: {
          ...buildGenerationParams(config),
        },
      });

      if (!result.text) {
        // Surface WHY Gemini returned nothing (safety block, recitation, other) — without
        // this an empty response is undiagnosable from the logs.
        const candidate = result.candidates?.[0];
        throw new Error(
          'No response text from Gemini API ' +
            JSON.stringify({
              finishReason: candidate?.finishReason,
              finishMessage: candidate?.finishMessage,
              blockReason: result.promptFeedback?.blockReason,
              blockReasonMessage: result.promptFeedback?.blockReasonMessage,
              safetyRatings: candidate?.safetyRatings?.filter((r) => r.blocked),
            })
        );
      }

      const usage = result.usageMetadata;
      const finishReason = result.candidates?.[0]?.finishReason;
      logger.info('[Fast Transcription] Gemini usage metadata', {
        segment: `${segmentNumber}/${totalSegments}`,
        promptTokenCount: usage?.promptTokenCount,
        candidatesTokenCount: usage?.candidatesTokenCount,
        totalTokenCount: usage?.totalTokenCount,
        configuredMaxOutputTokens: config.maxOutputTokens,
        finishReason,
      });

      if (finishReason === 'MAX_TOKENS') {
        logger.warn(
          `[Fast Transcription] Segment ${segmentNumber}/${totalSegments} hit maxOutputTokens — output may be truncated.`
        );
      }

      return result.text;
    } catch (error) {
      lastError = error;
      logger.warn(
        `[Fast Transcription] Segment ${segmentNumber}/${totalSegments} attempt ${attempt}/${attempts} failed`,
        error
      );
      if (attempt < attempts) {
        // Back off before retrying: transient failures (dropped sockets, empty
        // responses under load) rarely succeed on an immediate retry.
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * attempt));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function resolveMimeType(audioFileName: string): string {
  const extension = audioFileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    case 'webm':
      return 'audio/webm';
    case 'ogg':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    default:
      return 'audio/mpeg';
  }
}

async function waitForGeminiFileToBecomeActive(
  fileUri: string,
  apiKey: string
): Promise<void> {
  const maxAttempts = 15;
  const delayMs = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(`${fileUri}?key=${apiKey}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to read Gemini file state (${response.status}): ${errorText}`
      );
    }

    const payload = (await response.json()) as GeminiFileStateResponse;
    const rawState = payload.state;
    const state =
      typeof rawState === 'string'
        ? rawState
        : rawState && typeof rawState === 'object'
          ? rawState.name
          : undefined;

    logger.debug('[Fast Transcription] Gemini file state check', {
      attempt,
      maxAttempts,
      fileUri,
      state,
    });

    if (state === 'ACTIVE') {
      return;
    }

    if (state === 'FAILED') {
      throw new Error(
        `Gemini file processing failed before transcription: ${JSON.stringify(payload)}`
      );
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    `Gemini file did not become ACTIVE in time: ${fileUri}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
