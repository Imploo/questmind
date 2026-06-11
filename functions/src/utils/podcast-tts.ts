import { GoogleGenAI, Modality } from '@google/genai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Readable } from 'stream';
import * as logger from './logger';
import { PodcastVoiceSettings } from '../types/audio-session.types';
import { pcmToMp3, parsePcmSampleRate, DEFAULT_PCM_SAMPLE_RATE } from './pcm-to-mp3';

export interface PodcastSegment {
  speaker: 'host1' | 'host2';
  text: string;
}

/** Speaker labels used both in the dialog text and the Gemini multi-speaker config. */
const SPEAKER_LABELS: Record<'host1' | 'host2', string> = {
  host1: 'HOST1',
  host2: 'HOST2',
};

/**
 * Natural-language style instruction prepended to the Gemini TTS input.
 * Steers tone/tempo without SSML — this is the Gemini equivalent of what
 * ElevenLabs' `eleven_v3` did implicitly.
 */
const GEMINI_STYLE_INSTRUCTION =
  'Lees het volgende voor als een enthousiaste, informele Nederlandse podcast met twee hosts. ' +
  'Houd het tempo vlot en de intonatie levendig, met natuurlijke overgangen tussen de sprekers.';

/**
 * Max characters per Gemini TTS request. The official docs warn that speech
 * quality drifts on outputs longer than a few minutes, so we chunk long
 * scripts on turn boundaries and concatenate the PCM before encoding once.
 */
const GEMINI_CHUNK_CHAR_LIMIT = 3000;

/** Legacy ElevenLabs voice IDs (fallback when none configured). */
const DEFAULT_ELEVENLABS_VOICES: Record<'host1' | 'host2', string> = {
  host1: process.env.ELEVENLABS_HOST1_VOICE || 'tvFp0BgJPrEXGoDhDIA4', // Thomas
  host2: process.env.ELEVENLABS_HOST2_VOICE || '7qdUFMklKPaaAVMsBTBt', // Roos
};

/** Reports audio-generation progress (0-100) with a user-facing message. */
export type ProgressFn = (progress: number, message: string) => Promise<void> | void;

/**
 * Generate podcast audio for a dialog script and return an MP3 buffer.
 *
 * Picks the TTS provider from `voiceConfig.ttsProvider` so we can fall back to
 * ElevenLabs without a deploy while the Gemini TTS preview models prove out.
 */
export async function generatePodcastAudioBuffer(
  segments: PodcastSegment[],
  voiceConfig: PodcastVoiceSettings,
  onProgress?: ProgressFn
): Promise<Buffer> {
  if (voiceConfig.ttsProvider === 'gemini') {
    return generateGeminiAudio(segments, voiceConfig, onProgress);
  }
  return generateElevenLabsAudio(segments, voiceConfig, onProgress);
}

/**
 * Group segments into chunks no larger than `maxChars`, never splitting a
 * single turn. Keeping cuts on turn boundaries avoids mid-sentence audio seams.
 */
export function chunkSegmentsByChars(segments: PodcastSegment[], maxChars: number): PodcastSegment[][] {
  const chunks: PodcastSegment[][] = [];
  let current: PodcastSegment[] = [];
  let currentChars = 0;

  for (const seg of segments) {
    if (current.length > 0 && currentChars + seg.text.length > maxChars) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(seg);
    currentChars += seg.text.length;
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
}

/** Render segments as a speaker-labelled transcript for Gemini multi-speaker TTS. */
export function buildDialogText(segments: PodcastSegment[]): string {
  return segments.map(seg => `${SPEAKER_LABELS[seg.speaker]}: ${seg.text}`).join('\n');
}

async function generateGeminiAudio(
  segments: PodcastSegment[],
  voiceConfig: PodcastVoiceSettings,
  onProgress?: ProgressFn
): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Google AI API key is not configured');
  }

  const model = voiceConfig.geminiModel || 'gemini-3.1-flash-tts-preview';
  const googleAi = new GoogleGenAI({ apiKey });
  const chunks = chunkSegmentsByChars(segments, GEMINI_CHUNK_CHAR_LIMIT);

  logger.debug(
    `Generating podcast audio via Gemini TTS (${segments.length} segments, ${chunks.length} chunk(s), model=${model})`
  );

  const pcmChunks: Buffer[] = [];
  let sampleRate = DEFAULT_PCM_SAMPLE_RATE;

  for (let i = 0; i < chunks.length; i++) {
    await onProgress?.(
      65 + Math.round((i / chunks.length) * 10),
      `Generating podcast audio with Gemini (part ${i + 1}/${chunks.length})...`
    );

    const promptText = `${GEMINI_STYLE_INSTRUCTION}\n\n${buildDialogText(chunks[i])}`;

    const response = await googleAi.models.generateContent({
      model,
      contents: [{ parts: [{ text: promptText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: SPEAKER_LABELS.host1,
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceConfig.host1VoiceName } },
              },
              {
                speaker: SPEAKER_LABELS.host2,
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceConfig.host2VoiceName } },
              },
            ],
          },
        },
      },
    });

    const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) {
      throw new Error('No audio data returned from Gemini TTS');
    }
    pcmChunks.push(Buffer.from(inlineData.data, 'base64'));
    sampleRate = parsePcmSampleRate(inlineData.mimeType);
  }

  const pcmBuffer = Buffer.concat(pcmChunks);
  if (pcmBuffer.length === 0) {
    throw new Error('Empty PCM buffer from Gemini TTS');
  }

  await onProgress?.(78, 'Transcoding audio to MP3...');
  const mp3Buffer = await pcmToMp3(pcmBuffer, sampleRate);
  if (mp3Buffer.length === 0) {
    throw new Error('PCM to MP3 transcode produced an empty buffer');
  }

  logger.debug(
    `Gemini TTS audio: ${pcmBuffer.length} PCM bytes → ${mp3Buffer.length} MP3 bytes @ ${sampleRate} Hz`
  );
  return mp3Buffer;
}

async function generateElevenLabsAudio(
  segments: PodcastSegment[],
  voiceConfig: PodcastVoiceSettings,
  onProgress?: ProgressFn
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ElevenLabs API key is not configured');
  }

  const hostVoices: Record<'host1' | 'host2', string> = {
    host1: voiceConfig.host1VoiceId || DEFAULT_ELEVENLABS_VOICES.host1,
    host2: voiceConfig.host2VoiceId || DEFAULT_ELEVENLABS_VOICES.host2,
  };

  const elevenlabs = new ElevenLabsClient({ apiKey });
  const dialogueInputs = segments.map(seg => ({
    text: seg.text,
    voiceId: hostVoices[seg.speaker],
  }));

  logger.debug(`Generating podcast audio via ElevenLabs text-to-dialogue (${segments.length} segments)`);
  await onProgress?.(65, 'Calling ElevenLabs text-to-dialogue API...');

  const audioStream = await elevenlabs.textToDialogue.convert({
    inputs: dialogueInputs,
    modelId: voiceConfig.model || undefined,
  });

  await onProgress?.(75, 'Receiving audio stream...');

  const chunks: Buffer[] = [];
  const readable = Readable.from(audioStream as unknown as AsyncIterable<Uint8Array>);
  for await (const chunk of readable) {
    chunks.push(Buffer.from(chunk));
  }
  const audioBuffer = Buffer.concat(chunks);

  if (audioBuffer.length === 0) {
    throw new Error('Empty audio buffer from ElevenLabs text-to-dialogue');
  }

  return audioBuffer;
}
