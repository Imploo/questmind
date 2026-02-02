import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map, retry } from 'rxjs/operators';
import { GoogleGenAI, Type } from '@google/genai';
import { getApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  orderBy,
  query,
  setDoc,
  getDocs,
  type Firestore
} from 'firebase/firestore';

import { AUDIO_TRANSCRIPTION_PROMPT } from '../prompts';
import { AudioStorageService } from './audio-storage.service';
import {
  MAX_INLINE_AUDIO_BYTES,
  MAX_RETRY_ATTEMPTS,
  getRetryDelay,
  isOverloadedError
} from './audio-utilities';
import {
  StorageMetadata,
  TranscriptionRecord,
  TranscriptionResult
} from './audio-session.models';
import { environment } from '../../environments/environment';

type AudioChunk = {
  index: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  audioBlob: Blob;
};

@Injectable({
  providedIn: 'root'
})
export class AudioTranscriptionService {
  private readonly apiKey = environment.googleAiApiKey;
  private readonly ai: GoogleGenAI;
  private readonly app: FirebaseApp | null;
  private readonly db: Firestore | null;
  private readonly TRANSCRIPTION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      error: { type: Type.STRING },
      message: { type: Type.STRING },
      segments: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            timeSeconds: { type: Type.NUMBER },
            text: { type: Type.STRING },
            speaker: { type: Type.STRING }
          },
          required: ['timeSeconds', 'text']
        }
      }
    }
  };
  private readonly MAX_TRANSCRIPTION_OUTPUT_TOKENS = 64000;
  private readonly CHUNK_DURATION_SECONDS = 10 * 60;
  private readonly CHUNK_MIME_TYPE = 'audio/wav';

  constructor(private readonly storageService: AudioStorageService) {
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });

    try {
      this.app = getApp();
      this.db = getFirestore(this.app);
    } catch (error) {
      console.error('Firebase Firestore not initialized:', error);
      this.app = null;
      this.db = null;
    }
  }

  transcribeAudio(storageMetadata: StorageMetadata, file?: File): Observable<TranscriptionResult> {
    if (!this.apiKey || this.apiKey === 'YOUR_GOOGLE_AI_API_KEY_HERE') {
      return throwError(() => ({
        status: 401,
        message: 'Google AI API key not configured. Please add your API key to the environment file.'
      }));
    }

    if (!file && !storageMetadata.downloadUrl) {
      return throwError(() => ({
        status: 400,
        message: 'No audio source available. Missing both file and storage URL.'
      }));
    }

    return from(this.requestTranscription(storageMetadata, file)).pipe(
      retry({
        count: MAX_RETRY_ATTEMPTS,
        delay: (error, retryCount) => getRetryDelay(error, retryCount)
      }),
      map(result => this.normalizeTranscription(result, storageMetadata)),
      catchError(error => this.handleTranscriptionError(error))
    );
  }

  async saveTranscription(
    userId: string,
    sessionId: string,
    transcription: TranscriptionResult,
    label?: string
  ): Promise<string> {
    if (!this.db) {
      throw new Error('Firebase is not configured. Cannot save transcription.');
    }

    const transcriptionId = this.generateId();
    const transcriptionRecord: TranscriptionRecord = {
      id: transcriptionId,
      sessionId,
      rawTranscript: transcription.rawTranscript,
      timestamps: transcription.timestamps,
      status: transcription.status,
      createdAt: new Date().toISOString(),
      label
    };

    const transcriptionRef = doc(
      this.db,
      'users',
      userId,
      'audioSessions',
      sessionId,
      'transcriptions',
      transcriptionId
    );

    await setDoc(transcriptionRef, transcriptionRecord);
    return transcriptionId;
  }

  async loadTranscriptions(userId: string, sessionId: string): Promise<TranscriptionRecord[]> {
    if (!this.db) {
      console.error('Firebase is not configured. Cannot load transcriptions.');
      return [];
    }

    const transcriptionsRef = collection(
      this.db,
      'users',
      userId,
      'audioSessions',
      sessionId,
      'transcriptions'
    );
    const transcriptionsQuery = query(transcriptionsRef, orderBy('createdAt', 'desc'));

    try {
      const snapshot = await getDocs(transcriptionsQuery);
      return snapshot.docs.map(docSnap => docSnap.data() as TranscriptionRecord);
    } catch (error) {
      console.error('Failed to load transcriptions from Firestore.', error);
      return [];
    }
  }

  private async requestTranscription(storageMetadata: StorageMetadata, file?: File): Promise<any> {
    const mimeType = storageMetadata.contentType || 'audio/mpeg';
    const audioFile = await this.resolveAudioFile(storageMetadata, file, mimeType);
    const decoded = await this.decodeAudioFile(audioFile);

    if (decoded) {
      try {
        if (decoded.audioBuffer.duration > this.CHUNK_DURATION_SECONDS) {
          return await this.requestChunkedTranscription(decoded.audioContext, decoded.audioBuffer);
        }
      } finally {
        await decoded.audioContext.close();
      }
    }

    return this.requestSingleTranscription(audioFile, mimeType);
  }

  private async requestSingleTranscription(audioFile: File, mimeType: string): Promise<any> {
    const contents = await this.buildContentsForAudio(audioFile, mimeType, AUDIO_TRANSCRIPTION_PROMPT);
    return this.callTranscriptionModel(contents);
  }

  private async requestChunkedTranscription(audioContext: AudioContext, audioBuffer: AudioBuffer): Promise<any> {
    const chunks = this.splitAudioBufferIntoChunks(audioContext, audioBuffer);
    const chunkResults: Array<{ chunk: AudioChunk; result: any }> = [];

    console.info(
      `Chunked audio into ${chunks.length} parts (${this.CHUNK_DURATION_SECONDS}s each). ` +
        `Total duration: ${Math.round(audioBuffer.duration)}s.`
    );
    chunks.forEach(chunk => {
      console.info(
        `Chunk ${chunk.index + 1}/${chunks.length}: ${this.formatTimestamp(chunk.startTimeSeconds)}-` +
          `${this.formatTimestamp(chunk.endTimeSeconds)} ` +
          `(${Math.round(chunk.durationSeconds)}s), ${chunk.audioBlob.size} bytes`
      );
    });

    for (const chunk of chunks) {
      const prompt = this.buildChunkPrompt(chunk, chunks.length);
      const chunkFile = new File([chunk.audioBlob], `session-chunk-${chunk.index + 1}.wav`, {
        type: this.CHUNK_MIME_TYPE
      });
      const contents = await this.buildContentsForAudio(chunkFile, this.CHUNK_MIME_TYPE, prompt);
      const result = await this.callTranscriptionModel(contents);
      chunkResults.push({ chunk, result });
    }

    return this.mergeChunkResults(chunkResults);
  }

  private async callTranscriptionModel(contents: { parts: Array<any> }): Promise<any> {
    const response = await this.ai.models.generateContent({
      model: environment.audioModel,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: this.TRANSCRIPTION_SCHEMA,
        maxOutputTokens: this.MAX_TRANSCRIPTION_OUTPUT_TOKENS,
        temperature: 0.9,
        topP: 0.95,
        topK: 40,
        stopSequences: ['\n\n\n\n']
      }
    });

    if (!response.text) {
      throw new Error('No response from transcription model.');
    }

    // Validate response for truncation and repetition issues
    const validation = this.validateTranscriptionResponse(response);
    if (!validation.valid) {
      console.error('Transcription validation failed:', validation.error);
      throw new Error(validation.error || 'Invalid transcription response');
    }

    // Log warnings (non-fatal issues)
    validation.warnings.forEach(warning => console.warn('[Transcription Warning]', warning));

    let result: any;
    try {
      result = JSON.parse(response.text);
    } catch (error) {
      console.error('Invalid JSON response from AI:', error);
      throw new Error('Invalid response format from transcription model.');
    }

    if (result.error) {
      throw new Error(result.message || 'Audio processing failed');
    }

    if (!result.segments || !Array.isArray(result.segments) || result.segments.length === 0) {
      throw new Error('No valid transcription segments returned. The audio may be empty or inaccessible.');
    }

    const hasContent = result.segments.some((seg: any) => seg.text && typeof seg.text === 'string' && seg.text.trim().length > 0);
    if (!hasContent) {
      throw new Error('No valid speech content found in the audio file.');
    }

    return result;
  }

  private validateTranscriptionResponse(response: any): {
    valid: boolean;
    error?: string;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Check finish reason
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      return {
        valid: false,
        error: 'Transcription truncated at token limit. Try using shorter audio chunks.',
        warnings
      };
    }

    // Check for unusual finish reasons
    if (finishReason && finishReason !== 'STOP') {
      warnings.push(`Unusual finish reason: ${finishReason}`);
    }

    // Monitor thought token usage
    const usageMetadata = response.usageMetadata;
    if (usageMetadata) {
      const thoughtTokens = usageMetadata.thoughtsTokenCount || 0;
      const inputTokens = usageMetadata.promptTokenCount || 1;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;

      if (thoughtTokens > inputTokens * 2) {
        warnings.push(
          `Excessive thought tokens: ${thoughtTokens} (${Math.round(thoughtTokens / inputTokens)}x input). ` +
          `Model may be struggling with audio quality.`
        );
      }

      // Log token usage for monitoring
      console.info('[Transcription Tokens]', {
        input: inputTokens,
        output: outputTokens,
        thoughts: thoughtTokens,
        total: usageMetadata.totalTokenCount,
        thoughtRatio: (thoughtTokens / inputTokens).toFixed(2)
      });
    }

    // Check for repetition in the output
    const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (this.detectRepetition(text)) {
      return {
        valid: false,
        error: 'Catastrophic repetition detected in transcription output. This may indicate audio quality issues or model confusion.',
        warnings
      };
    }

    // Check if JSON is properly terminated
    const trimmedText = text.trim();
    if (trimmedText && !trimmedText.endsWith('}')) {
      return {
        valid: false,
        error: 'Malformed JSON: response appears truncated (does not end with })',
        warnings
      };
    }

    return { valid: true, warnings };
  }

  private detectRepetition(text: string): boolean {
    if (!text || text.length < 50) return false;

    // Split into words, filtering out very short ones
    const words = text.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);

    if (words.length < 5) return false;

    // Check for 5+ consecutive identical words (catastrophic repetition)
    for (let i = 0; i < words.length - 4; i++) {
      const word = words[i];
      if (words.slice(i, i + 5).every(w => w === word)) {
        console.error(`[Repetition Detected] Word "${word}" repeated 5+ times consecutively`);
        return true;
      }
    }

    // Check for high overall repetition ratio (same segments repeated)
    const segments = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    if (segments.length > 3) {
      const uniqueSegments = new Set(segments.map(s => s.trim().toLowerCase()));
      const repetitionRatio = 1 - (uniqueSegments.size / segments.length);

      if (repetitionRatio > 0.5) {
        console.error(`[Repetition Detected] High repetition ratio: ${(repetitionRatio * 100).toFixed(1)}%`);
        return true;
      }
    }

    return false;
  }

  private async resolveAudioFile(storageMetadata: StorageMetadata, file: File | undefined, mimeType: string): Promise<File> {
    if (file) {
      return file;
    }
    if (!storageMetadata.downloadUrl) {
      throw new Error('No download URL available in storage metadata. Cannot transcribe audio.');
    }
    const audioBlob = await this.storageService.fetchAudioFromUrl(storageMetadata.downloadUrl);
    const fileName = this.getFileNameFromPath(storageMetadata.downloadUrl);
    return new File([audioBlob], fileName, { type: mimeType });
  }

  private async decodeAudioFile(
    audioFile: File
  ): Promise<{ audioContext: AudioContext; audioBuffer: AudioBuffer } | null> {
    const AudioCtx =
      (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
      (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }

    const audioContext = new AudioCtx();
    try {
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      return { audioContext, audioBuffer };
    } catch (error) {
      console.warn('Failed to decode audio for chunking; falling back to single transcription.', error);
      await audioContext.close();
      return null;
    }
  }

  private splitAudioBufferIntoChunks(audioContext: AudioContext, audioBuffer: AudioBuffer): AudioChunk[] {
    const chunks: AudioChunk[] = [];
    const totalDuration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const channelCount = audioBuffer.numberOfChannels;
    let startTimeSeconds = 0;
    let index = 0;

    while (startTimeSeconds < totalDuration) {
      const endTimeSeconds = Math.min(totalDuration, startTimeSeconds + this.CHUNK_DURATION_SECONDS);
      const startSample = Math.floor(startTimeSeconds * sampleRate);
      const endSample = Math.floor(endTimeSeconds * sampleRate);
      const frameCount = Math.max(0, endSample - startSample);
      const chunkBuffer = audioContext.createBuffer(channelCount, frameCount, sampleRate);

      for (let channel = 0; channel < channelCount; channel++) {
        const sourceData = audioBuffer.getChannelData(channel);
        const chunkData = chunkBuffer.getChannelData(channel);
        chunkData.set(sourceData.subarray(startSample, endSample));
      }

      const audioBlob = this.encodeWav(chunkBuffer);
      chunks.push({
        index,
        startTimeSeconds,
        endTimeSeconds,
        durationSeconds: endTimeSeconds - startTimeSeconds,
        audioBlob
      });

      index += 1;
      startTimeSeconds = endTimeSeconds;
    }

    return chunks;
  }

  private encodeWav(buffer: AudioBuffer): Blob {
    const channelCount = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;
    const samples = buffer.length;
    const blockAlign = channelCount * (bitDepth / 8);
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples * blockAlign;
    const totalSize = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset: number, value: string): void => {
      for (let i = 0; i < value.length; i++) {
        view.setUint8(offset + i, value.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    const channelData: Float32Array[] = [];
    for (let channel = 0; channel < channelCount; channel++) {
      channelData.push(buffer.getChannelData(channel));
    }

    for (let i = 0; i < samples; i++) {
      for (let channel = 0; channel < channelCount; channel++) {
        let sample = channelData[channel][i];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: this.CHUNK_MIME_TYPE });
  }

  private buildChunkPrompt(chunk: AudioChunk, totalChunks: number): string {
    const startTimestamp = this.formatTimestamp(chunk.startTimeSeconds);
    const endTimestamp = this.formatTimestamp(chunk.endTimeSeconds);
    return `${AUDIO_TRANSCRIPTION_PROMPT}

CHUNK CONTEXT:
- This is chunk ${chunk.index + 1} of ${totalChunks} in a longer recording.
- This chunk covers ${startTimestamp} to ${endTimestamp} from the full session start.
- All timestamps must be relative to the FULL session start, not this chunk's start.
- If someone speaks 30 seconds into this chunk, timestamp should be ${this.formatTimestamp(
      Math.round(chunk.startTimeSeconds + 30)
    )}.`;
  }

  private async buildContentsForAudio(audioFile: File, mimeType: string, promptText: string): Promise<{ parts: Array<any> }> {
    if (audioFile.size <= MAX_INLINE_AUDIO_BYTES) {
      const inlineData = await this.fileToBase64(audioFile);
      return {
        parts: [
          { inlineData: { mimeType, data: inlineData } },
          { text: promptText }
        ]
      };
    }

    const uploadResult = await this.ai.files.upload({
      file: audioFile,
      config: {
        mimeType,
        displayName: audioFile.name
      }
    });
    if (!uploadResult.uri) {
      throw new Error('File upload succeeded but no URI was returned');
    }

    return {
      parts: [
        { fileData: { fileUri: uploadResult.uri, mimeType } },
        { text: promptText }
      ]
    };
  }

  private mergeChunkResults(chunks: Array<{ chunk: AudioChunk; result: any }>): any {
    const mergedSegments: Array<{ timeSeconds: number; text: string; speaker?: string }> = [];

    for (const { chunk, result } of chunks) {
      const segments = Array.isArray(result?.segments) ? result.segments : [];
      for (const segment of segments) {
        const rawTime = Number(segment?.timeSeconds ?? 0);
        const adjustedTime =
          chunk.startTimeSeconds > 0 && rawTime < chunk.startTimeSeconds - 5 ? rawTime + chunk.startTimeSeconds : rawTime;
        mergedSegments.push({
          timeSeconds: Math.max(0, Math.round(adjustedTime)),
          text: segment?.text,
          speaker: segment?.speaker
        });
      }
    }

    mergedSegments.sort((a, b) => a.timeSeconds - b.timeSeconds);

    return {
      segments: mergedSegments
    };
  }

  private async fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  private normalizeTranscription(result: any, storageMetadata: StorageMetadata): TranscriptionResult {
    const segments = Array.isArray(result?.segments) ? result.segments : [];
    const timestamps = segments
      .map((segment: any) => {
        const timeSeconds = Number(segment?.timeSeconds ?? 0);
        const text = typeof segment?.text === 'string' ? segment.text.trim() : '';
        if (!text) {
          return null;
        }
        return {
          time: Math.max(0, Math.round(timeSeconds)),
          text: segment?.speaker ? `${segment.speaker}: ${text}` : text
        };
      })
      .filter(Boolean) as { time: number; text: string }[];

    const rawTranscript =
      timestamps.length > 0
        ? timestamps.map(entry => `[${this.formatTimestamp(entry.time)}] ${entry.text}`).join('\n')
        : '';

    return {
      id: storageMetadata.sessionId,
      rawTranscript,
      timestamps,
      status: 'completed',
      storageMetadata
    };
  }

  private handleTranscriptionError(error: any): Observable<never> {
    let errorMessage = 'Failed to transcribe the audio.';
    let status = error?.status || 500;

    if (error?.message) {
      const msg = error.message.toLowerCase();
      if (msg.includes('no speech detected') || msg.includes('no audio detected')) {
        errorMessage = 'No speech detected in the audio file. Please verify the file contains audio content.';
        status = 400;
      } else if (msg.includes('corrupted') || msg.includes('unreadable')) {
        errorMessage = 'The audio file appears to be corrupted or unreadable. Please try uploading it again.';
        status = 400;
      } else if (msg.includes('inaccessible') || msg.includes('empty')) {
        errorMessage = 'Unable to access the audio file. It may be empty or the download link expired.';
        status = 400;
      } else if (msg.includes('no valid speech content')) {
        errorMessage = 'No valid speech content found. The audio may contain only silence or noise.';
        status = 400;
      } else {
        errorMessage = error.message;
      }
    }

    if (isOverloadedError(error)) {
      errorMessage = 'The AI service is overloaded. Please try again shortly.';
      status = 503;
    }

    return throwError(() => ({
      status,
      message: errorMessage,
      error
    }));
  }

  private formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${mins}:${secs}`;
  }

  private getFileNameFromPath(path: string): string {
    const parts = path.split('/');
    const fileName = parts[parts.length - 1];
    return fileName || 'session-audio';
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
