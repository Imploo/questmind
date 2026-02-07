# Ticket 13: Resume Transcription from Failure Points

## Priority: MEDIUM

## Status: Not Started

## Summary

Implement persistent storage of transcription progress per audio chunk so users can resume failed transcriptions without reprocessing completed chunks. Currently, if transcription fails mid-process, users must restart from the beginning, wasting time and API costs.

## Problem Description

**Current Behavior:**

- Transcriptions process audio in chunks (10-minute segments)
- If any chunk fails (network error, API error, token limit, etc.), the entire transcription is lost
- "Re-transcribe" button always starts from scratch, even if 90% of chunks succeeded
- No persistence of intermediate chunk results
- Users wait for full transcription again, incurring duplicate API costs

**User Impact:**

- Frustrating experience when 45-minute session fails at minute 40
- Wasted API costs reprocessing successful chunks
- No visibility into which chunks succeeded/failed
- Long audio files are risky to process (high failure likelihood)

## Requirements

### Core Functionality

1. **Chunk-Level Persistence**

   - Save each transcription chunk result to Firestore immediately upon completion
   - Store chunk metadata: index, start/end time, status, transcript segments
   - Persist chunk results independently of overall transcription completion

2. **Completion Tracking**

   - Add `isComplete` boolean field to transcription records
   - Mark `isComplete: false` when transcription starts
   - Mark `isComplete: true` only when ALL chunks succeed
   - Store `completedChunks` count and `totalChunks` count

3. **Resume Logic**

   - On "Re-transcribe" click, check existing transcription record
   - If `isComplete === false`:
     - Resume from incomplete chunks
     - Display "Resuming transcription from chunk X/Y"
     - Skip chunks that already have valid results
   - If `isComplete === true`:
     - Start fresh transcription
     - Display "Starting new transcription"
     - Clear old transcription data

4. **Failed Chunk Handling**
   - Mark failed chunks with `status: 'failed'`
   - Retry failed chunks on resume
   - Preserve successful chunks, only retry failures
   - Track retry attempts per chunk (max 3 retries)

### Data Model Changes

**Firestore Schema Update** (`audioSessions/{sessionId}/transcriptions/{transcriptionId}`):

```typescript
interface TranscriptionRecord {
  // Existing fields
  sessionId: string;
  createdAt: Timestamp;
  audioDownloadUrl: string;
  fileSizeBytes: number;
  durationSeconds: number;

  // NEW: Completion tracking
  isComplete: boolean; // Overall completion status
  completedChunks: number; // Count of successful chunks
  totalChunks: number; // Total expected chunks
  lastProcessedChunkIndex: number; // Last chunk attempted

  // NEW: Chunk results
  chunks: TranscriptionChunk[]; // Array of chunk results

  // Existing: Final result (only when isComplete = true)
  result?: TranscriptionResult;
  error?: string;
}

interface TranscriptionChunk {
  index: number; // Chunk index (0-based)
  startTimeSeconds: number; // Chunk start time
  endTimeSeconds: number; // Chunk end time
  durationSeconds: number; // Chunk duration

  status: 'pending' | 'processing' | 'completed' | 'failed';

  // Completed chunks
  segments?: TranscriptionSegment[]; // Transcribed segments
  completedAt?: Timestamp; // When chunk succeeded

  // Failed chunks
  error?: string; // Error message
  failedAt?: Timestamp; // When chunk failed
  retryCount?: number; // Number of retry attempts

  // API metadata
  tokensUsed?: number; // Tokens consumed
  thoughtsTokens?: number; // Internal reasoning tokens
  processingTimeMs?: number; // Processing duration
}

interface TranscriptionSegment {
  timeSeconds: number; // Segment timestamp
  text: string; // Transcribed text
  speaker?: string; // Speaker label (optional)
}
```

### UI/UX Changes

**Transcription Status Display:**

```typescript
// Show chunk progress during transcription
'Transcribing chunk 3 of 5...';
'Chunk 3 completed (28:30 - 38:30)';

// Show resume status
'Previous transcription incomplete (3 of 5 chunks completed)';
'Resuming from chunk 4...';

// Show completion
'Transcription complete! All 5 chunks processed.';
```

**Re-transcribe Button Logic:**

```typescript
// If incomplete
"Resume Transcription" (primary action)
"Start New Transcription" (secondary action)

// If complete
"Re-transcribe" (starts fresh)
```

