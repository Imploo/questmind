import { describe, it, expect } from 'vitest';
import { normalizeLoudness } from './audio-normalization';

const SAMPLE_RATE = 8000;

/** Sine tone with the given amplitude and duration. */
function tone(amplitude: number, seconds: number, freq = 220): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  }
  return out;
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function rms(pcm: Float32Array, startSec: number, endSec: number): number {
  const start = Math.round(startSec * SAMPLE_RATE);
  const end = Math.round(endSec * SAMPLE_RATE);
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += pcm[i] * pcm[i];
  }
  return Math.sqrt(sum / (end - start));
}

function peak(pcm: Float32Array): number {
  return pcm.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
}

describe('normalizeLoudness', () => {
  it('brings a quiet and a loud passage to a similar level', () => {
    // Soft speaker (≈ −37 dBFS RMS) followed by a loud one (≈ −9 dBFS RMS).
    const pcm = concat(tone(0.02, 5), tone(0.5, 5));
    const before = rms(pcm, 7, 9) / rms(pcm, 1, 3);

    normalizeLoudness(pcm, SAMPLE_RATE);

    const quiet = rms(pcm, 1, 3);
    const loud = rms(pcm, 7, 9);
    expect(before).toBeGreaterThan(20);
    expect(loud / quiet).toBeLessThan(1.5);
    expect(quiet).toBeGreaterThan(0.05);
  });

  it('modifies the buffer in place and returns it', () => {
    const pcm = tone(0.02, 2);
    expect(normalizeLoudness(pcm, SAMPLE_RATE)).toBe(pcm);
    expect(rms(pcm, 0.5, 1.5)).toBeGreaterThan(0.05);
  });

  it('caps amplification so near-silence is not blown up', () => {
    const pcm = tone(0.0005, 3);
    normalizeLoudness(pcm, SAMPLE_RATE, { maxGain: 10 });
    expect(peak(pcm)).toBeLessThanOrEqual(0.0005 * 10 + 1e-6);
  });

  it('never clips, even right before a sudden loud burst', () => {
    const pcm = concat(tone(0.01, 3), tone(0.99, 1), tone(0.01, 3));
    normalizeLoudness(pcm, SAMPLE_RATE);
    expect(peak(pcm)).toBeLessThanOrEqual(0.95 + 1e-3);
  });

  it('leaves pure silence and empty input untouched', () => {
    const silence = new Float32Array(SAMPLE_RATE);
    normalizeLoudness(silence, SAMPLE_RATE);
    expect(peak(silence)).toBe(0);
    expect(normalizeLoudness(new Float32Array(0), SAMPLE_RATE).length).toBe(0);
  });
});
