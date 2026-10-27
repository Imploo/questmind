/** Tuning for dynamic loudness normalization. */
export interface NormalizationOptions {
  /** Analysis frame length, in seconds (default 0.1). */
  frameSeconds: number;
  /** Width of the gain smoothing window, in frames (default 15 → 1.5 s). Odd values keep it centred. */
  smoothingFrames: number;
  /** Target RMS level per frame, linear 0…1 (default 0.1 ≈ −20 dBFS). */
  targetRms: number;
  /** Maximum amplification (default 10 ≈ +20 dB) — caps how far silence/room noise is lifted. */
  maxGain: number;
  /** Frame peaks are kept below this level after gain, linear 0…1 (default 0.95). */
  peakCeiling: number;
}

const DEFAULT_NORMALIZATION: NormalizationOptions = {
  frameSeconds: 0.1,
  smoothingFrames: 15,
  targetRms: 0.1,
  maxGain: 10,
  peakCeiling: 0.95,
};

/**
 * Dynamic loudness normalization of mono PCM, in place.
 *
 * A single global gain can't help a quiet player far from the microphone when a
 * loud player sits next to it, so the gain varies over time (similar to ffmpeg's
 * `dynaudnorm`): each frame gets the gain that brings its RMS to `targetRms`,
 * limited by `maxGain` and by the frame peak so nothing clips. The gain curve is
 * then minimum-filtered (a loud frame lowers the gain around it before it
 * arrives — we have the whole recording, so we can look ahead) and averaged, so
 * the level glides between speakers instead of pumping on every syllable.
 */
export function normalizeLoudness(
  pcm: Float32Array,
  sampleRate: number,
  options: Partial<NormalizationOptions> = {},
): Float32Array {
  const opts: NormalizationOptions = { ...DEFAULT_NORMALIZATION, ...options };
  const frameLen = Math.max(1, Math.round(opts.frameSeconds * sampleRate));
  const frameCount = Math.ceil(pcm.length / frameLen);
  if (frameCount === 0) {
    return pcm;
  }

  // ── Step 1: per-frame gain from RMS and peak ─────────────────────────────────
  const frameGains = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const start = f * frameLen;
    const end = Math.min(pcm.length, start + frameLen);
    let sumSquares = 0;
    let peak = 0;
    for (let i = start; i < end; i++) {
      const s = pcm[i];
      sumSquares += s * s;
      const abs = s < 0 ? -s : s;
      if (abs > peak) {
        peak = abs;
      }
    }
    const rms = Math.sqrt(sumSquares / (end - start));
    const rmsGain = rms > 0 ? opts.targetRms / rms : opts.maxGain;
    const peakGain = peak > 0 ? opts.peakCeiling / peak : opts.maxGain;
    frameGains[f] = Math.min(opts.maxGain, rmsGain, peakGain);
  }

  // ── Step 2: smooth the gain curve (minimum filter, then moving average) ──────
  const radius = Math.floor(opts.smoothingFrames / 2);
  const smoothed = movingAverage(minimumFilter(frameGains, radius), radius);

  // ── Step 3: apply, interpolating linearly between frame centres ──────────────
  const half = frameLen / 2;
  for (let i = 0; i < pcm.length; i++) {
    const pos = (i - half) / frameLen;
    const f0 = Math.max(0, Math.min(frameCount - 1, Math.floor(pos)));
    const f1 = Math.min(frameCount - 1, f0 + 1);
    const t = Math.max(0, Math.min(1, pos - f0));
    const gain = smoothed[f0] + (smoothed[f1] - smoothed[f0]) * t;
    const s = pcm[i] * gain;
    pcm[i] = s > 1 ? 1 : s < -1 ? -1 : s;
  }

  return pcm;
}

/** Sliding-window minimum over ±radius values. */
function minimumFilter(values: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let min = values[i];
    const lo = Math.max(0, i - radius);
    const hi = Math.min(values.length - 1, i + radius);
    for (let j = lo; j <= hi; j++) {
      if (values[j] < min) {
        min = values[j];
      }
    }
    out[i] = min;
  }
  return out;
}

/** Sliding-window mean over ±radius values (window shrinks at the edges). */
function movingAverage(values: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(values.length - 1, i + radius);
    let sum = 0;
    for (let j = lo; j <= hi; j++) {
      sum += values[j];
    }
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}
