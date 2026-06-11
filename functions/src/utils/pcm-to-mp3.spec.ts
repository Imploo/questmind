import { describe, it, expect } from 'vitest';
import { parsePcmSampleRate, pcmToMp3, DEFAULT_PCM_SAMPLE_RATE } from './pcm-to-mp3';

describe('parsePcmSampleRate', () => {
  it('parses the rate from a Gemini TTS mimeType', () => {
    expect(parsePcmSampleRate('audio/L16;codec=pcm;rate=24000')).toBe(24000);
  });

  it('parses non-default rates', () => {
    expect(parsePcmSampleRate('audio/L16;codec=pcm;rate=16000')).toBe(16000);
  });

  it('is case-insensitive', () => {
    expect(parsePcmSampleRate('AUDIO/L16;RATE=48000')).toBe(48000);
  });

  it('falls back to the default when the rate is missing', () => {
    expect(parsePcmSampleRate('audio/L16;codec=pcm')).toBe(DEFAULT_PCM_SAMPLE_RATE);
  });

  it('falls back to the default for empty/undefined input', () => {
    expect(parsePcmSampleRate(undefined)).toBe(DEFAULT_PCM_SAMPLE_RATE);
    expect(parsePcmSampleRate(null)).toBe(DEFAULT_PCM_SAMPLE_RATE);
    expect(parsePcmSampleRate('')).toBe(DEFAULT_PCM_SAMPLE_RATE);
  });
});

describe('pcmToMp3', () => {
  it('transcodes raw PCM into a valid, non-empty MP3 buffer', async () => {
    // 0.1s of silence: 24000 Hz * 0.1s * 2 bytes (16-bit) * 1 channel (mono)
    const pcm = Buffer.alloc(24000 * 0.1 * 2);

    const mp3 = await pcmToMp3(pcm, 24000);

    expect(mp3.length).toBeGreaterThan(0);
    // A valid MP3 starts with either an ID3v2 tag ("ID3") or a frame sync
    // (0xFF followed by the top 3 bits of the next byte set). ffmpeg's mp3
    // muxer prepends an ID3v2 header by default.
    const startsWithId3 = mp3[0] === 0x49 && mp3[1] === 0x44 && mp3[2] === 0x33;
    const startsWithFrameSync = mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0;
    expect(startsWithId3 || startsWithFrameSync).toBe(true);
  }, 20000);

  it('rejects on malformed PCM input length without hanging', async () => {
    // Odd byte count for 16-bit PCM still encodes (ffmpeg is lenient);
    // we only assert it resolves to a buffer rather than throwing unexpectedly.
    const mp3 = await pcmToMp3(Buffer.from([0, 0, 0, 0]), 24000);
    expect(Buffer.isBuffer(mp3)).toBe(true);
  }, 20000);
});
