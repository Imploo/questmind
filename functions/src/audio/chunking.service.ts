/**
 * Audio chunking service for backend processing
 *
 * Handles splitting large audio files into manageable chunks for transcription.
 * Ported from frontend audio-transcription.service.ts
 */

import Ffmpeg from 'fluent-ffmpeg';
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Set ffmpeg path
Ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const CHUNK_DURATION_SECONDS = 30 * 60; // 30 minutes
export const CHUNK_MIME_TYPE = 'audio/wav';

export interface AudioChunk {
  index: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  audioPath: string; // Path to temporary file
}

export class AudioChunkingService {
  /**
   * Split audio file into chunks
   */
  static async splitAudioIntoChunks(
    inputPath: string,
    totalDuration: number
  ): Promise<AudioChunk[]> {
    const chunks: AudioChunk[] = [];
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-chunks-'));

    let startTimeSeconds = 0;
    let index = 0;

    while (startTimeSeconds < totalDuration) {
      const endTimeSeconds = Math.min(totalDuration, startTimeSeconds + CHUNK_DURATION_SECONDS);
      const durationSeconds = endTimeSeconds - startTimeSeconds;
      const outputPath = path.join(tempDir, `chunk-${index}.wav`);

      // Extract chunk using ffmpeg
      await this.extractChunk(inputPath, startTimeSeconds, durationSeconds, outputPath);

      chunks.push({
        index,
        startTimeSeconds,
        endTimeSeconds,
        durationSeconds,
        audioPath: outputPath
      });

      console.log(
        `Chunk ${index + 1}: ${this.formatTimestamp(startTimeSeconds)}-${this.formatTimestamp(endTimeSeconds)} ` +
        `(${Math.round(durationSeconds)}s)`
      );

      index++;
      startTimeSeconds = endTimeSeconds;
    }

    console.log(`Audio split into ${chunks.length} chunks`);
    return chunks;
  }

  /**
   * Extract a single chunk from audio file
   */
  private static extractChunk(
    inputPath: string,
    startTime: number,
    duration: number,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      Ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .audioChannels(1) // Mono
        .audioFrequency(16000) // 16kHz sample rate
        .format('wav')
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .save(outputPath);
    });
  }

  /**
   * Get audio duration using ffprobe
   */
  static async getAudioDuration(inputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      Ffmpeg.ffprobe(inputPath, (err: any, metadata: Ffmpeg.FfprobeData) => {
        if (err) {
          reject(err);
          return;
        }
        const duration = metadata.format.duration;
        if (duration === undefined) {
          reject(new Error('Could not determine audio duration'));
          return;
        }
        resolve(duration);
      });
    });
  }

  /**
   * Download audio from URL to temp file
   */
  static async downloadAudioToTemp(url: string, fileName: string): Promise<string> {
    const tempPath = path.join(os.tmpdir(), `audio-${Date.now()}-${fileName}`);

    // Download using node fetch
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempPath, Buffer.from(buffer));

    console.log(`Downloaded audio to ${tempPath} (${buffer.byteLength} bytes)`);
    return tempPath;
  }

  /**
   * Convert file to base64 for inline data
   */
  static fileToBase64(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    return buffer.toString('base64');
  }

  /**
   * Cleanup temporary chunk files
   */
  static cleanupChunks(chunks: AudioChunk[]): void {
    for (const chunk of chunks) {
      try {
        if (fs.existsSync(chunk.audioPath)) {
          fs.unlinkSync(chunk.audioPath);
        }
        // Also try to remove the parent directory
        const dir = path.dirname(chunk.audioPath);
        if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
        }
      } catch (error) {
        console.warn(`Failed to cleanup chunk ${chunk.index}:`, error);
      }
    }
  }

  /**
   * Cleanup a single temporary file
   */
  static cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up temp file: ${filePath}`);
      }
    } catch (error) {
      console.warn(`Failed to cleanup temp file ${filePath}:`, error);
    }
  }

  /**
   * Format timestamp as MM:SS
   */
  private static formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }
}
