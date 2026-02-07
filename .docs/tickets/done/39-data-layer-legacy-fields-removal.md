# Ticket #39: Data Layer Legacy Fields Removal (Phase 2)

**Status:** Open
**Priority:** High
**Created:** 2026-02-07
**Effort:** 3-5 days
**Dependencies:** #38 (Phase 1 must be complete)
**Related:** [Data Layer Analysis](../DATA_LAYER_ANALYSIS.md)

## Overview

Remove legacy progress tracking fields from the data layer after confirming the new `UnifiedProgress` worker chain architecture (from Ticket #36) is fully deployed and stable.

## Problem Statement

The `AudioSessionRecord` interface contains legacy progress tracking fields from the old "Ticket #35" implementation. These were replaced by the new `UnifiedProgress` architecture in "Ticket #36" but remain in the codebase for backward compatibility.

After the unified progress system has been stable in production, these legacy fields should be removed to:
- Reduce database document size
- Eliminate developer confusion about which progress fields to use
- Clean up the codebase
- Prevent accidental usage of outdated progress tracking

## Legacy Fields to Remove

### Complete Processing Progress Fields (From Ticket #35)

**Remove from AudioSessionRecord:**
```typescript
// ❌ Remove all of these:
completeProcessingStatus?: CompleteProcessingStatus;
completeProcessingProgress?: number;
completeProcessingMessage?: string;
completeProcessingError?: string;
```

**Remove these types entirely:**
```typescript
// ❌ Delete this type
type CompleteProcessingStatus =
  | 'idle'
  | 'loading_context'
  | 'transcribing'
  | 'transcription_complete'
  | 'generating_story'
  | 'story_complete'
  | 'generating_script'
  | 'script_complete'
  | 'generating_audio'
  | 'uploading'
  | 'completed'
  | 'failed';

// ❌ Delete this interface
interface ProcessingProgress {
  status: CompleteProcessingStatus;
  progress: number;
  message: string;
  error?: string;
}
```

**Keep (current):**
```typescript
// ✅ Keep this (from Ticket #36)
progress?: UnifiedProgress;
```

## Prerequisites

Before starting this ticket:

1. **Verify UnifiedProgress is fully deployed:**
   - All worker chain functions are using `UnifiedProgress`
   - Frontend components read from `progress` field only
   - No code references legacy progress fields

2. **Verify production stability:**
   - Worker chain has been in production for at least 2 weeks
   - No major bugs or rollbacks needed
   - Progress tracking is working correctly for all flows:
     - New session uploads
     - Retranscription
     - Story regeneration

3. **Check for any remaining references:**
   ```bash
   # Search for legacy field usage
   grep -r "completeProcessingStatus" src/
   grep -r "completeProcessingProgress" src/
   grep -r "completeProcessingMessage" src/
   grep -r "completeProcessingError" src/
   grep -r "ProcessingProgress" src/
   grep -r "CompleteProcessingStatus" src/

   # Check functions
   grep -r "completeProcessing" functions/src/
   ```

## Implementation Steps

### Step 1: Audit Current Usage (Day 1)

1. Search entire codebase for references to legacy fields
2. Identify any remaining usage:
   - Frontend components
   - Backend functions
   - Type definitions
   - Tests
3. Create list of files to update

### Step 2: Update Type Definitions (Day 1)

1. Update `/src/app/audio/services/audio-session.models.ts`:
   - Remove 4 legacy progress fields from `AudioSessionRecord`
   - Delete `CompleteProcessingStatus` type
   - Delete `ProcessingProgress` interface
   - Add comment explaining removal

```typescript
// Before:
export interface AudioSessionRecord extends SessionStory {
  // ... other fields ...

  // New unified progress (worker chain - Ticket 36)
  progress?: UnifiedProgress;

  // Complete processing status (Ticket 35 - Legacy) ❌
  completeProcessingStatus?: CompleteProcessingStatus;
  completeProcessingProgress?: number;
  completeProcessingMessage?: string;
  completeProcessingError?: string;
}

// After:
export interface AudioSessionRecord extends SessionStory {
  // ... other fields ...

  // Unified progress tracking (Ticket #36 worker chain)
  progress?: UnifiedProgress;

  // Note: Legacy progress fields removed in Ticket #39 (2026-02-07)
  // Old fields: completeProcessingStatus, completeProcessingProgress,
  // completeProcessingMessage, completeProcessingError
}
```

2. Remove type exports if they exist in other files

### Step 3: Remove Any Remaining Code References (Day 2)

1. Update any components still reading legacy fields:
   - Replace with `session.progress?.stage`
   - Replace with `session.progress?.progress`
   - Replace with `session.progress?.currentStep`
   - Replace with `session.progress?.failure?.error`

2. Remove any write operations to legacy fields

3. Update tests to not reference legacy fields

### Step 4: Testing (Day 3)

1. **Clear old test data** - Delete existing test sessions (alpha app)
2. Deploy code changes (frontend + backend)
3. Test all UI components with new uploads:
   - Session list view
   - Session detail view
   - Progress indicators
   - Error states
4. Verify no errors in browser console
5. Check that `progress` (UnifiedProgress) works correctly

### Step 5: Production Deployment (Day 4)

1. **Delete old production data** (optional - or just leave and ignore errors on old sessions)
2. Deploy code changes (frontend + backend)
3. Test with fresh upload
4. Monitor error logs for 24 hours

### Step 6: Update Documentation (Day 5)

1. Update DATA_LAYER_ANALYSIS.md to mark legacy fields as removed
2. Add note to any architecture docs about the progress field change
3. Update any developer guides or onboarding docs

## Success Criteria

- [ ] All legacy progress fields removed from `AudioSessionRecord`
- [ ] `CompleteProcessingStatus` type deleted
- [ ] `ProcessingProgress` interface deleted
- [ ] No code references to legacy fields remain
- [ ] New sessions process correctly with UnifiedProgress
- [ ] UI components show progress correctly
- [ ] No errors with fresh uploads
- [ ] Documentation updated

## Testing Checklist

- [ ] Grep search confirms no legacy field references
- [ ] TypeScript compilation succeeds
- [ ] All tests pass
- [ ] Session list shows correct progress
- [ ] Session detail shows correct progress
- [ ] Upload flow shows progress correctly
- [ ] Retranscription shows progress correctly
- [ ] Story regeneration shows progress correctly
- [ ] Failed sessions show error state correctly

## Rollback Plan

If issues arise:
1. Revert code deployment
2. Delete broken sessions if needed (alpha app)
3. Fix issues
4. Redeploy

## Benefits

- **Cleaner codebase** - no confusion about which progress fields to use
- **Smaller documents** - 4 fewer fields per session
- **Reduced maintenance** - fewer fields to manage
- **Clearer API** - single `progress` object is obvious
- **TypeScript safety** - can't accidentally use old fields

## Estimated Impact

- 4 legacy fields removed from interface
- **Result:** Cleaner data structure for all new sessions
- Old sessions can be deleted or will naturally phase out

## Dependencies

- **#38** - Phase 1 critical duplicates cleanup should be complete first
- **#36** - Worker chain architecture must be stable in production

## Follow-up Tickets

- **#40** - Data Layer Optimization (Phase 3)