## Implementation Plan

### Phase 1: Data Model & Persistence

**File**: `src/app/audio/audio-session.models.ts`

```typescript
// Add new interfaces
export interface TranscriptionChunk {
  index: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  segments?: TranscriptionSegment[];
  completedAt?: Date;
  error?: string;
  failedAt?: Date;
  retryCount?: number;
  tokensUsed?: number;
  thoughtsTokens?: number;
  processingTimeMs?: number;
}

export interface TranscriptionSegment {
  timeSeconds: number;
  text: string;
  speaker?: string;
}

// Update TranscriptionRecord
export interface TranscriptionRecord {
  // ... existing fields
  isComplete: boolean;
  completedChunks: number;
  totalChunks: number;
  lastProcessedChunkIndex: number;
  chunks: TranscriptionChunk[];
  result?: TranscriptionResult;
  error?: string;
}
```

**File**: `src/app/audio/audio-transcription.service.ts`

```typescript
// Add chunk persistence methods

private async saveTranscriptionChunk(
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
    'audioSessions',
    sessionId,
    'transcriptions',
    transcriptionId
  );

  // Fetch current transcription record
  const docSnap = await getDoc(transcriptionRef);
  const data = docSnap.data() as TranscriptionRecord;

  // Update chunks array
  const chunks = data.chunks || [];
  const existingChunkIndex = chunks.findIndex(c => c.index === chunk.index);

  if (existingChunkIndex >= 0) {
    chunks[existingChunkIndex] = chunk;
  } else {
    chunks.push(chunk);
  }

  // Calculate completion status
  const completedChunks = chunks.filter(c => c.status === 'completed').length;
  const isComplete = completedChunks === data.totalChunks;

  // Update Firestore
  await updateDoc(transcriptionRef, {
    chunks,
    completedChunks,
    lastProcessedChunkIndex: chunk.index,
    isComplete,
    updatedAt: serverTimestamp()
  });

  console.log(
    `Chunk ${chunk.index} saved (${completedChunks}/${data.totalChunks} complete)`
  );
}

private async initializeTranscriptionRecord(
  sessionId: string,
  transcriptionId: string,
  metadata: StorageMetadata,
  totalChunks: number
): Promise<void> {
  if (!this.db) return;

  const transcriptionRef = doc(
    this.db,
    'audioSessions',
    sessionId,
    'transcriptions',
    transcriptionId
  );

  const record: TranscriptionRecord = {
    sessionId,
    transcriptionId,
    createdAt: serverTimestamp(),
    audioDownloadUrl: metadata.downloadUrl,
    fileSizeBytes: metadata.sizeBytes,
    durationSeconds: metadata.durationSeconds,
    isComplete: false,
    completedChunks: 0,
    totalChunks,
    lastProcessedChunkIndex: -1,
    chunks: []
  };

  await setDoc(transcriptionRef, record);
  console.log(`Transcription record initialized: ${totalChunks} chunks`);
}
```

### Phase 2: Chunked Processing with Persistence

**File**: `src/app/audio/audio-transcription.service.ts`

