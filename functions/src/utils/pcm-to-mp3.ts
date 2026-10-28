import { PassThrough, Readable } from 'stream';
import { ffmpeg } from './ffmpeg';

/** Gemini TTS default output sample rate (Hz). */
export const DEFAULT_PCM_SAMPLE_RATE = 24000;

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
