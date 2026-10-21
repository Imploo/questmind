import { GoogleGenAI } from '@google/genai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Readable } from 'stream';
import * as logger from './logger';
import { PodcastVoiceSettings } from '../types/audio-session.types';
import { pcmToMp3, DEFAULT_PCM_SAMPLE_RATE } from './pcm-to-mp3';

export interface PodcastSegment {
  speaker: 'host1' | 'host2';
  text: string;
}

/** Speaker names used in the per-turn speech_metadata and the Gemini speaker→voice config. */
const SPEAKER_LABELS: Record<'host1' | 'host2', string> = {
  host1: 'HOST1',
  host2: 'HOST2',
};

/**
 * Delivery style attached to every turn via `speech_metadata.style`.
 * Gemini 3.8 TTS reads the `text` field verbatim, so style must NOT be part of the text.
 */
const GEMINI_STYLE_INSTRUCTION =
  'Lees het volgende voor als een ontspannen, natuurlijk gesprek tussen twee Nederlandse podcast-hosts. ' +
  'Praat rustig en conversationeel op een normaal tempo. Niet elke zin krijgt nadruk — leg alleen klemtoon ' +
  'op echt belangrijke momenten en houd de rest luchtig en ingetogen, alsof twee vrienden gewoon napraten.';

/**
 * Max characters per Gemini TTS request. The official docs warn that speech
 * quality drifts on outputs longer than a few minutes, so we chunk long
 * scripts on turn boundaries and concatenate the PCM before encoding once.
 */
const GEMINI_CHUNK_CHAR_LIMIT = 3000;

/** Legacy ElevenLabs voice IDs (fallback when none configured). */
const DEFAULT_GEMINI_TTS_MODEL = 'gemini-3.8-flash-tts';

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

/**
 * Map segments to Gemini 3.8 TTS turns: verbatim text, with speaker and delivery
 * style carried in a `speech_metadata` annotation on every turn.
 */
export function buildTurns(segments: PodcastSegment[]) {
  return segments.map(seg => ({
    type: 'text' as const,
    text: seg.text,
    annotations: [
      { type: 'speech_metadata' as const, speaker: SPEAKER_LABELS[seg.speaker], style: GEMINI_STYLE_INSTRUCTION },
    ],
  }));
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

  const model = voiceConfig.geminiModel || DEFAULT_GEMINI_TTS_MODEL;
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

    // Request headerless PCM (l16): unary default is WAV, and concatenating WAV
    // chunks would leave RIFF headers mid-stream as audible clicks.
    const interaction = await googleAi.interactions.create({
      model,
      input: [{ type: 'user_input', content: buildTurns(chunks[i]) }],
      response_format: { type: 'audio', mime_type: 'audio/l16', sample_rate: DEFAULT_PCM_SAMPLE_RATE },
      generation_config: {
        speech_config: {
          speakers: [
            { speaker: SPEAKER_LABELS.host1, voice: voiceConfig.host1VoiceName },
            { speaker: SPEAKER_LABELS.host2, voice: voiceConfig.host2VoiceName },
          ],
        },
      },
    });

    if (interaction.errors?.length) {
      throw new Error(`Gemini TTS error: ${JSON.stringify(interaction.errors)}`);
    }
    const audio = interaction.output_audio;
    if (!audio?.data) {
      throw new Error('No audio data returned from Gemini TTS');
    }
    pcmChunks.push(Buffer.from(audio.data, 'base64'));
    sampleRate = audio.sample_rate ?? DEFAULT_PCM_SAMPLE_RATE;
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
