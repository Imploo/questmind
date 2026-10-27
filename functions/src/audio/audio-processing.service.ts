import { promises as fs } from 'fs';
import { join } from 'path';
import { getStorage } from 'firebase-admin/storage';
import { AudioNormalizationSettings } from '../types/audio-session.types';
import { getAudioNormalizationConfig } from '../utils/ai-settings';
import { ffmpeg, withTempDir } from '../utils/ffmpeg';
import { newDownloadToken } from '../utils/storage-url';

/**
 * Output format of the stored session recording. Tuned for transcription
 * faithfulness: 64 kbps / 24 kHz mono keeps names and overlapping speakers
 * intelligible while a 3h session stays ~86 MB. Gemini bills audio per second,
 * not per byte, so the higher quality costs no extra tokens.
 */
export const RECORDING_SAMPLE_RATE = 24_000;
export const RECORDING_BITRATE_KBPS = 64;

/** dynaudnorm accepts a max gain factor of 1–100 (0–40 dB). */
const MAX_GAIN_DB_LIMIT = 40;

/**
 * Build the ffmpeg filter graph that joins all inputs into one mono timeline at
 * the recording sample rate and (optionally) applies dynamic loudness
 * normalization. Inputs can differ in format, rate and channel count (e.g. a
 * DJI dual-channel WAV followed by a phone M4A), so each is converted before
 * the concat. dynaudnorm evens out loud and soft speakers over time — players
 * far from the mic end up at a similar level — with frame/window sizes matching
 * the earlier in-browser implementation (100 ms frames, ~2 s smoothing).
 */
export function buildAudioFilterGraph(
  inputCount: number,
  normalization: AudioNormalizationSettings
): string {
  const prepared = Array.from({ length: inputCount }, (_, i) =>
    `[${i}:a]aresample=${RECORDING_SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=mono[a${i}]`
  );
  const joinedInputs = Array.from({ length: inputCount }, (_, i) => `[a${i}]`).join('');
  const steps = [`concat=n=${inputCount}:v=0:a=1`];
  if (normalization.enabled !== false) {
    steps.push(`dynaudnorm=f=100:g=21:p=0.95:r=0.1:m=${toDynaudnormMaxGain(normalization.maxGainDb)}`);
  }
  return [...prepared, `${joinedInputs}${steps.join(',')}[out]`].join(';');
}

/** Convert the admin max gain (dB) into dynaudnorm's linear `m` factor. */
export function toDynaudnormMaxGain(maxGainDb: number): string {
  const db = Number(maxGainDb);
  const clamped = Number.isFinite(db) ? Math.min(MAX_GAIN_DB_LIMIT, Math.max(0, db)) : 20;
  return Math.pow(10, clamped / 20).toFixed(2);
}

/**
 * Join, downmix, resample, normalize and encode the source files into one MP3.
 * Returns the duration of the result, in seconds.
 */
export function processAudioToMp3(
  inputPaths: string[],
  outputPath: string,
  normalization: AudioNormalizationSettings
): Promise<{ durationSec: number }> {
  return new Promise((resolve, reject) => {
    let lastTimemark = '';
    const command = ffmpeg();
    inputPaths.forEach((p) => command.input(p));
    command
      .complexFilter(buildAudioFilterGraph(inputPaths.length, normalization), 'out')
      .audioCodec('libmp3lame')
      .audioBitrate(`${RECORDING_BITRATE_KBPS}k`)
      .format('mp3')
      .on('progress', (p: { timemark?: string }) => {
        if (p.timemark) lastTimemark = p.timemark;
      })
      .on('error', reject)
      .on('end', () => {
        void (async () => {
          // The last progress timemark is the output duration; fall back to the
          // CBR file size if ffmpeg reported none.
          let durationSec = parseTimemark(lastTimemark);
          if (!durationSec) {
            const { size } = await fs.stat(outputPath);
            durationSec = (size * 8) / (RECORDING_BITRATE_KBPS * 1000);
          }
          resolve({ durationSec });
        })().catch(reject);
      })
      .save(outputPath);
  });
}

export type ProcessingStep = 'downloading' | 'processing' | 'storing';

/**
 * Shared pipeline for session audio and the campaign voice intro: download the
 * uploaded source files from Storage, process them into one normalized MP3
 * (admin normalization settings) and store it at `destinationPath` with a
 * download token, so the frontend can play it via getDownloadURL().
 */
export async function processSourcesToRecording(
  sourcePaths: string[],
  destinationPath: string,
  onStep?: (step: ProcessingStep) => Promise<void> | void
): Promise<{ sizeBytes: number; durationSec: number }> {
  return withTempDir('process-audio-', async (workDir) => {
    const bucket = getStorage().bucket();

    await onStep?.('downloading');
    const inputPaths = await Promise.all(sourcePaths.map(async (sourcePath, i) => {
      const localPath = join(workDir, `source-${i}`);
      await bucket.file(sourcePath).download({ destination: localPath });
      return localPath;
    }));

    await onStep?.('processing');
    const outputPath = join(workDir, 'recording.mp3');
    const { durationSec } = await processAudioToMp3(inputPaths, outputPath, await getAudioNormalizationConfig());

    await onStep?.('storing');
    await bucket.upload(outputPath, {
      destination: destinationPath,
      metadata: {
        contentType: 'audio/mpeg',
        metadata: { firebaseStorageDownloadTokens: newDownloadToken() },
      },
    });
    const { size } = await fs.stat(outputPath);
    return { sizeBytes: size, durationSec };
  });
}

/** Parse an ffmpeg timemark ("HH:MM:SS.xx") into seconds; 0 when unparseable. */
export function parseTimemark(timemark: string): number {
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(timemark.trim());
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
