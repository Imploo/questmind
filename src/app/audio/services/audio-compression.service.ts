import { Injectable } from '@angular/core';
import { Mp3Encoder } from '@breezystack/lamejs';
import * as logger from '../../shared/logger';

export interface CompressionOptions {
  /** Target bitrate in bps (default: 64_000) */
  targetBitrate: number;
  /** Target sample rate in Hz (default: 24_000) */
  targetSampleRate: number;
  /** Number of output channels (default: 1 — mono) */
  channels: 1 | 2;
}

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  durationSeconds: number;
  mimeType: string;
  /** True when compression was skipped because output would be larger than input */
  skipped: boolean;
}

/** Controls how a long recording is split into shorter clips (ticket #67). */
export interface SegmentationOptions {
  /** Target length of each segment, in seconds (default 1800 = 30 min). */
  segmentSeconds: number;
  /** Overlap pulled from the previous segment, in seconds, so words on the
   *  boundary aren't clipped (default 15). */
  overlapSeconds: number;
  /** Recordings at or below this length are NOT split (default 2100 = 35 min). */
  minSplitSeconds: number;
}

/** One compressed audio segment plus its place in the original timeline. */
export interface AudioSegmentResult {
  blob: Blob;
  /** 0-based order within the recording. */
  index: number;
  /** Start offset within the original recording, in seconds. */
  startSec: number;
  /** End offset within the original recording, in seconds. */
  endSec: number;
  durationSeconds: number;
}

export interface SegmentedCompressionResult {
  segments: AudioSegmentResult[];
  /** Total duration of the (decoded) recording, in seconds. */
  durationSeconds: number;
  originalSize: number;
  /** Combined size of all segment blobs, in bytes. */
  compressedSize: number;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  // Tuned for transcription faithfulness: 32 kbps / 16 kHz mono lost enough
  // detail (names, overlapping speakers, fricatives) that Gemini mis-heard and
  // filled gaps with invented content. 64 kbps / 24 kHz keeps speech far
  // clearer while staying small (a 3h session is ~86 MB) and costs no extra
  // Gemini tokens (audio is billed per second of duration, not per byte).
  targetBitrate: 64_000,
  targetSampleRate: 24_000,
  channels: 1,
};

const DEFAULT_SEGMENTATION: SegmentationOptions = {
  segmentSeconds: 30 * 60,   // 30 min — longer clips keep narrative context for the story
  overlapSeconds: 15,
  minSplitSeconds: 35 * 60,  // only split recordings longer than ~35 min
};

const MP3_CHUNK_SIZE = 1152; // PCM samples per MPEG Layer-3 frame

/**
 * Compresses an audio File in the browser using Web Audio API + lamejs (MP3).
 *
 * Pipeline:
 *   1. Decode source audio via AudioContext.decodeAudioData()
 *   2. Resample + downmix to mono 24 kHz via OfflineAudioContext
 *   3. Encode to MP3 at 64 kbps via lamejs
 *
 * Typical result: 300 MB WAV → ~45 MB MP3 (~7× reduction).
 * If the encoded output is larger than the original the original file is returned unchanged.
 */
@Injectable({ providedIn: 'root' })
export class AudioCompressionService {
  async compress(
    file: File,
    onProgress?: (progress: number) => void,
    options: Partial<CompressionOptions> = {},
  ): Promise<CompressionResult> {
    const opts: CompressionOptions = { ...DEFAULT_OPTIONS, ...options };

    logger.info('[AudioCompression] Starting compression', {
      originalSize: file.size,
      originalType: file.type,
      targetSampleRate: opts.targetSampleRate,
      targetBitrate: opts.targetBitrate,
    });

    onProgress?.(0);

    // ── Step 1: decode ────────────────────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new AudioContext();
    let sourceBuffer: AudioBuffer;
    try {
      sourceBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } finally {
      await audioCtx.close();
    }

    onProgress?.(10);

    // ── Step 2: resample to target rate + downmix to mono ─────────────────────
    const numFrames = Math.ceil(sourceBuffer.duration * opts.targetSampleRate);
    const offlineCtx = new OfflineAudioContext(opts.channels, numFrames, opts.targetSampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = sourceBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);
    const resampledBuffer = await offlineCtx.startRendering();

    onProgress?.(25);

    // ── Step 3: encode PCM → MP3 ──────────────────────────────────────────────
    const kbps = Math.round(opts.targetBitrate / 1000);
    const encoder = new Mp3Encoder(opts.channels, opts.targetSampleRate, kbps);

    const pcmFloat = resampledBuffer.getChannelData(0); // mono channel
    const pcm16 = floatTo16BitPcm(pcmFloat);

    const mp3Parts: ArrayBuffer[] = [];
    const totalChunks = Math.ceil(pcm16.length / MP3_CHUNK_SIZE);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const offset = chunkIndex * MP3_CHUNK_SIZE;
      const chunk = pcm16.subarray(offset, offset + MP3_CHUNK_SIZE);
      const encoded = encoder.encodeBuffer(chunk);
      if (encoded.length > 0) {
        mp3Parts.push(encoded.buffer as ArrayBuffer);
      }

      // Report encoding progress (25% → 95%)
      if (chunkIndex % 200 === 0) {
        const encodeProgress = Math.round(25 + (chunkIndex / totalChunks) * 70);
        onProgress?.(encodeProgress);
        // Yield to keep the UI responsive
        await yieldToMain();
      }
    }

