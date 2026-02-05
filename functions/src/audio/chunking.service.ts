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
import * as https from 'https';
import * as http from 'http';
import { getStorage } from 'firebase-admin/storage';
import { pipeline } from 'stream/promises';


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
   * Extract storage path from Firebase Storage URL
   */
  private static extractStoragePath(url: string): string | null {
    // Match Firebase Storage URL pattern
    const match = url.match(/\/o\/([^?]+)/);
    if (!match) return null;

    // Decode the path
    return decodeURIComponent(match[1]);
  }

  /**
   * Download audio from Firebase Storage using Admin SDK (fast, direct access)
   */
  private static async downloadFromStorage(storagePath: string, fileName: string): Promise<string> {
    const tempPath = path.join(os.tmpdir(), `audio-${Date.now()}-${fileName}`);
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);

    console.log(`Downloading from Storage: ${storagePath}`);

    // Get file size for progress tracking
    const [metadata] = await file.getMetadata();
    const totalBytes = parseInt(String(metadata.size) || '0', 10);

    if (totalBytes > 0) {
      console.log(`File size: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
    }

    let downloadedBytes = 0;
    let lastProgressLog = 0;

    const readStream = file.createReadStream();
    const writeStream = fs.createWriteStream(tempPath);

    // Track progress
    readStream.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;

      // Log progress every 50MB
      if (totalBytes > 50 * 1024 * 1024 && downloadedBytes - lastProgressLog > 50 * 1024 * 1024) {
        const progress = Math.round((downloadedBytes / totalBytes) * 100);
        console.log(`Download progress: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
        lastProgressLog = downloadedBytes;
      }
    });

    try {
      await pipeline(readStream, writeStream);
      console.log(`Downloaded from Storage: ${tempPath} (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
      return tempPath;
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }

  /**
   * Download audio from URL to temp file using native https module for reliability
   */
  static async downloadAudioToTemp(url: string, fileName: string): Promise<string> {
    // Try to use Firebase Storage SDK if this is a Firebase Storage URL
    const storagePath = this.extractStoragePath(url);
    if (storagePath) {
      console.log('Using Firebase Storage SDK for download (faster)');
      return this.downloadFromStorage(storagePath, fileName);
    }

    // Fallback to HTTP download for non-Storage URLs
    console.log('Using HTTP download');
    return this.downloadViaHttp(url, fileName);
  }

  /**
   * Download via HTTP (fallback for non-Storage URLs)
   */
  private static async downloadViaHttp(url: string, fileName: string): Promise<string> {
    const tempPath = path.join(os.tmpdir(), `audio-${Date.now()}-${fileName}`);

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(tempPath);
      let downloadedBytes = 0;
      let totalBytes = 0;
      let lastProgressLog = 0;

      // Use https or http based on URL protocol
      const client = url.startsWith('https') ? https : http;

      console.log(`Starting download from: ${url.substring(0, 100)}...`);

      const request = client.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error('Redirect without location header'));
            return;
          }
          console.log(`Following redirect to: ${redirectUrl.substring(0, 100)}...`);
          writeStream.close();
          this.downloadAudioToTemp(redirectUrl, fileName).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        if (totalBytes > 0) {
          console.log(`Starting download: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
        }

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;

          // Log progress every 50MB
          if (totalBytes > 50 * 1024 * 1024 && downloadedBytes - lastProgressLog > 50 * 1024 * 1024) {
            const progress = Math.round((downloadedBytes / totalBytes) * 100);
            console.log(`Download progress: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
            lastProgressLog = downloadedBytes;
          }
        });

        response.pipe(writeStream);

        writeStream.on('finish', () => {
          writeStream.close();
          console.log(`Downloaded audio to ${tempPath} (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
          resolve(tempPath);
        });

        writeStream.on('error', (error) => {
          writeStream.close();
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
          reject(error);
        });
      });

      request.on('error', (error) => {
        writeStream.close();
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        reject(error);
      });

      // Set a timeout for the request (30 minutes for large files)
      request.setTimeout(30 * 60 * 1000, () => {
        request.destroy();
        reject(new Error('Download timeout after 30 minutes'));
      });
    });
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
