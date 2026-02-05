import {HttpsError} from 'firebase-functions/v2/https';
import {getFirestore} from 'firebase-admin/firestore';
import {GoogleGenAI, Type} from '@google/genai';
import {ProgressTrackerService} from '../services/progress-tracker.service';
import {WorkerQueueService, WorkerPayload} from '../services/worker-queue.service';
import {AudioChunkingService} from '../audio/chunking.service';
import {
  AIFeatureConfig,
  AISettings,
  KankaSearchResult,
  TranscriptionSegment,
} from '../types/audio-session.types';
import {AUDIO_TRANSCRIPTION_PROMPT} from '../prompts/audio-transcription.prompt';

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

export interface AudioChunkInfo {
  index: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  audioPath: string;
}

export interface TranscriptionWorkerPayload extends WorkerPayload {
  campaignId: string;
  sessionId: string;
  chunks: AudioChunkInfo[];
  totalDurationSeconds: number;
  audioFileName: string;
  enableKankaContext?: boolean;
  userCorrections?: string;
}

/**
 * Transcription Worker Handler: The actual processing logic
 */
export const transcriptionWorkerHandler = async (data: WorkerPayload) => {
    const {
      campaignId,
      sessionId,
      chunks,
      enableKankaContext,
      userCorrections,
    } = data as TranscriptionWorkerPayload;

    if (!campaignId || !sessionId || !chunks || chunks.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: campaignId, sessionId, chunks'
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

    try {
      // Update progress: Starting transcription (40%)
      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'transcribing',
        40,
        'Loading AI settings...'
      );

      // Load AI settings
      const settingsSnap = await db.doc('settings/ai').get();
      const aiSettings = settingsSnap.data() as AISettings | undefined;

      if (!aiSettings) {
        throw new Error('AI settings not configured in database');
      }

      const transcriptionConfig = aiSettings.features?.transcription || {
        model: aiSettings.defaultModel,
        temperature: 0.3,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 128000,
      };

      // Load Kanka context if enabled
      let kankaContext: KankaSearchResult | undefined;
      if (enableKankaContext) {
        const sessionSnap = await sessionRef.get();
        const sessionData = sessionSnap.data();
        kankaContext = sessionData?.kankaSearchResult as
          | KankaSearchResult
          | undefined;
      }

      console.log(
        `[TranscriptionWorker] Transcribing ${chunks.length} chunk(s)...`
      );

      // Initialize Google AI
      const googleAi = new GoogleGenAI({apiKey: googleAiKey});

      // Transcribe each chunk
      const chunkResults: Array<{
        chunk: AudioChunkInfo;
        segments: TranscriptionSegment[];
      }> = [];

      const progressPerChunk = 40 / chunks.length; // 40-80% progress range

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const progress = 40 + (i + 1) * progressPerChunk;

        await ProgressTrackerService.updateProgress(
          campaignId,
          sessionId,
          'transcribing',
          Math.round(progress),
          `Transcribing chunk ${i + 1}/${chunks.length}...`
        );

        console.log(`[TranscriptionWorker] Chunk ${i + 1}/${chunks.length}...`);

        const chunkPrompt = buildChunkPrompt(chunk, chunks.length, kankaContext);
        const segments = await transcribeChunk(
          googleAi,
          chunk.audioPath,
          transcriptionConfig,
          chunkPrompt
        );

        // Adjust timestamps to absolute position
        const adjustedSegments = segments.map(seg => ({
          ...seg,
          timeSeconds:
            seg.timeSeconds < chunk.startTimeSeconds - 5
              ? seg.timeSeconds + chunk.startTimeSeconds
              : seg.timeSeconds,
        }));

        chunkResults.push({chunk, segments: adjustedSegments});
      }

      // Merge all chunks
      const allSegments = chunkResults.flatMap(r => r.segments);
      allSegments.sort((a, b) => a.timeSeconds - b.timeSeconds);

      const timestamps = allSegments.map(seg => ({
        time: Math.max(0, Math.round(seg.timeSeconds)),
        text: seg.speaker ? `${seg.speaker}: ${seg.text}` : seg.text,
      }));

      const transcriptionText = timestamps
        .map(entry => `[${formatTimestamp(entry.time)}] ${entry.text}`)
        .join('\n');

      console.log(
        `[TranscriptionWorker] Transcription complete: ${timestamps.length} segments`
      );

      // Save transcription to Firestore
      await sessionRef.update({
        transcriptionText,
        timestamps,
        transcriptionCompletedAt: new Date().toISOString(),
      });

      // Clean up chunk files
      chunks.forEach(chunk => AudioChunkingService.cleanupTempFile(chunk.audioPath));

      // Update progress: Transcription complete (80%)
      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'transcribing',
        80,
        'Transcription complete, preparing story generation...'
      );

      // Trigger next worker: Story Generation
      // Import dynamically to avoid circular dependency
      const {storyGenerationWorkerHandler} = await import(
        './story-generation-worker'
      );
      await WorkerQueueService.triggerWorker(storyGenerationWorkerHandler, {
        campaignId,
        sessionId,
        transcriptionText,
        enableKankaContext,
        userCorrections,
      });

      console.log(
        `[TranscriptionWorker] Triggered story generation worker for ${sessionId}`
      );
    } catch (error) {
      console.error(
        `[TranscriptionWorker] Error for session ${sessionId}:`,
        error
      );

      // Clean up chunk files on error
      try {
        chunks.forEach(chunk => AudioChunkingService.cleanupTempFile(chunk.audioPath));
      } catch (cleanupError) {
        console.error('[TranscriptionWorker] Cleanup error:', cleanupError);
      }

      await ProgressTrackerService.markFailed(
        campaignId,
        sessionId,
        'transcribing',
        error as Error
      );
      throw error;
    }
};

