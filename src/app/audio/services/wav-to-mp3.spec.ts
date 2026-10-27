import { describe, it, expect } from 'vitest';
import { encodeWavToMp3, isWavFile, readWavFormat } from './wav-to-mp3';

interface WavSpec {
  format: 1 | 3;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  seconds: number;
  extensible?: boolean;
  /** Extra chunk before `data` (e.g. DJI/BWF metadata). */
  extraChunk?: number;
}

/** Build a WAV File containing a 220 Hz tone. */
function makeWav(spec: WavSpec): File {
  const frames = Math.round(spec.seconds * spec.sampleRate);
  const bytesPerSample = spec.bitsPerSample / 8;
  const dataSize = frames * spec.channels * bytesPerSample;
  const fmtSize = spec.extensible ? 40 : 16;
  const extra = spec.extraChunk ?? 0;
  const extraTotal = extra > 0 ? 8 + extra + (extra % 2) : 0;
  const buffer = new ArrayBuffer(12 + 8 + fmtSize + extraTotal + 8 + dataSize);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));

  str(0, 'RIFF');
  v.setUint32(4, buffer.byteLength - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, fmtSize, true);
  v.setUint16(20, spec.extensible ? 0xfffe : spec.format, true);
  v.setUint16(22, spec.channels, true);
  v.setUint32(24, spec.sampleRate, true);
  v.setUint32(28, spec.sampleRate * spec.channels * bytesPerSample, true);
  v.setUint16(32, spec.channels * bytesPerSample, true);
  v.setUint16(34, spec.bitsPerSample, true);
  if (spec.extensible) {
    v.setUint16(36, 22, true);
    v.setUint16(44, spec.format, true); // SubFormat GUID starts with the format code
  }
  let pos = 20 + fmtSize;
  if (extra > 0) {
    str(pos, 'iXML');
    v.setUint32(pos + 4, extra, true);
    pos += extraTotal;
  }
  str(pos, 'data');
  v.setUint32(pos + 4, dataSize, true);
  pos += 8;

  for (let f = 0; f < frames; f++) {
    const s = 0.5 * Math.sin((2 * Math.PI * 220 * f) / spec.sampleRate);
    for (let c = 0; c < spec.channels; c++, pos += bytesPerSample) {
      if (spec.format === 3) {
        v.setFloat32(pos, s, true);
      } else if (spec.bitsPerSample === 16) {
        v.setInt16(pos, Math.round(s * 0x7fff), true);
      } else if (spec.bitsPerSample === 24) {
        const i = Math.round(s * 0x7fffff);
        v.setUint8(pos, i & 0xff);
        v.setUint8(pos + 1, (i >> 8) & 0xff);
        v.setInt8(pos + 2, i >> 16);
      }
    }
  }
  return new File([buffer], 'mic.wav', { type: 'audio/wav' });
}

describe('isWavFile', () => {
  it('recognises WAV by MIME type or extension', () => {
    expect(isWavFile(new File([], 'a.bin', { type: 'audio/x-wav' }))).toBe(true);
    expect(isWavFile(new File([], 'TX01_MIC001.WAV', { type: '' }))).toBe(true);
    expect(isWavFile(new File([], 'phone.m4a', { type: 'audio/mp4' }))).toBe(false);
  });
});

describe('readWavFormat', () => {
  it('reads PCM format and skips metadata chunks before data', async () => {
    const fmt = await readWavFormat(makeWav({
      format: 1, channels: 2, sampleRate: 48000, bitsPerSample: 24, seconds: 0.1, extraChunk: 1001,
    }));
    expect(fmt).toMatchObject({ format: 1, channels: 2, sampleRate: 48000, bitsPerSample: 24 });
    expect(fmt.dataSize).toBe(4800 * 2 * 3);
  });

  it('resolves WAVE_FORMAT_EXTENSIBLE to its sub format', async () => {
    const fmt = await readWavFormat(makeWav({
      format: 3, channels: 1, sampleRate: 48000, bitsPerSample: 32, seconds: 0.1, extensible: true,
    }));
    expect(fmt.format).toBe(3);
  });

  it('rejects files that are not WAV', async () => {
    await expect(readWavFormat(new File(['not a wav file at all'], 'x.wav'))).rejects.toThrow();
  });
});

describe('encodeWavToMp3', () => {
  it.each([
    { format: 1 as const, channels: 1, sampleRate: 16000, bitsPerSample: 16 },
    { format: 1 as const, channels: 2, sampleRate: 48000, bitsPerSample: 24 },
    { format: 3 as const, channels: 2, sampleRate: 44100, bitsPerSample: 32, extensible: true },
  ])('encodes $bitsPerSample-bit $channels-ch $sampleRate Hz to a much smaller MP3', async (spec) => {
    const wav = makeWav({ ...spec, seconds: 2 });
    const progress: number[] = [];

    const result = await encodeWavToMp3(wav, (p) => progress.push(p));

    expect(result.durationSeconds).toBeCloseTo(2, 2);
    expect(result.blob.type).toBe('audio/mpeg');
    expect(result.blob.size).toBeGreaterThan(1000);
    expect(result.blob.size).toBeLessThan(wav.size / 2);
    expect(progress.at(-1)).toBe(100);
  });
});
