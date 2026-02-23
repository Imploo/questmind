# Split AudioTranscriptionService into Focused Services

**Priority:** CRITICAL
**Estimated Effort:** 1 week
**Code Review Issue:** #2
**Status:** Done

## Problem

`AudioTranscriptionService` is a "god service" with 990 lines and **9 distinct responsibilities**:

1. AI transcription API calls
2. Audio file chunking
3. WAV encoding
4. Firestore persistence
5. Chunk tracking & resumption
6. Response validation
7. Error handling & retry logic
8. Timestamp merging
9. Token usage monitoring

## Current Evidence

```typescript
export class AudioTranscriptionService {
  transcribeAudio()               // Orchestration
  private requestTranscription()  // API calls
  private splitAudioBufferIntoChunks() // Audio processing
  private encodeWav()            // Audio encoding
  private saveTranscriptionChunk() // Firestore operations
  private validateTranscriptionResponse() // Validation
  private mergeChunkResults()    // Data transformation
  private handleTranscriptionError() // Error handling
}
```

## Solution

Extract into **4 specialized services** following Single Responsibility Principle.

### New Service Architecture

```
TranscriptionCoordinatorService (Orchestrator)
├── AudioChunkingService (Audio processing)
├── TranscriptionApiService (API client)
└── TranscriptionStorageService (Persistence)
```

### Implementation Steps

#### 1. Create AudioChunkingService

**File:** `src/app/audio/audio-chunking.service.ts`

**Responsibilities:**
- Split audio into chunks
- WAV encoding
- Audio buffer decoding

```typescript
import { Injectable } from '@angular/core';

export interface AudioChunk {
  index: number;
  buffer: AudioBuffer;
  startTime: number;
  endTime: number;
}

@Injectable({ providedIn: 'root' })
export class AudioChunkingService {
  private readonly CHUNK_DURATION_SECONDS = 180; // 3 minutes
  private readonly MAX_CHUNK_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

  /**
   * Decode audio file into AudioBuffer
   */
  async decodeAudioFile(file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext();
    return audioContext.decodeAudioData(arrayBuffer);
  }

  /**
   * Split AudioBuffer into chunks
   */
  splitIntoChunks(buffer: AudioBuffer): AudioChunk[] {
    const sampleRate = buffer.sampleRate;
    const chunkSamples = this.CHUNK_DURATION_SECONDS * sampleRate;
    const totalSamples = buffer.length;
    const chunks: AudioChunk[] = [];

    for (let start = 0; start < totalSamples; start += chunkSamples) {
      const end = Math.min(start + chunkSamples, totalSamples);
      const chunkBuffer = this.extractChunk(buffer, start, end);

      chunks.push({
        index: chunks.length,
        buffer: chunkBuffer,
        startTime: start / sampleRate,
        endTime: end / sampleRate
      });
    }

    return chunks;
  }

  /**
   * Encode AudioBuffer to WAV format
   */
  encodeWav(buffer: AudioBuffer): Blob {
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    // WAV encoding logic (moved from current service)
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = buffer.length * blockAlign;
    const headerSize = 44;
    const fileSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(fileSize);
    const view = new DataView(arrayBuffer);

    // Write WAV header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, fileSize - 8, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write audio data
    this.writeAudioData(view, 44, buffer);

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  private extractChunk(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
    // Implementation (move from current service)
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  private writeAudioData(view: DataView, offset: number, buffer: AudioBuffer): void {
    // Implementation (move from current service)
  }
}
```

#### 2. Create TranscriptionApiService

**File:** `src/app/audio/transcription-api.service.ts`

**Responsibilities:**
- Make API calls to Gemini
- Handle API-specific errors
- Validate responses
- Track token usage

```typescript
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, retry } from 'rxjs/operators';
import { GoogleGenAI } from '@google/genai';
import { environment } from '../../environments/environment';

export interface TranscriptionResponse {
  text: string;
  timestamps?: Array<{ text: string; timestamp: string }>;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

@Injectable({ providedIn: 'root' })
export class TranscriptionApiService {
  private readonly ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: environment.googleAiApiKey });
  }

  /**
   * Transcribe a single audio file/chunk
   */
  transcribe(audioBlob: Blob, prompt: string): Observable<TranscriptionResponse> {
    return from(this.makeApiCall(audioBlob, prompt)).pipe(
      map(response => this.validateAndParse(response)),
      catchError(error => this.handleError(error)),
      retry({
        count: 3,
        delay: (error, retryCount) => this.getRetryDelay(error, retryCount)
      })
    );
  }

  private async makeApiCall(audioBlob: Blob, prompt: string): Promise<any> {
    const base64Audio = await this.blobToBase64(audioBlob);

    return this.ai.models.generateContent({
      model: environment.aiModel,
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: base64Audio
            }
          }
        ]
      }],
      config: {
        temperature: 0.1,
        maxOutputTokens: 8192
      }
    });
  }

  private validateAndParse(response: any): TranscriptionResponse {
    // Validation logic (move from current service)
    if (!response?.text) {
      throw new Error('Invalid transcription response');
    }

    return {
      text: response.text,
      timestamps: this.extractTimestamps(response.text),
      tokenUsage: response.usageMetadata
    };
  }

  private extractTimestamps(text: string): Array<{ text: string; timestamp: string }> {
    // Implementation (move from current service)
    return [];
  }

  private handleError(error: any): Observable<never> {
    // Error handling logic
    return throwError(() => error);
  }

  private getRetryDelay(error: any, retryCount: number): number {
    // Retry logic (move from current service)
    return Math.min(1000 * Math.pow(2, retryCount), 10000);
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
```