```typescript
// Update requestTranscription to save chunks incrementally

private async requestTranscription(
  storageMetadata: StorageMetadata,
  file?: File
): Promise<TranscriptionResult> {
  const sessionId = storageMetadata.sessionId;
  const transcriptionId = storageMetadata.storagePath.split('/').pop() || '';

  // Check if resuming from previous incomplete transcription
  const existingRecord = await this.getExistingTranscriptionRecord(
    sessionId,
    transcriptionId
  );

  let chunks: AudioChunk[];
  let startChunkIndex = 0;

  if (existingRecord && !existingRecord.isComplete) {
    console.log('Resuming incomplete transcription...');

    // Restore chunks array
    chunks = await this.loadAudioChunks(file, storageMetadata);

    // Identify chunks that need processing
    const completedIndices = new Set(
      existingRecord.chunks
        .filter(c => c.status === 'completed')
        .map(c => c.index)
    );

    // Skip completed chunks
    chunks = chunks.filter(c => !completedIndices.has(c.index));
    startChunkIndex = existingRecord.lastProcessedChunkIndex + 1;

    console.log(
      `Resuming from chunk ${startChunkIndex} ` +
      `(${existingRecord.completedChunks}/${existingRecord.totalChunks} already complete)`
    );
  } else {
    console.log('Starting new transcription...');

    // Initialize new transcription
    chunks = await this.loadAudioChunks(file, storageMetadata);

    await this.initializeTranscriptionRecord(
      sessionId,
      transcriptionId,
      storageMetadata,
      chunks.length
    );
  }

  // Process chunks with persistence
  const allSegments: TranscriptionSegment[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkResult: TranscriptionChunk = {
      index: chunk.index,
      startTimeSeconds: chunk.startTimeSeconds,
      endTimeSeconds: chunk.endTimeSeconds,
      durationSeconds: chunk.durationSeconds,
      status: 'processing'
    };

    try {
      // Save "processing" status
      await this.saveTranscriptionChunk(sessionId, transcriptionId, chunkResult);

      // Transcribe chunk
      const startTime = Date.now();
      const response = await this.transcribeChunk(chunk);
      const processingTimeMs = Date.now() - startTime;

      // Validate response
      const validation = this.validateTranscriptionResponse(response);
      if (!validation.valid) {
        throw new Error(validation.error || 'Transcription validation failed');
      }

      // Extract segments
      const chunkSegments = this.parseTranscriptionSegments(response);
      allSegments.push(...chunkSegments);

      // Update chunk status to completed
      chunkResult.status = 'completed';
      chunkResult.segments = chunkSegments;
      chunkResult.completedAt = new Date();
      chunkResult.tokensUsed = response.usageMetadata?.candidatesTokenCount;
      chunkResult.thoughtsTokens = response.usageMetadata?.thoughtsTokenCount;
      chunkResult.processingTimeMs = processingTimeMs;

      // Save completed chunk
      await this.saveTranscriptionChunk(sessionId, transcriptionId, chunkResult);

      console.log(
        `Chunk ${chunk.index + 1}/${chunks.length} completed ` +
        `(${chunkSegments.length} segments, ${processingTimeMs}ms)`
      );

    } catch (error) {
      console.error(`Chunk ${chunk.index} failed:`, error);

      // Update chunk status to failed
      chunkResult.status = 'failed';
      chunkResult.error = error instanceof Error ? error.message : String(error);
      chunkResult.failedAt = new Date();
      chunkResult.retryCount = (chunkResult.retryCount || 0) + 1;

      // Save failed chunk
      await this.saveTranscriptionChunk(sessionId, transcriptionId, chunkResult);

      // If too many retries, abort
      if (chunkResult.retryCount >= 3) {
        throw new Error(
          `Chunk ${chunk.index} failed after ${chunkResult.retryCount} attempts`
        );
      }

      // Otherwise, continue to next chunk (can retry this one later)
    }
  }

  // All chunks processed successfully
  const result: TranscriptionResult = {
    segments: allSegments,
    durationSeconds: storageMetadata.durationSeconds
  };

  // Mark transcription as complete
  await this.markTranscriptionComplete(sessionId, transcriptionId, result);

  return result;
}

private async getExistingTranscriptionRecord(
  sessionId: string,
  transcriptionId: string
): Promise<TranscriptionRecord | null> {
  if (!this.db) return null;

  const transcriptionRef = doc(
    this.db,
    'audioSessions',
    sessionId,
    'transcriptions',
    transcriptionId
  );

  const docSnap = await getDoc(transcriptionRef);
  return docSnap.exists() ? (docSnap.data() as TranscriptionRecord) : null;
}

private async markTranscriptionComplete(
  sessionId: string,
  transcriptionId: string,
  result: TranscriptionResult
): Promise<void> {
  if (!this.db) return;

  const transcriptionRef = doc(
    this.db,
    'audioSessions',
    sessionId,
    'transcriptions',
    transcriptionId
  );

  await updateDoc(transcriptionRef, {
    isComplete: true,
    result,
    completedAt: serverTimestamp()
  });

  console.log('Transcription marked as complete');
}
```

### Phase 3: UI Updates

**File**: `src/app/audio/audio-upload.component.ts`

