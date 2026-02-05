import {GoogleGenAI, Type} from '@google/genai';
import {CallableRequest, HttpsError, onCall} from 'firebase-functions/v2/https';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {buildTranscriptionPrompt} from './audio/transcription-prompt';
import {
  AIFeatureConfig,
  AISettings,
  KankaSearchResult,
} from './types/audio-session.types';
import {ProgressTrackerService} from './services/progress-tracker.service';
import {BatchTranscriptionMetadata} from './services/transcription-batch.service';

const TRANSCRIPTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    error: {type: Type.STRING},
    message: {type: Type.STRING},
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timeSeconds: {type: Type.NUMBER},
          text: {type: Type.STRING},
          speaker: {type: Type.STRING},
        },
        required: ['timeSeconds', 'text'],
      },
    },
  },
};

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
    region: 'europe-west4',
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

    const sessionSnap = await sessionRef.get();
    const sessionData = sessionSnap.data();
    const kankaContext = enableKankaContext
      ? (sessionData?.kankaSearchResult as KankaSearchResult | undefined)
      : undefined;

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
    const prompt = buildTranscriptionPrompt(kankaContext);
    const mimeType = resolveMimeType(
      sessionData?.storageMetadata?.contentType,
      audioFileName
    );

    const googleAi = new GoogleGenAI({apiKey: googleAiKey});
    const callbackUri = buildCallbackUri();
    const callbackSecret = process.env.GEMINI_CALLBACK_SECRET;

    if (!callbackUri) {
      console.warn(
        '[transcribeAudioBatch] Callback URL not configured; polling fallback only.'
      );
    }

    const batchRequest = {
      model,
      src: [
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  fileData: {
                    fileUri: storageUrl,
                    mimeType,
                  },
                },
                {text: 'Transcribe this audio.'},
              ],
            },
          ],
          config: {
            systemInstruction: {
              parts: [{text: prompt}],
            },
            responseMimeType: 'application/json',
            responseSchema: TRANSCRIPTION_SCHEMA,
            temperature: transcriptionConfig.temperature,
            topK: transcriptionConfig.topK,
            topP: transcriptionConfig.topP,
            maxOutputTokens: transcriptionConfig.maxOutputTokens,
          },
          metadata: {
            campaignId,
            sessionId,
          },
        },
      ],
      config: {
        displayName: `transcription-${sessionId}`,
        callbackUri: callbackUri || undefined,
        callbackSecret: callbackSecret || undefined,
      },
    } as Parameters<typeof googleAi.batches.create>[0];

    const batchJob = await googleAi.batches.create(batchRequest);

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
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!projectId) {
    return null;
  }
  return `https://europe-west4-${projectId}.cloudfunctions.net/geminiCallback`;
}
