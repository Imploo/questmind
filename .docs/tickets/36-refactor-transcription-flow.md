# Ticket #36: Refactor Transcription and Retranscription Flows

**Status:** Open
**Priority:** High
**Created:** 2026-02-05

## Overview

Simplify and unify the audio processing pipeline with clear progress tracking. Remove all legacy code and interfaces - no backward compatibility needed.

## Problem Statement

The current transcription flow has become complex with multiple code paths, unclear progress tracking, and legacy interfaces. This makes the codebase hard to maintain and debug.

## Proposed Solution

### Unified Flow Architecture

#### Worker Chain Design
Each stage is implemented as a **separate Cloud Function or Cloud Task** to avoid long-running functions. Each worker:
- Performs a single stage of processing
- Updates progress in Firestore
- Triggers the next worker in the chain
- Has independent retry logic and timeout handling

#### Main Transcription Flow (Worker Chain)
1. **Upload** - User uploads one or more audio files **directly to Firebase Storage from the frontend** (no backend involvement)
   - Frontend triggers: `downloadWorker`

2. **Download Worker** - Downloads files from Storage via Storage SDK to `/tmp`
   - Updates progress: `downloading (20-30%)`
   - Triggers: `chunkingWorker`

3. **Chunking Worker** - Splits files into 30-minute parts
   - Updates progress: `chunking (30-40%)`
   - Triggers: `transcriptionWorker`

4. **Transcription Worker** - Transcribes each part via Google AI
   - Updates progress: `transcribing (40-80%)`
   - Triggers: `storyGenerationWorker`

5. **Story Generation Worker** - Creates story from complete transcription
   - Updates progress: `generating-story (80-100%)`
   - Marks session as: `completed (100%)`

#### Flow Variants
- **Retranscription**: Frontend triggers `downloadWorker` directly (skips upload, reuses Storage files)
- **Story Regeneration**: Frontend triggers `storyGenerationWorker` directly (uses existing transcription)

### Progress Tracking System

All stages must log to a `progress` object on the audio session document in Firestore:

```typescript
interface AudioSessionProgress {
  stage: 'uploading' | 'downloading' | 'chunking' | 'transcribing' | 'generating-story' | 'completed' | 'failed';
  progress: number; // 0-100 percentage
  currentStep?: string; // Optional detailed step description
  failure?: {
    stage: string;
    error: string;
    timestamp: Timestamp;
    details?: any;
  };
  updatedAt: Timestamp;
}
```

## Implementation Requirements

### Core Principles
1. **Single unified service** for audio processing pipeline
2. **Clean interfaces** for each stage with clear inputs/outputs
3. **Comprehensive error handling** with detailed failure logging
4. **Progress updates** at each stage boundary
5. **Storage SDK usage** for all file operations (no direct URLs)

### Code Cleanup
Remove all legacy code including:
- Old progress tracking mechanisms
- Deprecated interfaces
- Backward compatibility code
- Unused helper functions
- Alternative flow implementations

### Files to Create/Refactor

#### New Worker Functions
- `functions/src/workers/download-worker.ts` - Downloads files from Storage
- `functions/src/workers/chunking-worker.ts` - Splits audio into 30-min parts
- `functions/src/workers/transcription-worker.ts` - Transcribes audio chunks
- `functions/src/workers/story-generation-worker.ts` - Generates story from transcription

#### Shared Services
- `functions/src/services/progress-tracker.service.ts` - Manages Firestore progress updates
- `functions/src/services/worker-queue.service.ts` - Enqueues Cloud Tasks
- `functions/src/audio/chunking.service.ts` - Audio chunking logic (refactor existing)

#### Remove (Legacy Code)
- `functions/src/process-audio-session.ts` - Replace with worker chain
- `functions/src/retranscribe-audio.ts` - Replace with direct worker trigger
- `functions/src/regenerate-story.ts` - Replace with direct worker trigger
- All deprecated interfaces and unused helper functions

## Technical Details

### Worker Chain Implementation

#### Worker Communication
Workers communicate via **Cloud Tasks** or **Firestore triggers**:

**Option A: Cloud Tasks (Recommended)**
- Each worker enqueues the next worker as a Cloud Task
- Built-in retry logic with exponential backoff
- Task queue provides visibility and control
- Better for long-running chains (no timeout cascade)

**Option B: HTTP Cloud Functions**
- Each worker makes HTTP call to next worker
- Simpler implementation
- May cascade timeouts if not careful
- Good for quick prototyping

#### Worker Structure
Each worker Cloud Function follows this pattern:

```typescript
export const downloadWorker = onCall(async (request) => {
  const { sessionId } = request.data;

  try {
    // 1. Update progress
    await updateProgress(sessionId, 'downloading', 20);

    // 2. Perform work
    const downloadedFiles = await downloadFromStorage(sessionId);

    // 3. Trigger next worker
    await enqueueTask('chunkingWorker', { sessionId, files: downloadedFiles });

    // 4. Return immediately (fire-and-forget)
    return { success: true, stage: 'downloading' };

  } catch (error) {
    // Log failure to Firestore
    await updateFailure(sessionId, 'downloading', error);
    throw error; // Let Cloud Tasks retry logic handle it
  }
});
```

#### Worker Retry Strategy
- **Max retries**: 3 attempts per worker
- **Backoff**: Exponential (1min, 5min, 15min)
- **Failure logging**: Each retry logged to Firestore progress object
- **Dead letter queue**: Failed tasks moved to DLQ after max retries
- **Manual recovery**: Admin can re-trigger specific worker from UI

