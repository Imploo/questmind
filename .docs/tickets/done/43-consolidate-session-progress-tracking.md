# Ticket #43: Consolidate Session Progress Tracking

## Title
Consolidate and Simplify Session Progress Tracking

## Created
2026-02-07

## Status
Done

## Priority
High

## Estimated Effort
1 week

## Description

The application currently has multiple scattered progress tracking mechanisms across different features (upload, transcription, retranscription, story generation, podcast generation). This creates confusion, code duplication, and inconsistent user experience. Progress indicators appear in various places in the UI without a clear, unified presentation.

This ticket consolidates all progress tracking into a single, unified system with one progress object per session and a single, prominent progress card displayed on the session details page.

## Current Problems

### 1. Multiple Progress Types in Data Layer
- `UnifiedProgress` (worker chain architecture from Ticket #36)
- `PodcastVersion.progress` and `PodcastVersion.progressMessage`
- `UploadProgress` (file upload specific)
- `RetranscribeProgress` (retranscription specific)
- `RegenerateStoryProgress` (story regeneration specific)
- Legacy fields (removed in Ticket #39 but concept still fragmented)
- Various `status` fields scattered across `AudioSessionRecord`

**Location:**
- `src/app/audio/services/audio-session.models.ts:119-153`
- `src/app/audio/services/audio-backend-operations.service.ts:33-45`
- `src/app/audio/services/podcast-audio.service.ts:6-16`

### 2. Multiple UI Components Showing Progress
- `TranscriptionStatusComponent` - processing status with progress bar
- Inline podcast progress in `SessionStoryComponent`
- Inline podcast progress in `PodcastLibraryComponent`
- Various inline loading states scattered in templates

**Locations:**
- `src/app/audio/transcription-status.component.ts:17-56`
- `src/app/audio/session-story.component.ts:242,259-265,293`
- `src/app/audio/podcast-library.component.ts:84-85`

### 3. Multiple Services Managing Progress
- `AudioBackendOperationsService.listenToRetranscribeProgress()`
- `AudioBackendOperationsService.listenToRegenerateStoryProgress()`
- `PodcastAudioService.listenToPodcastProgress()`
- `AudioCompleteProcessingService.listenToProgress()`

**Locations:**
- `src/app/audio/services/audio-backend-operations.service.ts:115-149,219-253`
- `src/app/audio/services/podcast-audio.service.ts:85-143`
- `src/app/audio/services/audio-complete-processing.service.ts:116-138`

### 4. Inconsistent Progress Tracking
- Some operations use `UnifiedProgress`
- Some use custom progress objects
- Some use direct field updates (`progress`, `progressMessage`)
- No single source of truth for "what is this session currently doing?"

### 5. Scattered UI Presentation
- Progress shown inline within other components
- No consistent location for progress information
- User must hunt for progress indicators
- Difficult to understand overall session state at a glance

## Expected Result

### Single Progress Object
One `SessionProgress` object on each `AudioSessionRecord` that tracks ALL operations:
- Upload
- Transcription (fast mode)
- Transcription (batch mode)
- Retranscription
- Story generation
- Story regeneration
- Podcast script generation
- Podcast audio generation

### Single Progress Card
A new **separate card** component displayed prominently at the **top** of the session details page that:
- Shows current operation name
- Shows progress percentage (0-100)
- Shows progress bar
- Shows status message (e.g., "Transcribing audio...", "Generating story...")
- Shows estimated time remaining (if available)
- Auto-hides when session is not processing (progress is complete or failed)
- Shows error state clearly if operation fails

### Clean Data Layer
- Remove all other progress-related fields from `AudioSessionRecord`
- Remove separate progress interfaces (`RetranscribeProgress`, `RegenerateStoryProgress`, `PodcastProgress`, `UploadProgress`)
- Keep only `SessionProgress` interface
- Backend updates single progress object for all operations

### Clean UI Layer
- Remove inline progress indicators from:
  - `SessionStoryComponent`
  - `PodcastLibraryComponent`
  - Other scattered locations
- Remove `TranscriptionStatusComponent` (replaced by new unified component)
- Single progress card is THE source of progress information

## Proposed Solution

### 1. Create Unified Data Model

**New Interface:** `SessionProgress`

```typescript
export type SessionProgressStage =
  | 'idle'
  | 'uploading'
  | 'transcribing'          // Fast transcription
  | 'batch-submitted'       // Batch transcription submitted
  | 'batch-processing'      // Batch transcription running
  | 'retranscribing'
  | 'generating-story'
  | 'regenerating-story'
  | 'generating-podcast-script'
  | 'generating-podcast-audio'
  | 'completed'
  | 'failed';

export interface SessionProgress {
  stage: SessionProgressStage;
  progress: number;                    // 0-100 percentage
  message: string;                     // User-friendly status message
  startedAt: Date;                     // When current operation started
  estimatedCompletionAt?: Date;        // Estimated completion time
  error?: string;                      // Error message if failed
  updatedAt: Date;                     // Last update timestamp
}
```

**Update:** `AudioSessionRecord`

```typescript
export interface AudioSessionRecord extends SessionStory {
  // ... existing fields ...

  // NEW: Single unified progress tracking
  progress?: SessionProgress;

  // REMOVE: All these fields
  // - status (replaced by progress.stage)
  // - transcriptionBatch.status
  // - podcasts[].progress
  // - podcasts[].progressMessage
  // - podcasts[].status (keep only for completed podcasts)
  // - completeProcessingStatus (already removed in #39)
  // - completeProcessingProgress (already removed in #39)
}
```

### 2. Create New Progress Card Component

**New Component:** `SessionProgressCardComponent`

**Location:** `src/app/audio/session-progress-card.component.ts`

**Features:**
- Accepts `progress: SessionProgress | null | undefined` input
- Auto-hides when `progress` is null, undefined, or stage is 'completed'
- Shows error state prominently when stage is 'failed'
- Displays progress bar with smooth animations
- Shows estimated time remaining if available
- Provides "Cancel" button for cancellable operations
- Provides "Retry" button when failed
- Follows Angular best practices (signals, standalone, OnPush)

**Template Structure:**
```
┌─────────────────────────────────────────────┐
│ 🔄 Transcribing Audio                       │
│ ────────────────────────── 65%              │
│ Processing chunk 13 of 20...                │
│ Estimated 2 minutes remaining               │
│                              [Cancel]        │
└─────────────────────────────────────────────┘
```

### 3. Update Session Details Page

**File:** `src/app/audio/audio-session.component.ts`

**Changes:**
1. Add `SessionProgressCardComponent` import
2. Add progress card at top of main content area (before session details)
3. Remove all inline progress indicators
4. Bind `currentSession()?.progress` to progress card input

**Template Location:**
```html
<!-- Progress card (only shown when session is processing) -->
<app-session-progress-card
  [progress]="currentSession()?.progress"
  (cancel)="cancelCurrentOperation()"
  (retry)="retryFailedOperation()"
/>

<!-- Session details below -->
<div class="session-details-card">
  <!-- ... existing content WITHOUT progress indicators ... -->
</div>
```

### 4. Update Backend Functions

Update all backend Cloud Functions to write to the unified `progress` field:

**Functions to Update:**
- `transcribe-audio-fast.ts` - Set stage to 'transcribing'
- `transcribe-audio-batch.ts` - Set stage to 'batch-submitted' then 'batch-processing'
- `poll-batch-jobs.ts` - Update progress for batch transcription
- `workers/story-generation-worker.ts` - Set stage to 'generating-story'
- `generate-podcast-audio.ts` - Set stages 'generating-podcast-script' and 'generating-podcast-audio'
- Retranscription flows - Set stage to 'retranscribing'
- Story regeneration flows - Set stage to 'regenerating-story'

**Example Update Pattern:**
```typescript
// OLD
await sessionRef.update({
  'podcasts.0.progress': 45,
  'podcasts.0.progressMessage': 'Generating audio...'
});

// NEW
await sessionRef.update({
  progress: {
    stage: 'generating-podcast-audio',
    progress: 45,
    message: 'Generating audio for podcast...',
    startedAt: new Date(),
    updatedAt: new Date()
  }
});
```

### 5. Update Frontend Services

**Remove or Consolidate:**
- `AudioBackendOperationsService.listenToRetranscribeProgress()` - Remove
- `AudioBackendOperationsService.listenToRegenerateStoryProgress()` - Remove
- `PodcastAudioService.listenToPodcastProgress()` - Remove

**Keep and Enhance:**
- `AudioCompleteProcessingService.listenToProgress()` - Rename to `listenToSessionProgress()`
- Update to return `SessionProgress` type
- Use in `AudioSessionComponent` to bind to progress card

**New Service Method:**
```typescript
// In AudioSessionStateService or new ProgressService
listenToSessionProgress(
  campaignId: string,
  sessionId: string,
  callback: (progress: SessionProgress | null) => void
): Unsubscribe {
  const sessionRef = doc(
    this.firestore,
    `campaigns/${campaignId}/audioSessions/${sessionId}`
  );

  return onSnapshot(sessionRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      const progress = data['progress'] as SessionProgress | undefined;
      callback(progress || null);
    }
  });
}
```

### 6. Clean Up Old Code

**Delete Components:**
- `src/app/audio/transcription-status.component.ts` (replaced by new progress card)

**Remove from Templates:**
- All inline progress indicators in `SessionStoryComponent`
- All inline progress indicators in `PodcastLibraryComponent`
- All `@if (loading())` conditionals showing progress

**Delete Interfaces:**
- `RetranscribeProgress`
- `RegenerateStoryProgress`
- `PodcastProgress`
- `UploadProgress` (or keep as internal type only)

**Remove Fields from `AudioSessionRecord`:**
- `status` (use `progress.stage` instead)
- Consider removing `transcriptionBatch.status` (redundant)
- Remove `progress` and `progressMessage` from `PodcastVersion` for in-progress podcasts

## Implementation Steps

### Phase 1: Backend (2-3 days)
1. ✅ Create `SessionProgress` interface in `functions/src/types/audio-session.types.ts`
2. ✅ Create `ProgressTracker` utility class for backend to simplify progress updates
3. ✅ Update `transcribe-audio-fast.ts` to use new progress model
4. ✅ Update `transcribe-audio-batch.ts` to use new progress model
5. ✅ Update `poll-batch-jobs.ts` to use new progress model
6. ✅ Update `story-generation-worker.ts` to use new progress model
7. ✅ Update `generate-podcast-audio.ts` to use new progress model
8. ✅ Add progress tracking to retranscription flow
9. ✅ Add progress tracking to story regeneration flow
10. ✅ Update upload flow to write to unified progress

### Phase 2: Frontend Data Layer (1 day)
1. ✅ Add `SessionProgress` interface to `src/app/audio/services/audio-session.models.ts`
2. ✅ Update `AudioSessionRecord` interface to include `progress?: SessionProgress`
3. ✅ Add or update service method for listening to session progress
4. ✅ Mark old progress interfaces as deprecated

### Phase 3: New Progress Card Component (1 day)
1. ✅ Create `session-progress-card.component.ts`
2. ✅ Implement progress bar with animations
3. ✅ Implement auto-hide logic (when idle or completed)
4. ✅ Implement error state display
5. ✅ Add cancel/retry functionality
6. ✅ Add unit tests for component

### Phase 4: Integrate Progress Card (1 day)
1. ✅ Add progress card to `AudioSessionComponent` template
2. ✅ Connect progress data to card via signal
3. ✅ Implement cancel/retry handlers
4. ✅ Test all operation flows show correct progress

### Phase 5: Clean Up Old Code (1-2 days)
1. ✅ Remove inline progress from `SessionStoryComponent`
2. ✅ Remove inline progress from `PodcastLibraryComponent`
3. ✅ Delete `TranscriptionStatusComponent`
4. ✅ Remove old progress service methods
5. ✅ Remove old progress interfaces
6. ✅ Remove old progress fields from Firestore schema (document in migration notes)
7. ✅ Update all components using old progress tracking
8. ✅ Search codebase for any remaining references to old progress fields

### Phase 6: Testing & Polish (1 day)
1. ✅ Test upload flow
2. ✅ Test fast transcription flow
3. ✅ Test batch transcription flow
4. ✅ Test retranscription flow
5. ✅ Test story generation/regeneration flow
6. ✅ Test podcast generation flow
7. ✅ Test error states and retry functionality
8. ✅ Test cancel functionality
9. ✅ Verify no console errors
10. ✅ Verify progress card auto-hides when complete

## Testing Strategy

### Manual Testing
- [ ] Upload new session → verify progress card shows upload progress
- [ ] Fast transcription → verify progress card shows transcription progress
- [ ] Batch transcription → verify progress shows "submitted" then "processing"
- [ ] Retranscribe session → verify progress card appears and tracks progress
- [ ] Regenerate story → verify progress card appears and tracks progress
- [ ] Generate podcast → verify progress card shows script then audio generation
- [ ] Trigger error → verify progress card shows error state clearly
- [ ] Click cancel → verify operation cancels (if supported)
- [ ] Click retry → verify operation retries
- [ ] Complete operation → verify progress card auto-hides

### Code Review Checklist
- [ ] No remaining references to old progress types
- [ ] All backend functions write to unified `progress` field
- [ ] All inline progress indicators removed
- [ ] Progress card component follows Angular best practices
- [ ] Error handling is clear and user-friendly
- [ ] No memory leaks (unsubscribe from listeners)

## Expected Benefits

### For Users
- **Single source of truth** for session status - no more hunting for progress indicators
- **Prominent display** - always know if something is happening at a glance
- **Consistent experience** - all operations show progress the same way
- **Clear error states** - immediately see when something fails
- **Better feedback** - see estimated time remaining

### For Developers
- **Simplified codebase** - one progress system instead of many
- **Easier to maintain** - changes to progress UI happen in one place
- **Reduced bugs** - no inconsistencies between different progress mechanisms
- **Better DX** - clear contract for backend to update progress
- **Easier to add new operations** - just update the `SessionProgressStage` enum

### Code Quality Metrics
- **Lines removed:** ~200-300 lines (old components, interfaces, service methods)
- **Lines added:** ~150-200 lines (new component, unified interface)
- **Net reduction:** ~50-100 lines
- **Files deleted:** 1-2 components
- **Interfaces consolidated:** 4 → 1
- **Complexity reduction:** High (multiple systems → single system)

## Migration Notes

### Database Migration
- **No migration required** for alpha app
- New sessions will use `progress` field
- Old sessions may have legacy progress fields - these can be safely ignored
- Consider cleanup script to remove old progress fields from existing sessions (optional)

### Backwards Compatibility
- New code reads only from `progress` field
- Old progress fields are ignored (not read)
- Backend always writes to `progress` field
- Gradual rollout: backend updated first, then frontend

## Technical Details

### Files to Create
1. `src/app/audio/session-progress-card.component.ts` - New progress card component
2. `functions/src/services/progress-tracker.service.ts` - Backend progress helper (optional)

### Files to Modify
1. `src/app/audio/services/audio-session.models.ts` - Add `SessionProgress` interface
2. `functions/src/types/audio-session.types.ts` - Add `SessionProgress` interface
3. `src/app/audio/audio-session.component.ts` - Add progress card
4. `src/app/audio/session-story.component.ts` - Remove inline progress
5. `src/app/audio/podcast-library.component.ts` - Remove inline progress
6. `src/app/audio/services/audio-backend-operations.service.ts` - Simplify or remove progress methods
7. `src/app/audio/services/podcast-audio.service.ts` - Remove progress listening
8. `src/app/audio/services/audio-complete-processing.service.ts` - Update to use `SessionProgress`
9. `functions/src/transcribe-audio-fast.ts` - Write to unified progress
10. `functions/src/transcribe-audio-batch.ts` - Write to unified progress
11. `functions/src/poll-batch-jobs.ts` - Write to unified progress
12. `functions/src/workers/story-generation-worker.ts` - Write to unified progress
13. `functions/src/generate-podcast-audio.ts` - Write to unified progress

### Files to Delete
1. `src/app/audio/transcription-status.component.ts` - Replaced by new progress card

### Firestore Schema Changes
```typescript
// Before
{
  status: 'processing',
  transcriptionBatch: {
    status: 'running',
    lastCheckedAt: ...
  },
  podcasts: [{
    progress: 65,
    progressMessage: 'Generating audio...',
    status: 'generating_audio'
  }]
}

// After
{
  progress: {
    stage: 'generating-podcast-audio',
    progress: 65,
    message: 'Generating audio for podcast...',
    startedAt: Timestamp,
    updatedAt: Timestamp
  },
  podcasts: [{
    // Only keep status for completed podcasts
    // No progress/progressMessage for in-progress
  }]
}
```

## Dependencies

### Depends On
- #36: Worker Chain Architecture (provides `UnifiedProgress` concept)
- #39: Legacy Fields Removal (already cleaned up old progress fields)

### Blocks
- None (standalone refactoring)

## Related Issues

### From Original Code Review
- Issue #14: Business logic in components (progress handling scattered in components)
- Issue #17: Mixed reactive paradigms (multiple progress subscriptions)

### Related Tickets
- #26: Split AudioSessionComponent (this simplifies progress tracking in that component)
- #38: Data Layer Critical Duplicates Cleanup (removes redundant progress fields)

## Notes

- This is a **user-facing change** - progress display will look different
- Should be **low risk** since alpha app with small user base
- Can be rolled out gradually (backend first, frontend second)
- Consider adding progress to upload-page component as well (separate card?)
- Future enhancement: Add websockets for real-time progress instead of polling Firestore
- Future enhancement: Add progress history (show completed steps, not just current)

---

**Author:** Claude Code (Sonnet 4.5)
**Reviewed By:** (Pending)
**Approved By:** (Pending)
