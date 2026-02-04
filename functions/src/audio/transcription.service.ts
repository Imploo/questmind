import { GoogleGenAI, Type } from '@google/genai';
import { AudioChunkingService, AudioChunk, CHUNK_DURATION_SECONDS } from './chunking.service';
import {
  AIFeatureConfig,
  KankaSearchResult,
  TranscriptionSegment
} from '../types/audio-session.types';
import { AUDIO_TRANSCRIPTION_PROMPT } from '../prompts/audio-transcription.prompt';

const TRANSCRIPTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    error: { type: Type.STRING },
    message: { type: Type.STRING },
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timeSeconds: { type: Type.NUMBER },
          text: { type: Type.STRING },
          speaker: { type: Type.STRING }
        },
        required: ['timeSeconds', 'text']
      }
    }
  }
};

export interface TranscriptionResult {
  transcriptionText: string;
  timestamps: Array<{ time: number; text: string }>;
}

/**
 * Transcribes an audio file from Firebase Storage
 * Handles both single-file and chunked transcription for long audio
 *
 * @param audioStorageUrl - Full URL to audio file in Firebase Storage
 * @param audioFileName - Original filename for temp storage
 * @param config - AI model configuration
 * @param kankaContext - Optional campaign context for accuracy
 * @returns Transcription text with timestamps
 */
export async function transcribeAudioFile(
  audioStorageUrl: string,
  audioFileName: string,
  config: AIFeatureConfig,
  kankaContext?: KankaSearchResult
): Promise<TranscriptionResult> {
  const googleAiKey = process.env.GOOGLE_AI_API_KEY;
  if (!googleAiKey) {
    throw new Error('Google AI API key not configured');
  }

  const googleAi = new GoogleGenAI({ apiKey: googleAiKey });
  let tempAudioPath: string | null = null;
  let chunks: AudioChunk[] = [];

  try {
    // Download audio to temp location
    console.log('Downloading audio file...');
    tempAudioPath = await AudioChunkingService.downloadAudioToTemp(audioStorageUrl, audioFileName);
    const audioDuration = await AudioChunkingService.getAudioDuration(tempAudioPath);

    console.log(`Audio duration: ${Math.round(audioDuration)}s (${(audioDuration / 60).toFixed(1)} minutes)`);

    let transcriptionText: string;
    let timestamps: Array<{ time: number; text: string }>;

    if (audioDuration > CHUNK_DURATION_SECONDS) {
      // Chunked transcription for long audio
      console.log('Audio exceeds chunk limit, splitting into chunks...');
      chunks = await AudioChunkingService.splitAudioIntoChunks(tempAudioPath, audioDuration);

      const chunkResults: Array<{ chunk: AudioChunk; segments: TranscriptionSegment[] }> = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`Transcribing chunk ${i + 1}/${chunks.length}...`);

        const chunkPrompt = buildChunkPrompt(chunk, chunks.length, kankaContext);
        const segments = await transcribeChunk(googleAi, chunk.audioPath, config, chunkPrompt);

        // Adjust timestamps to absolute position
        const adjustedSegments = segments.map(seg => ({
          ...seg,
          timeSeconds: seg.timeSeconds < chunk.startTimeSeconds - 5
            ? seg.timeSeconds + chunk.startTimeSeconds
            : seg.timeSeconds
        }));

        chunkResults.push({ chunk, segments: adjustedSegments });
      }

      // Merge all chunks
      const allSegments = chunkResults.flatMap(r => r.segments);
      allSegments.sort((a, b) => a.timeSeconds - b.timeSeconds);

      timestamps = allSegments.map(seg => ({
        time: Math.max(0, Math.round(seg.timeSeconds)),
        text: seg.speaker ? `${seg.speaker}: ${seg.text}` : seg.text
      }));

      transcriptionText = timestamps
        .map(entry => `[${formatTimestamp(entry.time)}] ${entry.text}`)
        .join('\n');

    } else {
      // Single transcription for shorter audio
      console.log('Transcribing audio...');

      const prompt = buildTranscriptionPrompt(kankaContext);
      const segments = await transcribeChunk(googleAi, tempAudioPath, config, prompt);

      timestamps = segments.map(seg => ({
        time: Math.max(0, Math.round(seg.timeSeconds)),
        text: seg.speaker ? `${seg.speaker}: ${seg.text}` : seg.text
      }));

      transcriptionText = timestamps
        .map(entry => `[${formatTimestamp(entry.time)}] ${entry.text}`)
        .join('\n');
    }

    console.log(`Transcription complete: ${timestamps.length} segments`);

    return {
      transcriptionText,
      timestamps
    };

  } finally {
    // Cleanup temp files
    if (tempAudioPath) {
      AudioChunkingService.cleanupTempFile(tempAudioPath);
    }
    if (chunks.length > 0) {
      AudioChunkingService.cleanupChunks(chunks);
    }
  }
}

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
          { inlineData: { mimeType: 'audio/wav', data: base64Audio } },
          { text: prompt }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: TRANSCRIPTION_SCHEMA,
      maxOutputTokens: config.maxOutputTokens,
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK
    }
  });

  if (!response.text) {
    throw new Error('No response from transcription model');
  }

  const result = JSON.parse(response.text);

  if (result.error) {
    throw new Error(result.message || 'Audio processing failed');
  }

  if (!result.segments || !Array.isArray(result.segments) || result.segments.length === 0) {
    throw new Error('No valid transcription segments returned');
  }

  return result.segments;
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
 * Builds prompt for audio chunk with temporal context
 */
function buildChunkPrompt(
  chunk: AudioChunk,
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
 * Formats Kanka context for prompt injection
 */
function buildKankaContextPrompt(context: KankaSearchResult): string {
  const sections: string[] = [];

  const addSection = (
    label: string,
    entities: Array<{ name: string; entry?: string; entry_parsed?: string }> | undefined
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
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}
