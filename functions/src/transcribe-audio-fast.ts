import * as logger from './utils/logger';
import { GoogleGenAI, Part } from '@google/genai';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { SHARED_CORS } from './config/cors';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { getAiFeatureConfig, getTranscriptionSegmentationConfig } from './utils/ai-settings';
import { generateText, getGeminiApiKey, getGeminiClient } from './utils/gemini-client';
import { AIFeatureConfig } from './types/audio-session.types';
import { TASK_WORKERS, TASK_WORKER_TIMEOUT_SECONDS, enqueueWorkerTask } from './services/task-queue.service';
import { buildRawStoryPrompt, buildSegmentRawStoryPrompt } from './audio/transcription-prompt';
import { fetchKankaContext, kankaCampaignIdFrom } from './services/kanka.service';
import { captureException, captureFunctionError, wrapCallable } from './utils/sentry-error-handler';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { assertValidId, loadSessionForMember, requireAuthUid } from './utils/access';
import { sessionRef } from './utils/session-ref';
import { sanitizeSessionLog } from './audio/session-log-sanitizer';
import {
  CampaignVoiceIntroSettings,
  VoiceIntroAudio,
  loadVoiceIntroAudio,
} from './audio/voice-intro.service';
import { buildVoiceIntroReferencePrompt } from './prompts/raw-story-transcription.prompt';
import {
  AudioRecording,
  PreparedSegment,
  prepareSegmentsFromStorage,
  sessionAudioPrefix,
} from './audio/stored-audio.service';

/** Base delay between transcription attempts of one segment (multiplied by the attempt number). */
const RETRY_BACKOFF_MS = 5000;

export interface TranscribeAudioFastRequest {
  campaignId: string;
  sessionId: string;
  /**
   * Storage path of the session's stored recording (`audioRecording` on the
   * session). The worker cuts and uploads the segments itself, so a session
   * can be re-transcribed at any time.
   */
  storagePath: string;
  audioFileName?: string;
  audioFileSize?: number;
  userCorrections?: string;
}

/**
 * Fast transcription using direct Gemini API call
 *
 * 1. Validates input (membership, the session's own recording) and updates progress
 * 2. Enqueues the work on the `transcribeAudioFastWorker` task queue
 * 3. Returns immediately to frontend (which monitors Firestore)
 *
 * The work itself runs in the task function, NOT after this callable has
 * responded: Cloud Run throttles CPU and reclaims idle instances once a
 * request has finished, which silently killed long background runs.
 */
export const transcribeAudioFast = onCall(
  {
    cors: SHARED_CORS,
    memory: '1GiB',
    secrets: ['GOOGLE_AI_API_KEY', 'KANKA_API_TOKEN'],
  },
  wrapCallable<TranscribeAudioFastRequest, { success: boolean; message: string }>(
    'transcribeAudioFast',
    async (request): Promise<{ success: boolean; message: string }> => {
      ensureAuthForTesting(request);
      const uid = requireAuthUid(request);

      const { storagePath, audioFileName, userCorrections } = request.data ?? {};
      const campaignId = assertValidId(request.data?.campaignId, 'campaignId');
      const sessionId = assertValidId(request.data?.sessionId, 'sessionId');
      if (typeof storagePath !== 'string' || storagePath.length === 0) {
        throw new HttpsError('invalid-argument', 'Missing required field: storagePath');
      }

      // Fail fast instead of enqueueing work that can never run.
      getGeminiApiKey();

      const session = await loadSessionForMember(getFirestore(), campaignId, sessionId, uid);

      // The recording must be this session's own stored file — never read an
      // arbitrary bucket path on behalf of the caller.
      const recording = session.audioRecording as AudioRecording | undefined;
      if (
        !storagePath.startsWith(sessionAudioPrefix(campaignId, sessionId)) ||
        recording?.storagePath !== storagePath
      ) {
        throw new HttpsError('invalid-argument', 'storagePath does not belong to this session');
      }

      await enqueueTranscription({
        campaignId,
        sessionId,
        recording,
        audioFileName: audioFileName || recording.fileName,
        userCorrections: userCorrections ?? null,
      });

      // Return immediately - frontend will monitor Firestore for updates
      return {
        success: true,
        message: 'Fast transcription started',
      };
    }
  ),
);