    const finalPart = encoder.flush();
    if (finalPart.length > 0) {
      mp3Parts.push(finalPart.buffer as ArrayBuffer);
    }

    const mp3Blob = new Blob(mp3Parts, { type: 'audio/mpeg' });

    onProgress?.(98);

    // ── Skip if output is larger than input ───────────────────────────────────
    if (mp3Blob.size >= file.size) {
      logger.info('[AudioCompression] Compressed file is not smaller — skipping', {
        originalSize: file.size,
        compressedSize: mp3Blob.size,
      });
      onProgress?.(100);
      return {
        blob: file,
        originalSize: file.size,
        compressedSize: file.size,
        compressionRatio: 1,
        durationSeconds: sourceBuffer.duration,
        mimeType: file.type,
        skipped: true,
      };
    }

    const ratio = file.size / mp3Blob.size;
    logger.info('[AudioCompression] Compression complete', {
      originalSize: file.size,
      compressedSize: mp3Blob.size,
      ratio: ratio.toFixed(2),
      durationSeconds: sourceBuffer.duration,
    });

    onProgress?.(100);

    return {
      blob: mp3Blob,
      originalSize: file.size,
      compressedSize: mp3Blob.size,
      compressionRatio: ratio,
      durationSeconds: sourceBuffer.duration,
      mimeType: 'audio/mpeg',
      skipped: false,
    };
  }

  /**
   * Compress a recording and split it into shorter segments for transcription.
   *
   * Decodes + resamples once (mono, target sample rate), then slices the PCM
   * into overlapping segments and encodes each to its own MP3. Recordings at or
   * below `minSplitSeconds` produce a single segment (same as compress()).
   * See ticket #67 — shorter clips keep the model's attention high so the second
   * half of long sessions no longer loses detail or gets invented.
   */
  async compressToSegments(
    file: File,
    onProgress?: (progress: number) => void,
    options: Partial<CompressionOptions> = {},
    segmentation: Partial<SegmentationOptions> = {},
  ): Promise<SegmentedCompressionResult> {
    return this.compressFilesToSegments([file], onProgress, options, segmentation);
  }

  /**
   * Compress one or more recordings and split the combined audio into segments.
   *
   * Multi-file sessions (ticket #53) are concatenated into one continuous evening
   * here — each file is decoded + resampled to mono PCM and the PCM streams are
   * joined — and only then sliced into segments (ticket #67). This is the inverse
   * of #53: concatenate first, then segment, so segment boundaries fall on the
   * full timeline rather than on file boundaries.
   *
   * A single file at or below `minSplitSeconds` produces one segment (identical to
   * the legacy single-upload flow — no behavioural change for short recordings).
   */
  async compressFilesToSegments(
    files: File[],
    onProgress?: (progress: number) => void,
    options: Partial<CompressionOptions> = {},
    segmentation: Partial<SegmentationOptions> = {},
  ): Promise<SegmentedCompressionResult> {
    if (files.length === 0) {
      throw new Error('compressFilesToSegments requires at least one file');
    }

    const opts: CompressionOptions = { ...DEFAULT_OPTIONS, ...options };
    const seg: SegmentationOptions = { ...DEFAULT_SEGMENTATION, ...segmentation };
    const sampleRate = opts.targetSampleRate;

    onProgress?.(0);

    // ── Step 1: decode + resample each file to mono PCM, then concatenate ──────
    // Decoding spans 0–20% of progress, shared across the files.
    const decoded: Float32Array[] = [];
    let originalSize = 0;
    for (let i = 0; i < files.length; i++) {
      decoded.push(await this.decodeToMonoPcm(files[i], sampleRate));
      originalSize += files[i].size;
      onProgress?.(Math.round(((i + 1) / files.length) * 20));
    }
    const pcmFloat = concatFloat32(decoded);
    // Release the per-file buffers now that they're joined.
    decoded.length = 0;

    // ── Step 2: slice into segments + encode each to MP3 (20–100%) ────────────
    const durationSeconds = pcmFloat.length / sampleRate;
    const kbps = Math.round(opts.targetBitrate / 1000);

    const ranges = computeSegmentRanges(durationSeconds, seg);
    const segments: AudioSegmentResult[] = [];

    for (let i = 0; i < ranges.length; i++) {
      const { startSec, endSec } = ranges[i];
      const startSample = Math.floor(startSec * sampleRate);
      const endSample = Math.min(pcmFloat.length, Math.floor(endSec * sampleRate));
      const pcm16 = floatTo16BitPcm(pcmFloat.subarray(startSample, endSample));
      const blob = await encodePcm16ToMp3(pcm16, sampleRate, kbps);

      segments.push({ blob, index: i, startSec, endSec, durationSeconds: endSec - startSec });

      onProgress?.(20 + Math.round(((i + 1) / ranges.length) * 80));
    }

    onProgress?.(100);

    const compressedSize = segments.reduce((sum, s) => sum + s.blob.size, 0);

    logger.info('[AudioCompression] Segmented compression complete', {
      files: files.length,
      originalSize,
      compressedSize,
      durationSeconds: Math.round(durationSeconds),
      segments: segments.length,
    });

    return { segments, durationSeconds, originalSize, compressedSize };
  }

  /** Decode a file and resample/downmix it to a mono Float32 PCM stream. */
  private async decodeToMonoPcm(file: File, targetSampleRate: number): Promise<Float32Array> {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new AudioContext();
    let sourceBuffer: AudioBuffer;
    try {
      sourceBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } finally {
      await audioCtx.close();
    }

    const numFrames = Math.ceil(sourceBuffer.duration * targetSampleRate);
    const offlineCtx = new OfflineAudioContext(1, numFrames, targetSampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = sourceBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);
    const resampledBuffer = await offlineCtx.startRendering();

    // Copy out of the AudioBuffer so the underlying buffer can be GC'd.
    return Float32Array.from(resampledBuffer.getChannelData(0));
  }
}

