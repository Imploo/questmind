import * as logger from './utils/logger';
import { GoogleGenAI } from '@google/genai';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { getAiFeatureConfig, getTranscriptionSegmentationConfig } from './utils/ai-settings';
import { buildGenerationParams } from './utils/gemini-config';
import { AIFeatureConfig } from './types/audio-session.types';
import { WorkerQueueService } from './services/worker-queue.service';
import { buildRawStoryPrompt, buildSegmentRawStoryPrompt } from './audio/transcription-prompt';
import { fetchKankaContextForTranscription } from './services/kanka.service';
import { wrapCallable } from './utils/sentry-error-handler';

/** One audio segment to transcribe (a time-slice of a longer recording). */
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
 * This function uses a fire-and-forget pattern:
 * 1. Validates input and updates progress
 * 2. Returns immediately to frontend
 * 3. Processes transcription asynchronously in background
 * 4. Updates Firestore with results
 * 5. Triggers story generation when complete
 */
export const transcribeAudioFast = onCall(
  {
    // Segmented transcription runs several Gemini calls back-to-back in the
    // background, so give the instance room to live long enough to finish them.
    timeoutSeconds: 1200,
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

    // Fetch Kanka enabled setting from campaign settings
    const kankaEnabled = await getCampaignKankaEnabled(campaignId);

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

    // Start async processing (don't await - fire and forget)
    processTranscriptionAsync(
      campaignId,
      sessionId,
      segments,
      audioFileName,
      kankaEnabled,
      userCorrections,
      googleAiKey
    ).catch((error) => {
      logger.error('[transcribeAudioFast] Async processing failed:', error);
      // Error will be written to Firestore by processTranscriptionAsync
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
 * Helper function to fetch Kanka enabled setting from campaign settings
 */
async function getCampaignKankaEnabled(campaignId: string): Promise<boolean> {
  const db = getFirestore();
  const campaignRef = db.collection('campaigns').doc(campaignId);
  const campaignSnap = await campaignRef.get();

  if (!campaignSnap.exists) {
    logger.warn(`Campaign ${campaignId} not found, defaulting kankaEnabled to false`);
    return false;
  }

  const campaignData = campaignSnap.data();
  return campaignData?.settings?.kankaEnabled ?? false;
}

/**
 * Process transcription asynchronously in the background
 */
async function processTranscriptionAsync(
  campaignId: string,
  sessionId: string,
  segments: AudioSegmentRef[],
  audioFileName: string,
  enableKankaContext: boolean,
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

    // 3. Transcribe each segment with its own Gemini call, then join in order.
    //    A single segment (the common/legacy case) uses the full-session prompt;
    //    multiple segments each use a segment-aware prompt and are concatenated.
    const googleAi = new GoogleGenAI({ apiKey: googleAiKey });
    const fullPrompt = buildRawStoryPrompt(kankaContext);
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
    const segmentTexts = await mapWithConcurrency(segments, concurrency, async (seg, i) => {
      const segmentPrompt =
        total === 1
          ? fullPrompt
          : buildSegmentRawStoryPrompt(
              { index: i + 1, total, startSec: seg.startSec ?? 0, endSec: seg.endSec ?? 0 },
              kankaContext
            );

      let segmentText: string;
      try {
        segmentText = await transcribeSegment(
          googleAi,
          model,
          segmentPrompt,
          mimeType,
          seg.fileUri,
          transcriptionConfig,
          googleAiKey,
          segmentationConfig.maxAttempts,
          i + 1,
          total
        );
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

/**
 * Transcribe one audio segment via Gemini, with a small retry budget.
 * Waits for the Gemini file to become ACTIVE, logs usage/truncation, and
 * returns the raw response text. Throws if all attempts fail.
 */
async function transcribeSegment(
  googleAi: GoogleGenAI,
  model: string,
  prompt: string,
  mimeType: string,
  fileUri: string,
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
        throw new Error('No response text from Gemini API');
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