```typescript
// Update re-transcribe button logic

async onReTranscribe(): void {
  // Check if previous transcription is incomplete
  const existingRecord = await this.transcriptionService.getExistingTranscriptionRecord(
    this.sessionId,
    this.transcriptionId
  );

  if (existingRecord && !existingRecord.isComplete) {
    // Show resume option
    const shouldResume = await this.confirmResume(
      existingRecord.completedChunks,
      existingRecord.totalChunks
    );

    if (shouldResume) {
      this.resumeTranscription();
    } else {
      this.startNewTranscription();
    }
  } else {
    // Previous transcription complete, start fresh
    this.startNewTranscription();
  }
}

private async confirmResume(completed: number, total: number): Promise<boolean> {
  // Show confirmation dialog
  const message = `Previous transcription incomplete (${completed}/${total} chunks). Resume?`;
  return confirm(message); // Replace with proper modal
}

private resumeTranscription(): void {
  this.statusMessage = 'Resuming transcription...';
  this.transcriptionService
    .transcribeAudio(this.storageMetadata, this.audioFile)
    .subscribe({
      next: result => this.handleTranscriptionSuccess(result),
      error: err => this.handleTranscriptionError(err)
    });
}

private startNewTranscription(): void {
  this.statusMessage = 'Starting new transcription...';
  // Clear old transcription record
  this.transcriptionService.clearTranscriptionRecord(this.sessionId, this.transcriptionId);

  this.transcriptionService
    .transcribeAudio(this.storageMetadata, this.audioFile)
    .subscribe({
      next: result => this.handleTranscriptionSuccess(result),
      error: err => this.handleTranscriptionError(err)
    });
}
```

**File**: `src/app/audio/transcription-status.component.ts`

```typescript
// Add chunk progress display

@Component({
  selector: 'app-transcription-status',
  template: `
    <div class="transcription-status">
      <h3>{{ statusTitle }}</h3>

      <!-- Overall progress -->
      <div class="progress-bar">
        <div class="progress-fill" [style.width.%]="progressPercentage"></div>
      </div>

      <!-- Chunk details -->
      <div class="chunk-status">
        <p>{{ currentChunkMessage }}</p>
        <p class="text-sm text-gray-600">
          {{ completedChunks }} of {{ totalChunks }} chunks complete
        </p>
      </div>

      <!-- Failed chunks warning -->
      <div *ngIf="failedChunks > 0" class="warning">
        ⚠️ {{ failedChunks }} chunk(s) failed and will be retried
      </div>
    </div>
  `,
})
export class TranscriptionStatusComponent {
  @Input() completedChunks = 0;
  @Input() totalChunks = 0;
  @Input() currentChunkIndex = 0;
  @Input() failedChunks = 0;
  @Input() isResume = false;

  get progressPercentage(): number {
    return this.totalChunks > 0 ? (this.completedChunks / this.totalChunks) * 100 : 0;
  }

  get statusTitle(): string {
    return this.isResume ? 'Resuming Transcription...' : 'Transcribing Audio...';
  }

  get currentChunkMessage(): string {
    if (this.currentChunkIndex >= this.totalChunks) {
      return 'All chunks processed!';
    }
    return `Processing chunk ${this.currentChunkIndex + 1} of ${this.totalChunks}`;
  }
}
```

### Phase 4: Error Handling & Retry Logic

**File**: `src/app/audio/audio-transcription.service.ts`

```typescript
// Add intelligent retry for failed chunks

private async retryFailedChunks(
  sessionId: string,
  transcriptionId: string
): Promise<void> {
  const record = await this.getExistingTranscriptionRecord(sessionId, transcriptionId);
  if (!record) return;

  const failedChunks = record.chunks.filter(
    c => c.status === 'failed' && (c.retryCount || 0) < 3
  );

  if (failedChunks.length === 0) {
    console.log('No failed chunks to retry');
    return;
  }

  console.log(`Retrying ${failedChunks.length} failed chunks...`);

  for (const failedChunk of failedChunks) {
    try {
      // Re-load audio chunk
      const audioChunk = await this.reloadAudioChunk(
        sessionId,
        failedChunk.index,
        failedChunk.startTimeSeconds,
        failedChunk.endTimeSeconds
      );

      // Retry transcription
      const response = await this.transcribeChunk(audioChunk);
      const segments = this.parseTranscriptionSegments(response);

      // Update chunk to completed
      failedChunk.status = 'completed';
      failedChunk.segments = segments;
      failedChunk.completedAt = new Date();
      failedChunk.error = undefined;
      delete failedChunk.failedAt;

      await this.saveTranscriptionChunk(sessionId, transcriptionId, failedChunk);

      console.log(`Chunk ${failedChunk.index} retry succeeded`);

    } catch (error) {
      console.error(`Chunk ${failedChunk.index} retry failed:`, error);

      failedChunk.retryCount = (failedChunk.retryCount || 0) + 1;
      failedChunk.error = error instanceof Error ? error.message : String(error);

      await this.saveTranscriptionChunk(sessionId, transcriptionId, failedChunk);
    }
  }
}
```