#### 3. Create TranscriptionStorageService

**File:** `src/app/audio/transcription-storage.service.ts`

**Responsibilities:**
- Save transcriptions to Firestore
- Save/load chunks for resumption
- Query transcription history

```typescript
import { Injectable, inject } from '@angular/core';
import { FirebaseService } from '../core/firebase.service';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { TranscriptionResult, TranscriptionRecord } from './audio-session.models';

@Injectable({ providedIn: 'root' })
export class TranscriptionStorageService {
  private readonly firebase = inject(FirebaseService);

  async saveTranscription(
    campaignId: string,
    sessionId: string,
    transcription: TranscriptionResult,
    label: string
  ): Promise<string> {
    const db = this.firebase.requireFirestore();
    const transcriptionsRef = collection(
      db,
      `campaigns/${campaignId}/audioSessions/${sessionId}/transcriptions`
    );

    const transcriptionId = crypto.randomUUID();
    const record: TranscriptionRecord = {
      id: transcriptionId,
      transcription,
      label,
      createdAt: new Date().toISOString()
    };

    await setDoc(doc(transcriptionsRef, transcriptionId), record);
    return transcriptionId;
  }

  async saveChunk(
    campaignId: string,
    transcriptionId: string,
    chunkIndex: number,
    result: any
  ): Promise<void> {
    const db = this.firebase.requireFirestore();
    const chunkRef = doc(
      db,
      `campaigns/${campaignId}/transcriptionChunks/${transcriptionId}/chunks/${chunkIndex}`
    );

    await setDoc(chunkRef, {
      index: chunkIndex,
      result,
      completedAt: new Date().toISOString()
    });
  }

  async findIncompleteTranscription(
    campaignId: string,
    sessionId: string
  ): Promise<string | null> {
    // Implementation (move from current service)
    return null;
  }

  async loadChunks(campaignId: string, transcriptionId: string): Promise<any[]> {
    // Implementation (move from current service)
    return [];
  }
}
```

#### 4. Create TranscriptionCoordinatorService

**File:** `src/app/audio/transcription-coordinator.service.ts`

**Responsibilities:**
- Orchestrate the transcription workflow
- Coordinate between chunking, API, and storage services
- Manage progress tracking
- Handle resumption logic

```typescript
import { Injectable, inject } from '@angular/core';
import { Observable, from, forkJoin, of } from 'rxjs';
import { map, switchMap, tap, catchError } from 'rxjs/operators';
import { AudioChunkingService } from './audio-chunking.service';
import { TranscriptionApiService } from './transcription-api.service';
import { TranscriptionStorageService } from './transcription-storage.service';
import { StorageMetadata, TranscriptionResult } from './audio-session.models';

@Injectable({ providedIn: 'root' })
export class TranscriptionCoordinatorService {
  private readonly chunking = inject(AudioChunkingService);
  private readonly api = inject(TranscriptionApiService);
  private readonly storage = inject(TranscriptionStorageService);

  transcribe(
    metadata: StorageMetadata,
    file?: File,
    transcriptionId?: string
  ): Observable<TranscriptionResult> {
    // High-level orchestration
    return from(this.initializeTranscription(metadata, file)).pipe(
      switchMap(({ chunks, id }) => this.processChunks(chunks, id, metadata.campaignId)),
      map(results => this.mergeResults(results)),
      tap(result => this.logCompletion(result))
    );
  }

  private async initializeTranscription(
    metadata: StorageMetadata,
    file?: File
  ): Promise<{ chunks: any[]; id: string }> {
    // Initialization logic
    return { chunks: [], id: '' };
  }

  private processChunks(
    chunks: any[],
    transcriptionId: string,
    campaignId: string
  ): Observable<any[]> {
    // Process each chunk
    return forkJoin(
      chunks.map(chunk => this.processChunk(chunk, transcriptionId, campaignId))
    );
  }

  private processChunk(
    chunk: any,
    transcriptionId: string,
    campaignId: string
  ): Observable<any> {
    // Process single chunk
    return of(null);
  }

  private mergeResults(results: any[]): TranscriptionResult {
    // Merge chunk results
    return {} as TranscriptionResult;
  }

  private logCompletion(result: TranscriptionResult): void {
    console.log('Transcription completed:', result);
  }
}
```

### Migration Plan

1. **Phase 1:** Create new services (all at once for consistency)
2. **Phase 2:** Update `AudioSessionComponent` to use `TranscriptionCoordinatorService`
3. **Phase 3:** Test thoroughly with various audio files
4. **Phase 4:** Remove old `AudioTranscriptionService` methods incrementally
5. **Phase 5:** Delete old service when fully migrated

### Testing Strategy

- Unit test each service independently
- Integration tests for coordinator
- Test chunking with various file sizes
- Test resumption logic
- Test error handling and retries

## Benefits

- Each service has single responsibility
- Easier to test in isolation
- Audio processing can be reused
- API client can be swapped
- Storage can be changed without affecting logic
- Better separation of concerns

## Expected Metrics

| Service | Lines | Responsibility |
|---------|-------|----------------|
| AudioChunkingService | ~200 | Audio processing |
| TranscriptionApiService | ~150 | API calls |
| TranscriptionStorageService | ~100 | Persistence |
| TranscriptionCoordinatorService | ~150 | Orchestration |

**Total:** ~600 lines (vs 990 currently, 39% reduction)