/**
 * Record the transcription metadata on the session and enqueue the
 * transcription task. Used by the callable (retry / re-transcribe) and by the
 * audio processing task once the stored recording is ready.
 */
export async function enqueueTranscription(params: {
  campaignId: string;
  sessionId: string;
  recording: AudioRecording;
  audioFileName: string;
  userCorrections: string | null;
}): Promise<void> {
  const { campaignId, sessionId, recording, audioFileName, userCorrections } = params;
  const db = getFirestore();

  // Update progress to transcribing (70-80% range)
  await ProgressTrackerService.updateProgress(
    campaignId,
    sessionId,
    'transcribing',
    70,
    'Fast transcription started...'
  );

  // Kanka + voice-intro settings, read once here and handed to the task.
  const { kankaEnabled, kankaCampaignId, voiceIntro, voiceIntroRoster } =
    await getCampaignTranscriptionSettings(campaignId);

  // Store fast transcription metadata
  await sessionRef(db, campaignId, sessionId).update({
    transcriptionFast: {
      mode: 'fast',
      enableKankaContext: kankaEnabled,
      userCorrections,
      source: 'storage',
      storagePath: recording.storagePath,
      segmentCount: 0,
      audioFileName,
      submittedAt: FieldValue.serverTimestamp(),
      status: 'processing',
    },
  });

  const payload: TranscriptionTaskPayload = {
    campaignId,
    sessionId,
    recording,
    audioFileName,
    kankaEnabled,
    kankaCampaignId: kankaCampaignId ?? null,
    voiceIntro: voiceIntro ?? null,
    voiceIntroRoster: voiceIntroRoster ?? null,
    userCorrections,
  };
  await enqueueWorkerTask(TASK_WORKERS.transcription, { ...payload });
}

/** Data handed from the callable to the transcription task (JSON-serialisable: no undefined). */
interface TranscriptionTaskPayload {
  campaignId: string;
  sessionId: string;
  /** The stored recording the segments are cut from. */
  recording: AudioRecording;
  audioFileName: string;
  kankaEnabled: boolean;
  /** Kanka campaign id from the campaign settings (saves the worker a campaign read). */
  kankaCampaignId: string | null;
  voiceIntro: CampaignVoiceIntroSettings | null;
  voiceIntroRoster: string | null;
  userCorrections: string | null;
}

/**
 * Task-queue worker that runs the transcription inside a live request, so the
 * instance stays up until it is done. Story generation runs as its own task
 * afterwards, with its own time budget.
 * Not retried by Cloud Tasks: failures are written to Firestore instead, and a
 * re-run would redo every Gemini call.
 */
export const transcribeAudioFastWorker = onTaskDispatched<TranscriptionTaskPayload>(
  {
    timeoutSeconds: TASK_WORKER_TIMEOUT_SECONDS,
    // Headroom for the stored recording + cut segments in /tmp (in-memory on Cloud Run).
    memory: '2GiB',
    secrets: ['GOOGLE_AI_API_KEY', 'KANKA_API_TOKEN'],
    retryConfig: { maxAttempts: 1 },
  },
  async (request) => {
    await processTranscriptionAsync(request.data);
  }
);

interface CampaignTranscriptionSettings {
  kankaEnabled: boolean;
  kankaCampaignId?: string;
  voiceIntro?: CampaignVoiceIntroSettings;
  /** Free-text speaking order of the voice intro, written by the campaign owner. */
  voiceIntroRoster?: string;
}

/**
 * Helper function to fetch the transcription-related campaign settings
 * (Kanka context toggle + Kanka campaign id, and voice-intro reference, ticket #68)
 */
