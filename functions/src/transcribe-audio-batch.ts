import {GoogleGenAI} from '@google/genai';
import {CallableRequest, HttpsError, onCall} from 'firebase-functions/v2/https';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {storage} from 'firebase-admin';
import {
  AIFeatureConfig,
  AISettings,
} from './types/audio-session.types';
import {ProgressTrackerService} from './services/progress-tracker.service';
import {BatchTranscriptionMetadata} from './services/transcription-batch.service';

export interface TranscribeAudioBatchRequest {
  campaignId: string;
  sessionId: string;
  storageUrl: string;
  audioFileName: string;
  audioFileSize?: number;
  enableKankaContext?: boolean;
  userCorrections?: string;
}

export const transcribeAudioBatch = onCall(
  {
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: ['GOOGLE_AI_API_KEY', 'GEMINI_CALLBACK_SECRET'],
  },
  async (
    request: CallableRequest<TranscribeAudioBatchRequest>
  ): Promise<{success: boolean; batchJobName: string; modelUsed: string}> => {
    const {
      campaignId,
      sessionId,
      storageUrl,
      audioFileName,
      enableKankaContext,
      userCorrections,
    } = request.data;

    if (!campaignId || !sessionId || !storageUrl || !audioFileName) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: campaignId, sessionId, storageUrl, audioFileName'
      );
    }

    if (!storageUrl.startsWith('gs://')) {
      throw new HttpsError(
        'invalid-argument',
        'storageUrl must be a gs:// URL'
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

    // Fetch session document to get storage metadata
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      throw new HttpsError(
        'not-found',
        `Audio session ${sessionId} not found`
      );
    }

    await ProgressTrackerService.updateProgress(
      campaignId,
      sessionId,
      'submitted',
      30,
      'Submitting transcription batch job...'
    );

    const settingsSnap = await db.doc('settings/ai').get();
    const aiSettings = settingsSnap.data() as AISettings | undefined;

    if (!aiSettings) {
      throw new HttpsError(
        'failed-precondition',
        'AI settings not configured in database'
      );
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
    const mimeType = resolveMimeType(
      sessionSnap.data()?.storageMetadata?.contentType,
      audioFileName
    );

    const googleAi = new GoogleGenAI({apiKey: googleAiKey});
    const callbackUri = buildCallbackUri();

    if (!callbackUri) {
      console.warn(
        '[transcribeAudioBatch] Callback URL not configured; polling fallback only.'
      );
    }

    // Create JSONL request (single line JSON object per request)
    const requestJsonl = JSON.stringify({
      key: `transcription_${sessionId}`,
      request: {
        model,
        contents: [
          {
            parts: [
              {text: 'Transcribe this audio file into JSON format with segments containing timeSeconds, text, and optionally speaker fields.'},
              {
                file_data: {
                  mime_type: mimeType,
                  file_uri: storageUrl,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: transcriptionConfig.temperature,
          topK: transcriptionConfig.topK,
          topP: transcriptionConfig.topP,
          maxOutputTokens: transcriptionConfig.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      },
      metadata: {
        campaignId,
        sessionId,
      },
    });

    // Upload JSONL to Cloud Storage
    const bucket = storage().bucket();
    const inputFilePath = `batch-requests/${sessionId}-input.jsonl`;
    const outputPath = `batch-results/${sessionId}/`;

    const inputFile = bucket.file(inputFilePath);
    await inputFile.save(requestJsonl, {
      contentType: 'application/jsonl',
      metadata: {
        campaignId,
        sessionId,
      },
    });

    const inputGcsUri = `gs://${bucket.name}/${inputFilePath}`;
    const outputGcsUri = `gs://${bucket.name}/${outputPath}`;

    console.log('[transcribeAudioBatch] Created batch input file:', inputGcsUri);

    // Create batch job with GCS URIs
    // Using v2 batch API format with proper source and destination
    const batchJob = await googleAi.batches.create({
      src: {
        gcsUri: [inputGcsUri],
        format: 'jsonl',
      },
      config: {
        dest: {
          gcsUri: outputGcsUri,
          format: 'jsonl',
        },
      },
    });

    const batchJobName =
      typeof batchJob.name === 'string' ? batchJob.name : '';
    if (!batchJobName) {
      throw new HttpsError(
        'internal',
        'Batch job created without a job name'
      );
    }

    const batchMetadata: BatchTranscriptionMetadata = {
      batchJobName,
      modelUsed: model,
      generationConfig: {
        temperature: transcriptionConfig.temperature,
        topK: transcriptionConfig.topK,
        topP: transcriptionConfig.topP,
        maxOutputTokens: transcriptionConfig.maxOutputTokens,
      },
      storageUrl,
      audioFileName,
      mimeType,
      enableKankaContext: Boolean(enableKankaContext),
      userCorrections,
      inputGcsUri,
      outputGcsUri,
      submittedAt: FieldValue.serverTimestamp(),
      status: 'submitted',
    };

    await sessionRef.update({
      transcriptionBatch: batchMetadata,
      'modelsUsed.transcription': model,
    });

    await ProgressTrackerService.updateProgress(
      campaignId,
      sessionId,
      'submitted',
      40,
      'Batch job submitted. Waiting for transcription to complete...'
    );

    return {
      success: true,
      batchJobName,
      modelUsed: model,
    };
  }
);

function resolveModel(settings: AISettings, requestedModel?: string): string {
  const availableModels = settings.availableModels ?? [];
  const fallback = settings.defaultModel || 'gemini-2.5-flash';
  if (requestedModel && availableModels.length > 0) {
    return availableModels.includes(requestedModel) ? requestedModel : fallback;
  }
  return requestedModel || fallback;
}

function resolveMimeType(
  sessionContentType: string | undefined,
  audioFileName: string
): string {
  if (sessionContentType) {
    return sessionContentType;
  }

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

function buildCallbackUri(): string | null {
  return 'https://geminicallback-oeoug4az2a-ew.a.run.app';
}
