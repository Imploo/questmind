import { Injectable } from '@angular/core';
import { Mp3Encoder } from '@breezystack/lamejs';
import * as logger from '../../shared/logger';

export interface CompressionOptions {
  /** Target bitrate in bps (default: 32_000) */
  targetBitrate: number;
  /** Target sample rate in Hz (default: 16_000) */
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

const DEFAULT_OPTIONS: CompressionOptions = {
  targetBitrate: 32_000,
  targetSampleRate: 16_000,
  channels: 1,
};

const MP3_CHUNK_SIZE = 1152; // PCM samples per MPEG Layer-3 frame

/**
 * Compresses an audio File in the browser using Web Audio API + lamejs (MP3).
 *
 * Pipeline:
 *   1. Decode source audio via AudioContext.decodeAudioData()
 *   2. Resample + downmix to mono 16 kHz via OfflineAudioContext
 *   3. Encode to MP3 at 16 kbps via lamejs
 *
 * Typical result: 300 MB WAV → ~22 MB MP3 (~14× reduction).
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