/** Concatenate Float32 PCM chunks into one contiguous stream. */
function concatFloat32(chunks: Float32Array[]): Float32Array {
  if (chunks.length === 1) {
    return chunks[0];
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Compute segment [startSec, endSec) ranges, each with a small lead-in overlap. */
function computeSegmentRanges(
  durationSeconds: number,
  seg: SegmentationOptions,
): { startSec: number; endSec: number }[] {
  if (durationSeconds <= seg.minSplitSeconds) {
    return [{ startSec: 0, endSec: durationSeconds }];
  }

  const ranges: { startSec: number; endSec: number }[] = [];
  const count = Math.ceil(durationSeconds / seg.segmentSeconds);
  for (let k = 0; k < count; k++) {
    const nominalStart = k * seg.segmentSeconds;
    const startSec = Math.max(0, nominalStart - (k > 0 ? seg.overlapSeconds : 0));
    const endSec = Math.min(durationSeconds, (k + 1) * seg.segmentSeconds);
    ranges.push({ startSec, endSec });
  }
  return ranges;
}

/** Encode Int16 PCM samples to an MP3 blob via lamejs (mono). */
async function encodePcm16ToMp3(
  pcm16: Int16Array,
  sampleRate: number,
  kbps: number,
): Promise<Blob> {
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const mp3Parts: ArrayBuffer[] = [];
  const totalChunks = Math.ceil(pcm16.length / MP3_CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const offset = chunkIndex * MP3_CHUNK_SIZE;
    const chunk = pcm16.subarray(offset, offset + MP3_CHUNK_SIZE);
    const encoded = encoder.encodeBuffer(chunk);
    if (encoded.length > 0) {
      mp3Parts.push(encoded.buffer as ArrayBuffer);
    }
    // Yield periodically to keep the UI responsive during long encodes.
    if (chunkIndex % 200 === 0) {
      await yieldToMain();
    }
  }

  const finalPart = encoder.flush();
  if (finalPart.length > 0) {
    mp3Parts.push(finalPart.buffer as ArrayBuffer);
  }

  return new Blob(mp3Parts, { type: 'audio/mpeg' });
}

/** Convert Float32 PCM samples (range −1…1) to Int16 PCM samples. */
function floatTo16BitPcm(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

/** Yield control back to the browser event loop to avoid blocking the UI. */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
