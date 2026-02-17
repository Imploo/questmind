import * as logger from './utils/logger';
import { GoogleGenAI } from '@google/genai';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { AIFeatureConfig, AISettings } from './types/audio-session.types';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { WorkerQueueService } from './services/worker-queue.service';
import { buildRawStoryPrompt } from './audio/transcription-prompt';
import { fetchKankaContextForTranscription } from './services/kanka.service';
import { wrapCallable } from './utils/sentry-error-handler';

export interface TranscribeAudioFastRequest {
  campaignId: string;
  sessionId: string;
  fileUri: string;
  audioFileName: string;
  audioFileSize?: number;
  userCorrections?: string;
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
    secrets: ['GOOGLE_AI_API_KEY', 'KANKA_API_TOKEN'],
  },
  wrapCallable<TranscribeAudioFastRequest, { success: boolean; message: string }>(
    'transcribeAudioFast',
    async (request): Promise<{ success: boolean; message: string }> => {
    const {
      campaignId,
      sessionId,
      fileUri,
      audioFileName,
      userCorrections,
    } = request.data;

    // Validate required fields
    if (!campaignId || !sessionId || !fileUri || !audioFileName) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: campaignId, sessionId, fileUri, audioFileName'
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

    // Update progress to transcribing (fire-and-forget starts here)
    await ProgressTrackerService.updateProgress(
      campaignId,
      sessionId,
      'transcribing',
      40,
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
        fileUri,
        audioFileName,
        submittedAt: FieldValue.serverTimestamp(),
        status: 'processing',
      },
    });

    // Start async processing (don't await - fire and forget)
    processTranscriptionAsync(
      campaignId,
      sessionId,
      fileUri,
      audioFileName,
      kankaEnabled,
      userCorrections
    ).catch((error) => {
      console.error('[transcribeAudioFast] Async processing failed:', error);
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
  fileUri: string,
  audioFileName: string,
  enableKankaContext: boolean,
  userCorrections?: string
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
    const settingsSnap = await db.doc('settings/ai').get();
    const aiSettings = settingsSnap.data() as AISettings | undefined;

    if (!aiSettings) {
      throw new Error('AI settings not configured in database');
    }

    const transcriptionConfig: AIFeatureConfig = aiSettings.features
      ?.transcription ?? {
      model: aiSettings.defaultModel,
      temperature: 0.1,
      topP: 1,
      topK: 40,
      maxOutputTokens: 128000,
    };

    const model = resolveModel(aiSettings, transcriptionConfig.model);
    const mimeType = resolveMimeType(audioFileName);

    logger.debug(`[Fast Transcription] Using model: ${model}`);

    // 2. Fetch Kanka context if enabled
    const kankaContext = await fetchKankaContextForTranscription(
      campaignId,
      sessionId,
      enableKankaContext
    );

    // 3. Call Gemini API with the Files API URI
    const googleAi = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });

    const prompt = buildRawStoryPrompt(kankaContext);

    // Gemini Files can take a short time to become ACTIVE after upload finalize.
    await waitForGeminiFileToBecomeActive(fileUri, process.env.GOOGLE_AI_API_KEY!);

    logger.debug(`[Fast Transcription] Calling Gemini API with request:`, {
      model,
      config: {
        temperature: transcriptionConfig.temperature,
        topK: transcriptionConfig.topK,
        topP: transcriptionConfig.topP,
        maxOutputTokens: transcriptionConfig.maxOutputTokens,
      },
      prompt: prompt,
      hasKankaContext: !!kankaContext,
      mimeType,
    });

    const result = await googleAi.models.generateContent({
      model: model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              fileData: {
                mimeType: mimeType,
                fileUri: fileUri,
              },
            },
          ],
        },
      ],
      config: {
        temperature: transcriptionConfig.temperature,
        topK: transcriptionConfig.topK,
        topP: transcriptionConfig.topP,
        maxOutputTokens: transcriptionConfig.maxOutputTokens,
      },
    });

    if (!result.text) {
      throw new Error('No response text from Gemini API');
    }

    const text = result.text;

    // Log usage metadata to detect output token truncation
    const usage = result.usageMetadata;
    const finishReason = result.candidates?.[0]?.finishReason;
    logger.info('[Fast Transcription] Gemini usage metadata', {
      promptTokenCount: usage?.promptTokenCount,
      candidatesTokenCount: usage?.candidatesTokenCount,
      totalTokenCount: usage?.totalTokenCount,
      configuredMaxOutputTokens: transcriptionConfig.maxOutputTokens,
      finishReason,
    });

    if (finishReason === 'MAX_TOKENS') {
      logger.warn('[Fast Transcription] Response was truncated — output hit maxOutputTokens limit. Transcription may be incomplete.');
    }

    logger.debug(`[Fast Transcription] Received response, processing...`);

    // 5. Process raw story response
    const rawStory = text.trim();

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
      'transcription.rawTranscript': rawStory,
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

    // 7. Trigger story generation worker
    const { storyGenerationWorkerHandler } = await import(
      './workers/story-generation-worker'
    );
    await WorkerQueueService.triggerWorker(storyGenerationWorkerHandler, {
      campaignId,
      sessionId,
      transcriptionText: rawStory,
      enableKankaContext,
      userCorrections,
    });

    logger.debug(`[Fast Transcription] Complete for session ${sessionId}`);
  } catch (error: any) {
    console.error('[Fast Transcription] Processing error:', error);

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

function resolveModel(settings: AISettings, requestedModel?: string): string {
  const availableModels = settings.availableModels ?? [];
  const fallback = settings.defaultModel || 'gemini-2.0-flash-exp';
  if (requestedModel && availableModels.length > 0) {
    return availableModels.includes(requestedModel) ? requestedModel : fallback;
  }
  return requestedModel || fallback;
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
