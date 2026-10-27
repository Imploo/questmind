import { describe, it, expect } from 'vitest';
import { toNormalizationOptions } from './audio-compression.service';

describe('toNormalizationOptions', () => {
  it('converts the max gain from dB to a linear factor', () => {
    const opts = toNormalizationOptions({ enabled: true, maxGainDb: 20 });
    expect(opts.normalize).toBe(true);
    expect(opts.normalization?.maxGain).toBeCloseTo(10);
  });

  it('passes through a disabled setting', () => {
    expect(toNormalizationOptions({ enabled: false, maxGainDb: 20 }).normalize).toBe(false);
  });

  it('clamps out-of-range values to 0-40 dB', () => {
    expect(toNormalizationOptions({ enabled: true, maxGainDb: -5 }).normalization?.maxGain).toBeCloseTo(1);
    expect(toNormalizationOptions({ enabled: true, maxGainDb: 99 }).normalization?.maxGain).toBeCloseTo(100);
  });

  it('falls back to 20 dB when the stored value is not a number', () => {
    const opts = toNormalizationOptions({ enabled: true, maxGainDb: Number.NaN });
    expect(opts.normalization?.maxGain).toBeCloseTo(10);
  });
});