## Testing

### Test Cases

1. **Chunk Persistence**

   - [ ] Each chunk saves to Firestore immediately after completion
   - [ ] Chunk metadata includes all required fields
   - [ ] Failed chunks are marked with status='failed'
   - [ ] Successful chunks are marked with status='completed'

2. **Resume Logic**

   - [ ] Incomplete transcription resumes from correct chunk
   - [ ] Completed chunks are not reprocessed
   - [ ] Failed chunks are retried
   - [ ] Resume displays correct progress message

3. **Completion Tracking**

   - [ ] `isComplete` is `false` during processing
   - [ ] `isComplete` is `true` only when all chunks succeed
   - [ ] `completedChunks` count updates correctly
   - [ ] `lastProcessedChunkIndex` tracks progress

4. **Re-transcribe Behavior**

   - [ ] Complete transcription: "Re-transcribe" starts fresh
   - [ ] Incomplete transcription: "Resume" continues from failure
   - [ ] User can choose "Start New" instead of resume
   - [ ] Starting new clears old transcription data

5. **Error Handling**

   - [ ] Network failure: chunk marked failed, other chunks continue
   - [ ] API error: chunk marked failed, retry on resume
   - [ ] Max retries (3): chunk permanently failed, user notified
   - [ ] Partial failure: completed chunks saved, can resume later

6. **Edge Cases**
   - [ ] Single-chunk audio (no chunking needed)
   - [ ] All chunks fail: clear error message
   - [ ] Resume after browser refresh
   - [ ] Multiple transcription attempts tracked separately

## Acceptance Criteria

- [ ] TranscriptionRecord schema updated with new fields
- [ ] Chunks persist to Firestore after each completion
- [ ] Resume logic checks `isComplete` flag correctly
- [ ] UI shows chunk progress during transcription
- [ ] Failed chunks can be retried without reprocessing successful ones
- [ ] API costs reduced by skipping completed chunks
- [ ] Users can distinguish between "resume" and "new transcription"
- [ ] Error messages indicate which chunks failed
- [ ] Documentation updated with new data model

## Benefits

1. **Resilience**: Transcriptions survive failures and can be resumed
2. **Cost Savings**: No reprocessing of successful chunks
3. **User Experience**: Clear progress indication, faster recovery
4. **Debuggability**: Chunk-level status makes troubleshooting easier
5. **Scalability**: Long audio files become more feasible

## Related Files

- `src/app/audio/audio-transcription.service.ts` - Core transcription logic
- `src/app/audio/audio-session.models.ts` - Data model definitions
- `src/app/audio/audio-upload.component.ts` - Re-transcribe UI logic
- `src/app/audio/transcription-status.component.ts` - Progress display
- `firestore.rules` - Security rules for transcription chunks

## Related Tickets

- **Ticket 12**: Gemini MAX_TOKENS Truncation - Chunking strategy complements this
- **Ticket 11**: Gemini Repetition Fix - Improved error handling applies here
- **Ticket 09**: AI Request Queue - Retry logic synergizes with queue system

## Migration Notes

Existing transcription records in Firestore will not have the new fields. The service should handle this gracefully:

```typescript
// Backward compatibility
if (!record.isComplete && record.chunks === undefined) {
  // Old transcription record without chunk tracking
  // Treat as incomplete, force full re-transcription
  record.isComplete = false;
  record.chunks = [];
  record.totalChunks = 0;
  record.completedChunks = 0;
}
```

## Future Enhancements

1. **Parallel Chunk Processing**: Process multiple chunks simultaneously
2. **Chunk Prioritization**: Process failed chunks first on resume
3. **Background Sync**: Auto-retry failed chunks in background
4. **Chunk Caching**: Cache chunk audio locally for faster retry
5. **Progress Webhooks**: Notify users when long transcriptions complete
