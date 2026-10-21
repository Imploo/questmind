import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { PassThrough, Readable } from 'stream';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/** Gemini TTS default output sample rate (Hz). */
export const DEFAULT_PCM_SAMPLE_RATE = 24000;

/**
 * Parse the PCM sample rate from a Gemini TTS mimeType
 * (e.g. `audio/L16;codec=pcm;rate=24000`).
 *
 * Preview models can change the rate, so we read it from the response
 * instead of hardcoding. Falls back to {@link DEFAULT_PCM_SAMPLE_RATE}
 * when the rate is absent or unparseable.
 */
export function parsePcmSampleRate(mimeType: string | undefined | null): number {
  if (!mimeType) return DEFAULT_PCM_SAMPLE_RATE;
  const match = /rate=(\d+)/i.exec(mimeType);
  const rate = match ? Number.parseInt(match[1], 10) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_PCM_SAMPLE_RATE;
}

/**
 * Transcode raw signed-16-bit little-endian mono PCM to MP3.
 *
 * Gemini TTS returns raw PCM (`audio/L16`), but the storage path, MIME type
 * and frontend playback/download flow all expect MP3 — so we transcode before
 * upload. Uses the ffmpeg binary already bundled via `@ffmpeg-installer/ffmpeg`.
 */
export function pcmToMp3(pcmBuffer: Buffer, sampleRate: number = DEFAULT_PCM_SAMPLE_RATE): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const out: Buffer[] = [];
    const sink = new PassThrough();
    sink.on('data', (chunk) => out.push(Buffer.from(chunk)));
    sink.on('end', () => resolve(Buffer.concat(out)));
    sink.on('error', reject);

    ffmpeg(Readable.from(pcmBuffer))
      .inputFormat('s16le')                       // signed 16-bit little-endian PCM
      .inputOptions([`-ar ${sampleRate}`, '-ac 1']) // sample rate + mono
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .format('mp3')
      .on('error', reject)
      .pipe(sink, { end: true });
  });
}