/**
 * Transcription Worker: Cloud Function wrapper
 *
 * Chain: download → chunk → transcribe → generate story
 */
export const transcriptionWorker = WorkerQueueService.createWorker(
  'transcriptionWorker',
  transcriptionWorkerHandler
);

/**
 * Transcribes a single audio chunk
 */
async function transcribeChunk(
  googleAi: GoogleGenAI,
  audioPath: string,
  config: AIFeatureConfig,
  prompt: string
): Promise<TranscriptionSegment[]> {
  const base64Audio = AudioChunkingService.fileToBase64(audioPath);

  const response = await googleAi.models.generateContent({
    model: config.model,
    contents: [
      {
        role: 'user',
        parts: [
          {inlineData: {mimeType: 'audio/wav', data: base64Audio}},
          {text: prompt},
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: TRANSCRIPTION_SCHEMA,
      maxOutputTokens: config.maxOutputTokens,
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
    },
  });

  if (!response.text) {
    throw new Error('No response from transcription model');
  }

  const result = JSON.parse(response.text);

  if (result.error) {
    throw new Error(result.message || 'Audio processing failed');
  }

  if (
    !result.segments ||
    !Array.isArray(result.segments) ||
    result.segments.length === 0
  ) {
    throw new Error('No valid transcription segments returned');
  }

  return result.segments;
}

/**
 * Builds prompt for audio chunk with temporal context
 */
function buildChunkPrompt(
  chunk: AudioChunkInfo,
  totalChunks: number,
  kankaContext?: KankaSearchResult
): string {
  const startTimestamp = formatTimestamp(chunk.startTimeSeconds);
  const endTimestamp = formatTimestamp(chunk.endTimeSeconds);
  const basePrompt = buildTranscriptionPrompt(kankaContext);

  return `${basePrompt}

CHUNK CONTEXT:
- This is chunk ${chunk.index + 1} of ${totalChunks} in a longer recording.
- This chunk covers ${startTimestamp} to ${endTimestamp} from the full session start.
- All timestamps must be relative to the FULL session start, not this chunk's start.
- If someone speaks 30 seconds into this chunk, timestamp should be ${formatTimestamp(
    Math.round(chunk.startTimeSeconds + 30)
  )}.`;
}

/**
 * Builds transcription prompt with optional Kanka context
 */
function buildTranscriptionPrompt(kankaContext?: KankaSearchResult): string {
  if (!kankaContext || Object.keys(kankaContext).length === 0) {
    return AUDIO_TRANSCRIPTION_PROMPT;
  }

  const contextPrompt = buildKankaContextPrompt(kankaContext);
  return `${AUDIO_TRANSCRIPTION_PROMPT}\n\n${contextPrompt}`;
}

/**
 * Formats Kanka context for prompt injection
 */
function buildKankaContextPrompt(context: KankaSearchResult): string {
  const sections: string[] = [];

  const addSection = (
    label: string,
    entities:
      | Array<{name: string; entry?: string; entry_parsed?: string}>
      | undefined
  ) => {
    if (!entities?.length) {
      return;
    }
    const names = entities.map(entity => entity.name).join(', ');
    sections.push(`${label}: ${names}`);
  };

  addSection('Characters', context.characters);
  addSection('Locations', context.locations);
  addSection('Quests', context.quests);
  addSection('Organisations', context.organisations);

  if (sections.length === 0) {
    return '';
  }

  return `CAMPAIGN REFERENCE (for name/place accuracy only):
${sections.join('\n')}

Remember: Use this context ONLY to spell names and places correctly when you hear them. Do not add information that wasn't spoken.`;
}

/**
 * Formats seconds to MM:SS timestamp
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
}
