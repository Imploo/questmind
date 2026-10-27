import { describe, it, expect } from 'vitest';
import { buildAudioFilterGraph, parseTimemark, toDynaudnormMaxGain } from './audio-processing.service';

describe('buildAudioFilterGraph', () => {
  it('converts every input to mono 24 kHz, concatenates and normalizes', () => {
    expect(buildAudioFilterGraph(2, { enabled: true, maxGainDb: 20 })).toBe(
      '[0:a]aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono[a0];' +
      '[1:a]aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono[a1];' +
      '[a0][a1]concat=n=2:v=0:a=1,dynaudnorm=f=100:g=21:p=0.95:r=0.1:m=10.00[out]'
    );
  });

  it('skips dynaudnorm when normalization is disabled', () => {
    const graph = buildAudioFilterGraph(1, { enabled: false, maxGainDb: 20 });
    expect(graph).not.toContain('dynaudnorm');
    expect(graph.endsWith('[a0]concat=n=1:v=0:a=1[out]')).toBe(true);
  });
});

describe('toDynaudnormMaxGain', () => {
  it('converts dB to a linear factor', () => {
    expect(toDynaudnormMaxGain(0)).toBe('1.00');
    expect(toDynaudnormMaxGain(20)).toBe('10.00');
  });

  it('clamps to dynaudnorm range and falls back for invalid values', () => {
    expect(toDynaudnormMaxGain(99)).toBe('100.00');
    expect(toDynaudnormMaxGain(-3)).toBe('1.00');
    expect(toDynaudnormMaxGain(Number.NaN)).toBe('10.00');
  });
});

describe('parseTimemark', () => {
  it('parses ffmpeg timemarks', () => {
    expect(parseTimemark('03:00:01.50')).toBeCloseTo(10801.5);
    expect(parseTimemark('00:00:42.00')).toBe(42);
  });

  it('returns 0 for unparseable input', () => {
    expect(parseTimemark('')).toBe(0);
    expect(parseTimemark('N/A')).toBe(0);
  });
});