#### Cloud Tasks Configuration
```typescript
// queue.yaml or runtime configuration
const queueConfig = {
  name: 'audio-processing-queue',
  location: 'europe-west4', // Match Cloud Functions region
  retryConfig: {
    maxAttempts: 3,
    minBackoff: '60s',
    maxBackoff: '900s', // 15 minutes
    maxDoublings: 3
  },
  rateLimits: {
    maxDispatchesPerSecond: 10, // Prevent overwhelming downstream APIs
    maxConcurrentDispatches: 5  // Limit parallel executions
  }
};
```

#### Worker Execution Time Estimates
- **Download Worker**: 30s - 2min (depends on file size)
- **Chunking Worker**: 1-5min (depends on total audio length)
- **Transcription Worker**: 10-30min (depends on number of chunks and API response time)
- **Story Generation Worker**: 2-5min (depends on transcription length)

**Total pipeline time**: 15-45 minutes (all within Cloud Function limits when chained)

### Frontend Upload Process
- User selects audio files in the Angular frontend
- Files are uploaded **directly to Firebase Storage** using the Firebase Storage SDK
- Upload progress tracked in frontend (0-20%)
- Once upload completes, frontend triggers the backend Cloud Function with session ID
- **No file data passes through backend during upload**

### Storage Structure
```
storage://
  └── audio-sessions/
      └── {sessionId}/
          ├── original/
          │   ├── file1.mp3
          │   └── file2.mp3
          └── chunks/
              ├── chunk-001.mp3
              ├── chunk-002.mp3
              └── ...
```

### Progress Flow States

**Frontend (Step 1):**
```
uploading (0-20%) - Files uploaded directly to Storage from frontend
```

**Backend (Steps 2-5):**
```
downloading (20-30%)
  → chunking (30-40%)
    → transcribing (40-80%)
      → generating-story (80-100%)
        → completed (100%)
```

### Error Handling
- Each stage must catch and log errors to the `failure` field
- Set status to `failed` on error
- Include stage name, error message, timestamp, and optional details
- Do not continue to next stage on failure

## Success Criteria

### Architecture
- [ ] Each stage implemented as separate Cloud Function/Task
- [ ] No long-running functions (each worker completes quickly)
- [ ] Workers communicate via Cloud Tasks or HTTP calls
- [ ] Clear worker chain: download → chunk → transcribe → generate story

### Functionality
- [ ] Frontend uploads directly to Storage (no backend involvement)
- [ ] Retranscription reuses existing Storage files (starts at downloadWorker)
- [ ] Story regeneration reuses existing transcription (starts at storyGenerationWorker)
- [ ] Each worker updates Firestore progress independently

### Code Quality
- [ ] All legacy code removed (no backward compatibility)
- [ ] Simplified codebase with clear separation of concerns
- [ ] Comprehensive error logging at each worker
- [ ] Retry logic implemented for each worker

### Testing & Deployment
- [ ] Both builds pass: `npm run build` and `npm run build:backend`
- [ ] Manual testing of full chain (upload → completion)
- [ ] Manual testing of retranscription flow
- [ ] Manual testing of story regeneration flow
- [ ] Worker failure recovery tested (retry + DLQ)

## Benefits

1. **Scalability**: Worker chain prevents long-running functions and timeout issues
2. **Resilience**: Each worker has independent retry logic; failure in one stage doesn't affect others
3. **Maintainability**: Clear separation of concerns; each worker is a single-purpose function
4. **Debugging**: Easy to identify which worker failed and retry only that stage
5. **Monitoring**: Granular visibility into each stage's performance and success rate
6. **Cost Optimization**: Each worker runs only as long as needed; no idle time
7. **User Experience**: Clear progress indication showing which stage is active
8. **Code Quality**: Removal of technical debt and monolithic function complexity

## Risks and Mitigations

**Risk**: Breaking existing audio sessions in progress
**Mitigation**: Accept data loss for in-progress sessions as per requirements (no backward compatibility)

**Risk**: Missing edge cases in new implementation
**Mitigation**: Comprehensive error handling and logging at each stage

## Estimated Impact

- **Backend**: Major refactor - create 4 new worker functions + 2 shared services
- **Frontend**: Minor updates to trigger correct worker for retranscription/regeneration
- **Database**: Update progress object structure on audio sessions
- **Storage**: No changes to storage structure (can reuse existing files)
- **Infrastructure**: New Cloud Tasks queue configuration
- **Monitoring**: New worker-level metrics and logs in Cloud Console

## Notes

### Breaking Changes
- This is a breaking change - no backward compatibility
- Existing audio sessions in progress will fail (acceptable per requirements)
- Old Cloud Functions (process-audio-session, retranscribe-audio, regenerate-story) will be deleted

### Deployment Strategy
1. Deploy new worker functions first (they won't be called yet)
2. Deploy shared services (progress-tracker, worker-queue)
3. Update frontend to trigger new workers
4. Monitor first few sessions closely
5. Delete old Cloud Functions after validation
6. Set up Cloud Tasks queue with retry configuration

### Development Notes
- Each worker can be tested independently by invoking directly
- Use Cloud Tasks emulator for local development
- Fire-and-forget pattern: Workers return immediately, processing continues in background
- Use Haiku subagents for npm build commands to optimize costs

### Monitoring & Observability
- Each worker logs to Cloud Functions logs with `workerId` tag
- Progress updates in Firestore provide real-time status
- Cloud Tasks console shows queue depth and retry attempts
- Set up alerts for workers in DLQ (dead letter queue)