async function getCampaignTranscriptionSettings(
  campaignId: string
): Promise<CampaignTranscriptionSettings> {
  const campaignSnap = await getFirestore().doc(`campaigns/${campaignId}`).get();

  if (!campaignSnap.exists) {
    logger.warn(`Campaign ${campaignId} not found, defaulting kankaEnabled to false`);
    return { kankaEnabled: false };
  }

  const settings = campaignSnap.data()?.settings;
  return {
    kankaEnabled: settings?.kankaEnabled ?? false,
    kankaCampaignId: kankaCampaignIdFrom(campaignSnap.data()),
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
 * Never throws: failures are written to the session in Firestore and reported
 * to Sentry once, here.
 */
async function processTranscriptionAsync(task: TranscriptionTaskPayload): Promise<void> {
  const {
    campaignId,
    sessionId,
    recording,
    audioFileName,
    kankaEnabled,
    kankaCampaignId,
    voiceIntro,
    voiceIntroRoster,
    userCorrections,
  } = task;
  const ref = sessionRef(getFirestore(), campaignId, sessionId);

  const startTime = Date.now();

  try {
    logger.debug(`[Fast Transcription] Starting for session ${sessionId}`);

    // 1. Get AI settings
    const transcriptionConfig = await getAiFeatureConfig('transcription');
    const segmentationConfig = await getTranscriptionSegmentationConfig();
    const model = transcriptionConfig.model;
    const mimeType = recording.mimeType || resolveMimeType(audioFileName);

    logger.debug(`[Fast Transcription] Using model: ${model}`);

    // 2. Fetch Kanka context if enabled
    const kankaContext = kankaEnabled
      ? await fetchKankaContext(campaignId, kankaCampaignId ?? undefined)
      : undefined;

    // 3. Load the campaign's voice intro (ticket #68). Optional and non-fatal:
    //    without it the transcription behaves exactly as before.
    const voiceIntroAudio = await loadVoiceIntroAudio(campaignId, voiceIntro ?? undefined);
    const hasVoiceIntro = voiceIntroAudio !== null;
    const voiceIntroParts = buildVoiceIntroParts(voiceIntroAudio, voiceIntroRoster ?? undefined);
    await ref.update({ 'transcriptionFast.voiceIntroUsed': hasVoiceIntro });

    // 4. Transcribe each segment with its own Gemini call, then join in order.
    //    A single segment uses the full-session prompt; multiple segments each
    //    use a segment-aware prompt and are concatenated.
    const googleAi = getGeminiClient();
    const segments = await prepareStoredSegments(googleAi, campaignId, sessionId, recording, segmentationConfig);
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
        const segmentResult = await transcribeSegment(googleAi, {
          prompt: segmentPrompt,
          promptWithoutReference: segmentPromptWithoutIntro,
          mimeType,
          segment: seg,
          referenceParts: voiceIntroParts,
          config: transcriptionConfig,
          maxAttempts: segmentationConfig.maxAttempts,
          segmentNumber: i + 1,
          totalSegments: total,
        });
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
      await ref.update({
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
    await ref.update({
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

    logger.debug(`[Fast Transcription] Enqueueing story generation task...`);

    // 7. Story generation runs as its own task (own time budget). The payload
    //    stays small: the task reads the raw story from the session and re-fetches
    //    the Kanka context itself.
    await enqueueWorkerTask(TASK_WORKERS.story, {
      campaignId,
      sessionId,
      enableKankaContext: kankaEnabled,
      userCorrections: userCorrections ?? null,
    });

    logger.debug(`[Fast Transcription] Complete for session ${sessionId}`);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    // The single Sentry event for this failure (markFailed only warns).
    captureFunctionError('transcribeAudioFastWorker', err, { campaignId, sessionId });

    // Update session with failure
    await ProgressTrackerService.markFailed(
      campaignId,
      sessionId,
      'transcribing',
      err.message
    );

    await ref.update({
      'transcriptionFast.status': 'failed',
      'transcriptionFast.error': err.message,
      'transcriptionFast.failedAt': FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Cut the stored recording into segments (using the current segmentation
 * settings), upload them to Gemini and record the segment count on the session.
 */
async function prepareStoredSegments(
  googleAi: GoogleGenAI,
  campaignId: string,
  sessionId: string,
  recording: AudioRecording,
  segmentationConfig: Awaited<ReturnType<typeof getTranscriptionSegmentationConfig>>
): Promise<PreparedSegment[]> {
  await ProgressTrackerService.updateProgress(
    campaignId, sessionId, 'transcribing', 70, 'Preparing stored audio...'
  );

  const segments = await prepareSegmentsFromStorage(
    googleAi,
    recording,
    segmentationConfig,
    (uploaded, total) => ProgressTrackerService.updateProgress(
      campaignId, sessionId, 'transcribing', 70,
      total > 1 ? `Preparing audio segment ${uploaded} of ${total}...` : 'Preparing stored audio...'
    )
  );

  await sessionRef(getFirestore(), campaignId, sessionId).update({
    'transcriptionFast.segmentCount': segments.length,
  });

  return segments;
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

interface SegmentRequest {
  prompt: string;
  /** Prompt for the fallback attempt without `referenceParts`. */
  promptWithoutReference: string;
  mimeType: string;
  segment: PreparedSegment;
  referenceParts: Part[];
  config: AIFeatureConfig;
  maxAttempts: number;
  segmentNumber: number;
  totalSegments: number;
}

/**
 * Transcribe one audio segment via Gemini. `referenceParts` (e.g. the campaign
 * voice intro) are sent before `prompt`. If every attempt WITH reference parts
 * fails — e.g. Gemini rejects the intro audio — one final attempt is made without
 * them, using `promptWithoutReference`, so a bad voice intro can never sink the
 * session (ticket #68) and the model is never told about a reference it does not get.
 */
async function transcribeSegment(googleAi: GoogleGenAI, req: SegmentRequest): Promise<SegmentTranscription> {
  try {
    const text = await transcribeSegmentWithRetries(googleAi, req);
    return { text, voiceIntroDropped: false };
  } catch (error) {
    if (req.referenceParts.length === 0) {
      throw error;
    }
    logger.warn(
      `[Fast Transcription] Segment ${req.segmentNumber}/${req.totalSegments} failed with voice intro, retrying once without it`,
      error
    );
    captureException(error instanceof Error ? error : new Error(String(error)), {
      feature: 'voiceIntro',
      segment: `${req.segmentNumber}/${req.totalSegments}`,
    });
    const text = await transcribeSegmentWithRetries(googleAi, {
      ...req,
      prompt: req.promptWithoutReference,
      referenceParts: [],
      maxAttempts: 1,
    });
    return { text, voiceIntroDropped: true };
  }
}

/**
 * Transcribe one audio segment via Gemini, with a small retry budget.
 * Waits for the Gemini file to become ACTIVE and returns the raw response
 * text (usage/truncation are logged by the shared client). Throws if all attempts fail.
 */
async function transcribeSegmentWithRetries(googleAi: GoogleGenAI, req: SegmentRequest): Promise<string> {
  const { segment, segmentNumber, totalSegments } = req;
  let lastError: unknown;
  const attempts = Math.max(1, req.maxAttempts);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // Gemini Files can take a short time to become ACTIVE after upload finalize.
      await waitForGeminiFileToBecomeActive(googleAi, segment.fileName);

      return await generateText(
        {
          config: req.config,
          label: '[Fast Transcription]',
          logContext: { segment: `${segmentNumber}/${totalSegments}` },
          contents: [
            {
              role: 'user',
              parts: [
                ...req.referenceParts,
                { text: req.prompt },
                { fileData: { mimeType: req.mimeType, fileUri: segment.fileUri } },
              ],
            },
          ],
        },
        googleAi
      );
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

/**
 * Poll the Gemini Files API (via the SDK, so the API key never ends up in a
 * URL) until the uploaded segment is ACTIVE.
 */
async function waitForGeminiFileToBecomeActive(googleAi: GoogleGenAI, fileName: string): Promise<void> {
  const maxAttempts = 15;
  const delayMs = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const file = await googleAi.files.get({ name: fileName });
    const state = file.state as string | undefined;

    logger.debug('[Fast Transcription] Gemini file state check', {
      attempt,
      maxAttempts,
      fileName,
      state,
    });

    if (state === 'ACTIVE') {
      return;
    }

    if (state === 'FAILED') {
      throw new Error(
        `Gemini file processing failed before transcription: ${JSON.stringify(file.error ?? {})}`
      );
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(`Gemini file did not become ACTIVE in time: ${fileName}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
