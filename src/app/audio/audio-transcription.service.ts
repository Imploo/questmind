import {Injectable} from '@angular/core';
import {from, Observable, throwError} from 'rxjs';
import {catchError, map, retry} from 'rxjs/operators';
import {GoogleGenAI, Type} from '@google/genai';
import {
  collection,
  doc,
  type Firestore,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc
} from 'firebase/firestore';

import {AUDIO_TRANSCRIPTION_PROMPT} from '../prompts';
import {AudioStorageService} from './audio-storage.service';
import {FirebaseService} from '../core/firebase.service';
import {
  CHUNK_DURATION_SECONDS,
  CHUNK_MIME_TYPE,
  getRetryDelay,
  isOverloadedError,
  MAX_INLINE_AUDIO_BYTES,
  MAX_RETRY_ATTEMPTS,
  MAX_TRANSCRIPTION_OUTPUT_TOKENS
} from './audio-utilities';
import {StorageMetadata, TranscriptionChunk, TranscriptionRecord, TranscriptionResult} from './audio-session.models';
import {environment} from '../../environments/environment';
import {KankaSearchResult} from '../kanka/kanka.models';

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

  constructor(
    private readonly storageService: AudioStorageService,
    private readonly firebase: FirebaseService
  ) {
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    this.db = this.firebase.firestore;
  }

  transcribeAudio(
    storageMetadata: StorageMetadata,
    file?: File,
    campaignId?: string,
    transcriptionId?: string,
    kankaContext?: KankaSearchResult
  ): Observable<TranscriptionResult> {
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

    return from(this.requestTranscription(storageMetadata, file, campaignId, transcriptionId, kankaContext)).pipe(
      retry({
        count: MAX_RETRY_ATTEMPTS,
        delay: (error, retryCount) => getRetryDelay(error, retryCount)
      }),
      map(result => this.normalizeTranscription(result, storageMetadata)),
      catchError(error => this.handleTranscriptionError(error))
    );
  }

  async saveTranscription(
    campaignId: string,
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
      'campaigns',
      campaignId,
      'audioSessions',
      sessionId,
      'transcriptions',
      transcriptionId
    );

    await setDoc(transcriptionRef, transcriptionRecord);
    return transcriptionId;
  }

  private async requestTranscription(
    storageMetadata: StorageMetadata,
    file?: File,
    campaignId?: string,
    transcriptionId?: string,
    kankaContext?: KankaSearchResult
  ): Promise<any> {
    const mimeType = storageMetadata.contentType || 'audio/mpeg';
    const audioFile = await this.resolveAudioFile(storageMetadata, file, mimeType);
    const decoded = await this.decodeAudioFile(audioFile);

    if (decoded) {
      try {
        if (decoded.audioBuffer.duration > CHUNK_DURATION_SECONDS) {
          // Store duration in metadata for chunk tracking
          storageMetadata.durationSeconds = decoded.audioBuffer.duration;
          storageMetadata.sizeBytes = audioFile.size;
          return await this.requestChunkedTranscription(
            decoded.audioContext,
            decoded.audioBuffer,
            storageMetadata,
            campaignId,
            transcriptionId,
            kankaContext
          );
        }
      } finally {
        await decoded.audioContext.close();
      }
    }

    return this.requestSingleTranscription(audioFile, mimeType, kankaContext);
  }

  private async requestSingleTranscription(audioFile: File, mimeType: string, kankaContext?: KankaSearchResult): Promise<any> {
    const prompt = this.buildTranscriptionPrompt(kankaContext);
    const contents = await this.buildContentsForAudio(audioFile, mimeType, prompt);
    return this.callTranscriptionModel(contents);
  }

  private async requestChunkedTranscription(
    audioContext: AudioContext,
    audioBuffer: AudioBuffer,
    storageMetadata?: StorageMetadata,
    campaignId?: string,
    transcriptionId?: string,
    kankaContext?: KankaSearchResult
  ): Promise<any> {
    const chunks = this.splitAudioBufferIntoChunks(audioContext, audioBuffer);
    const chunkResults: Array<{ chunk: AudioChunk; result: any }> = [];
    const sessionId = storageMetadata?.sessionId || '';

    console.info(
      `Chunked audio into ${chunks.length} parts (${CHUNK_DURATION_SECONDS}s each). ` +
        `Total duration: ${Math.round(audioBuffer.duration)}s.`
    );
    chunks.forEach(chunk => {
      console.info(
        `Chunk ${chunk.index + 1}/${chunks.length}: ${this.formatTimestamp(chunk.startTimeSeconds)}-` +
          `${this.formatTimestamp(chunk.endTimeSeconds)} ` +
          `(${Math.round(chunk.durationSeconds)}s), ${chunk.audioBlob.size} bytes`
      );
    });

    // Initialize transcription record if we have the required info
    let existingRecord: TranscriptionRecord | null = null;
    if (campaignId && transcriptionId && sessionId && storageMetadata) {
      // Check for existing incomplete transcription
      existingRecord = await this.getExistingTranscriptionRecord(campaignId, sessionId, transcriptionId);
      
      if (existingRecord && !existingRecord.isComplete && existingRecord.chunks && existingRecord.chunks.length > 0) {
        console.log('Resuming incomplete transcription...');
        console.log(`Found ${existingRecord.completedChunks}/${existingRecord.totalChunks} completed chunks`);
        
        // Load completed chunk results from existing record
        for (const existingChunk of existingRecord.chunks) {
          if (existingChunk.status === 'completed' && existingChunk.segments) {
            const matchingChunk = chunks.find(c => c.index === existingChunk.index);
            if (matchingChunk) {
              chunkResults.push({
                chunk: matchingChunk,
                result: { segments: existingChunk.segments }
              });
            }
          }
        }
      } else {
        // Initialize new transcription record
        await this.initializeTranscriptionRecord(campaignId, sessionId, transcriptionId, storageMetadata, chunks.length);
      }
    }

    for (const chunk of chunks) {
      // Check if this chunk was already completed
      const existingChunk = existingRecord?.chunks?.find(c => c.index === chunk.index);
      if (existingChunk?.status === 'completed') {
        console.log(`Skipping already-completed chunk ${chunk.index + 1}/${chunks.length}`);
        continue;
      }

      const transcriptionChunk: TranscriptionChunk = {
        index: chunk.index,
        startTimeSeconds: chunk.startTimeSeconds,
        endTimeSeconds: chunk.endTimeSeconds,
        durationSeconds: chunk.durationSeconds,
        status: 'processing'
      };

      try {
        // Save "processing" status
        if (campaignId && transcriptionId && sessionId) {
          await this.saveTranscriptionChunk(campaignId, sessionId, transcriptionId, transcriptionChunk);
        }

        // Transcribe chunk
        const startTime = Date.now();
        const prompt = this.buildChunkPrompt(chunk, chunks.length, kankaContext);
        const chunkFile = new File([chunk.audioBlob], `session-chunk-${chunk.index + 1}.wav`, {
          type: CHUNK_MIME_TYPE
        });
        const contents = await this.buildContentsForAudio(chunkFile, CHUNK_MIME_TYPE, prompt);
        const result = await this.callTranscriptionModel(contents);
        const processingTimeMs = Date.now() - startTime;

        // Extract segments
        const segments = Array.isArray(result?.segments) ? result.segments : [];

        // Update chunk status to completed
        transcriptionChunk.status = 'completed';
        transcriptionChunk.segments = segments;
        transcriptionChunk.completedAt = new Date();
        transcriptionChunk.processingTimeMs = processingTimeMs;

        // Save completed chunk
        if (campaignId && transcriptionId && sessionId) {
          await this.saveTranscriptionChunk(campaignId, sessionId, transcriptionId, transcriptionChunk);
        }

        console.log(
          `Chunk ${chunk.index + 1}/${chunks.length} completed ` +
          `(${segments.length} segments, ${processingTimeMs}ms)`
        );

        chunkResults.push({ chunk, result });

      } catch (error) {
        console.error(`Chunk ${chunk.index} failed:`, error);

        // Update chunk status to failed
        transcriptionChunk.status = 'failed';
        transcriptionChunk.error = error instanceof Error ? error.message : String(error);
        transcriptionChunk.failedAt = new Date();
        transcriptionChunk.retryCount = (transcriptionChunk.retryCount || 0) + 1;

        // Save failed chunk
        if (campaignId && transcriptionId && sessionId) {
          await this.saveTranscriptionChunk(campaignId, sessionId, transcriptionId, transcriptionChunk);
        }

        // Re-throw error to trigger retry logic at higher level
        throw error;
      }
    }

    const mergedResult = this.mergeChunkResults(chunkResults);

    // Mark transcription as complete
    if (campaignId && transcriptionId && sessionId && storageMetadata) {
      const normalizedResult = this.normalizeTranscription(mergedResult, storageMetadata);
      await this.markTranscriptionComplete(campaignId, sessionId, transcriptionId, normalizedResult);
    }

    return mergedResult;
  }

  private async callTranscriptionModel(contents: { parts: Array<any> }): Promise<any> {
    const response = await this.ai.models.generateContent({
      model: environment.audioModel,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: this.TRANSCRIPTION_SCHEMA,
        maxOutputTokens: MAX_TRANSCRIPTION_OUTPUT_TOKENS,
        temperature: 0.1,
        topP: 1,
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
      const endTimeSeconds = Math.min(totalDuration, startTimeSeconds + CHUNK_DURATION_SECONDS);
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

    return new Blob([arrayBuffer], { type: CHUNK_MIME_TYPE });
  }

  private buildTranscriptionPrompt(kankaContext?: KankaSearchResult): string {
    if (!kankaContext) {
      return AUDIO_TRANSCRIPTION_PROMPT;
    }

    const contextPrompt = this.buildKankaContextPrompt(kankaContext);
    return `${AUDIO_TRANSCRIPTION_PROMPT}

${contextPrompt}`;
  }

  private buildChunkPrompt(chunk: AudioChunk, totalChunks: number, kankaContext?: KankaSearchResult): string {
    const startTimestamp = this.formatTimestamp(chunk.startTimeSeconds);
    const endTimestamp = this.formatTimestamp(chunk.endTimeSeconds);
    const basePrompt = this.buildTranscriptionPrompt(kankaContext);

    return `${basePrompt}

CHUNK CONTEXT:
- This is chunk ${chunk.index + 1} of ${totalChunks} in a longer recording.
- This chunk covers ${startTimestamp} to ${endTimestamp} from the full session start.
- All timestamps must be relative to the FULL session start, not this chunk's start.
- If someone speaks 30 seconds into this chunk, timestamp should be ${this.formatTimestamp(
      Math.round(chunk.startTimeSeconds + 30)
    )}.`;
  }

  private buildKankaContextPrompt(context: KankaSearchResult): string {
    const sections: string[] = [];

    const addSection = (
      label: string,
      entities: Array<{ name: string; entry?: string; entry_parsed?: string }>
    ) => {
      if (!entities?.length) {
        return;
      }
      const names = entities.map(entity => entity.name).join(', ');
      sections.push(`${label}: ${names}`);
    };

    addSection('Characters', context.characters);
    addSection('Locations', context.locations);
    addSection('Quests', context.quests);
    addSection('Organisations', context.organisations);

    if (sections.length === 0) {
      return '';
    }

    return `CAMPAIGN REFERENCE (for name/place accuracy only):
${sections.join('\n')}

Remember: Use this context ONLY to spell names and places correctly when you hear them. Do not add information that wasn't spoken.`;
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

  private async saveTranscriptionChunk(
    campaignId: string,
    sessionId: string,
    transcriptionId: string,
    chunk: TranscriptionChunk
  ): Promise<void> {
    if (!this.db) {
      console.warn('Firestore not available, chunk not persisted');
      return;
    }

    const transcriptionRef = doc(
      this.db,
      'campaigns',
      campaignId,
      'audioSessions',
      sessionId,
      'transcriptions',
      transcriptionId
    );

    const docSnap = await getDoc(transcriptionRef);
    if (!docSnap.exists()) {
      console.warn('Transcription record does not exist, cannot save chunk');
      return;
    }

    const data = docSnap.data() as TranscriptionRecord;
    const chunks = data.chunks || [];
    const existingChunkIndex = chunks.findIndex(c => c.index === chunk.index);

    if (existingChunkIndex >= 0) {
      chunks[existingChunkIndex] = chunk;
    } else {
      chunks.push(chunk);
    }

    const completedChunks = chunks.filter(c => c.status === 'completed').length;
    const totalChunks = data.totalChunks || 0;
    const isComplete = totalChunks > 0 && completedChunks === totalChunks;

    await updateDoc(transcriptionRef, {
      chunks,
      completedChunks,
      lastProcessedChunkIndex: chunk.index,
      isComplete,
      status: isComplete ? 'completed' : 'processing'
    });

    console.log(
      `Chunk ${chunk.index} saved (${completedChunks}/${totalChunks} complete)`
    );
  }

  private async initializeTranscriptionRecord(
    campaignId: string,
    sessionId: string,
    transcriptionId: string,
    storageMetadata: StorageMetadata,
    totalChunks: number
  ): Promise<void> {
    if (!this.db) return;

    const transcriptionRef = doc(
      this.db,
      'campaigns',
      campaignId,
      'audioSessions',
      sessionId,
      'transcriptions',
      transcriptionId
    );

    const record: TranscriptionRecord = {
      id: transcriptionId,
      sessionId,
      rawTranscript: '',
      timestamps: [],
      status: 'processing',
      createdAt: new Date().toISOString(),
      isComplete: false,
      completedChunks: 0,
      totalChunks,
      lastProcessedChunkIndex: -1,
      chunks: []
    };

    await setDoc(transcriptionRef, record);
    console.log(`Transcription record initialized: ${totalChunks} chunks`);
  }

  async getExistingTranscriptionRecord(
    campaignId: string,
    sessionId: string,
    transcriptionId: string
  ): Promise<TranscriptionRecord | null> {
    if (!this.db) return null;

    const transcriptionRef = doc(
      this.db,
      'campaigns',
      campaignId,
      'audioSessions',
      sessionId,
      'transcriptions',
      transcriptionId
    );

    const docSnap = await getDoc(transcriptionRef);
    return docSnap.exists() ? (docSnap.data() as TranscriptionRecord) : null;
  }

  async findIncompleteTranscription(campaignId: string, sessionId: string): Promise<string | null> {
    if (!this.db) return null;

    const transcriptionsRef = collection(
      this.db,
      'campaigns',
      campaignId,
      'audioSessions',
      sessionId,
      'transcriptions'
    );
    const transcriptionsQuery = query(transcriptionsRef, orderBy('createdAt', 'desc'));

    try {
      const snapshot = await getDocs(transcriptionsQuery);
      
      // Find the first incomplete transcription
      for (const docSnap of snapshot.docs) {
        const record = docSnap.data() as TranscriptionRecord;
        if (!record.isComplete && record.status === 'processing' && record.chunks && record.chunks.length > 0) {
          console.log(`Found incomplete transcription: ${record.id} (${record.completedChunks}/${record.totalChunks} chunks)`);
          return record.id;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Failed to search for incomplete transcriptions:', error);
      return null;
    }
  }

  private async markTranscriptionComplete(
    campaignId: string,
    sessionId: string,
    transcriptionId: string,
    result: TranscriptionResult
  ): Promise<void> {
    if (!this.db) return;

    const transcriptionRef = doc(
      this.db,
      'campaigns',
      campaignId,
      'audioSessions',
      sessionId,
      'transcriptions',
      transcriptionId
    );

    await updateDoc(transcriptionRef, {
      isComplete: true,
      status: 'completed',
      rawTranscript: result.rawTranscript,
      timestamps: result.timestamps
    });

    console.log('Transcription marked as complete');
  }

  async clearTranscriptionRecord(
    campaignId: string,
    sessionId: string,
    transcriptionId: string
  ): Promise<void> {
    if (!this.db) return;

    const transcriptionRef = doc(
      this.db,
      'campaigns',
      campaignId,
      'audioSessions',
      sessionId,
      'transcriptions',
      transcriptionId
    );

    await updateDoc(transcriptionRef, {
      chunks: [],
      completedChunks: 0,
      lastProcessedChunkIndex: -1,
      isComplete: false,
      status: 'processing'
    });

    console.log('Transcription record cleared for fresh start');
  }
}
