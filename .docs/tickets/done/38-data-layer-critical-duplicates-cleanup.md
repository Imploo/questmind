# Ticket #38: Data Layer Critical Duplicates Cleanup (Phase 1)

**Status:** Open
**Priority:** Critical
**Created:** 2026-02-07
**Effort:** 1 week
**Related:** [Data Layer Analysis](../DATA_LAYER_ANALYSIS.md)

## Overview

Remove critical duplicate fields in the data layer, consolidating redundant data into single sources of truth. This phase addresses the most problematic duplicates that cause confusion, potential data inconsistencies, and maintenance burden.

## Problem Statement

The `AudioSessionRecord` and related interfaces contain 18+ duplicate/redundant fields that store the same data in multiple places. This creates:
- **Data inconsistency risks** - same data can be out of sync across fields
- **Developer confusion** - unclear which field is the source of truth
- **Maintenance burden** - updates must be applied to multiple fields
- **Database bloat** - unnecessary storage of duplicate data
- **TypeScript type confusion** - two incompatible `UserProfile` interfaces

See [DATA_LAYER_ANALYSIS.md](../DATA_LAYER_ANALYSIS.md) for complete analysis.

## Goals

1. Merge duplicate `UserProfile` interfaces into single source of truth
2. Remove file size duplicates - keep only nested `storageMetadata` fields
3. Remove transcription data duplicates - keep only nested `transcription.*` fields
4. Remove storage info duplicates - keep only nested `storageMetadata.*` fields
5. Remove story content duplicate
6. Create Firestore migration script for existing data

## Duplicate Fields to Remove

### 1. UserProfile Interface Consolidation

**Problem:** Two incompatible interfaces in different files

**Current:**
- `/src/app/campaign/campaign.models.ts` - has `photoURL`, timestamps as strings
- `/src/app/core/user.service.ts` - has `admin` flag, nullable types, timestamps as Date

**Solution:**
Create unified interface in `/src/app/core/models/user.model.ts`:

```typescript
export interface UserProfile {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;      // Merged
  admin?: boolean;                // Merged
  campaigns?: string[];
  defaultCampaignId?: string;
  createdAt?: Date;              // Use Date type
  updatedAt?: Date;              // Use Date type
}
```

**Files to update:**
- Create new `/src/app/core/models/user.model.ts`
- Update `/src/app/campaign/campaign.models.ts` - remove UserProfile, import from core
- Update `/src/app/core/user.service.ts` - remove UserProfile, import from core
- Search for all imports and update

---

### 2. File Size Fields

**Remove:**
- `audioFileSize: number` ❌
- `fileSize: number` ❌
- `storageMetadata.sizeBytes: number` ❌

**Keep:**
- `storageMetadata.fileSize: number` ✅ (source of truth)

**Migration:**
```typescript
// In migration script
if (session.audioFileSize || session.fileSize) {
  await updateDoc(sessionRef, {
    'storageMetadata.fileSize': session.audioFileSize || session.fileSize,
    audioFileSize: deleteField(),
    fileSize: deleteField()
  });
}
```

---

### 3. Storage URL Fields

**Remove:**
- `storageUrl: string` ❌ (from SessionStory inheritance)

**Keep:**
- `storageMetadata.downloadUrl: string` ✅

**Solution:**
- Remove `storageUrl` from `SessionStory` interface
- Add computed getter if needed for backward compatibility during migration
- Update all component references to use `storageMetadata?.downloadUrl`

---

### 4. Storage Path Fields

**Remove:**
- `storagePath?: string` ❌

**Keep:**
- `storageMetadata.storagePath: string` ✅

---

### 5. Content Type Field

**Remove:**
- `contentType?: string` ❌

**Keep:**
- `storageMetadata.contentType: string` ✅

---

### 6. Transcription Text Fields

**Remove:**
- `transcriptionText?: string` ❌ (flat field)

**Keep:**
- `transcription.rawTranscript: string` ✅ (nested)

---

### 7. Transcription Timestamps Fields

**Remove:**
- `timestamps?: TranscriptionTimestamp[]` ❌ (flat array)

**Keep:**
- `transcription.timestamps: TranscriptionTimestamp[]` ✅ (nested)

---

### 8. Transcription Segments Fields

**Remove:**
- `transcriptionSegments?: TranscriptionSegment[]` ❌ (flat array)

**Keep:**
- `transcription.segments?: TranscriptionSegment[]` ✅ (nested)

---

### 9. Audio Duration Fields

**Remove:**
- `transcription.durationSeconds?: number` ❌

**Keep:**
- `storageMetadata.durationSeconds?: number` ✅ (source of truth)

---

### 10. Story Content Fields

**Problem:** Both `content` (from SessionStory) and `storyContent` exist

**Solution:**
- Keep `content` from SessionStory inheritance ✅
- Remove `storyContent` field ❌
- This is cleaner since AudioSessionRecord extends SessionStory

---

### 11. Session/Document ID Duplicates

**Remove:**
- `transcription.storageMetadata.sessionId` ❌ (deeply nested)

**Keep:**
- Document ID and `transcription.id` as session reference

---

### 12. Campaign ID in Nested Objects

**Remove:**
- `storageMetadata.campaignId` ❌

**Keep:**
- Root `campaignId` field ✅

---

### 13. Audio Filename Duplicate

**Problem:** Declared twice due to inheritance

**Solution:**
- Remove explicit declaration from `AudioSessionRecord`
- Rely only on inheritance from `SessionStory.audioFileName`

---

## Implementation Steps

### Step 1: Create Unified UserProfile (Day 1-2)

1. Create `/src/app/core/models/user.model.ts` with merged interface
2. Update all imports across codebase
3. Update user.service.ts to use new model
4. Update campaign.models.ts to import instead of define
5. Run tests to verify no breaking changes

### Step 2: Update AudioSessionRecord Interface (Day 3-4)

1. Create backup branch
2. Update `/src/app/audio/services/audio-session.models.ts`:
   - Remove all duplicate fields marked ❌
   - Add JSDoc comments marking canonical fields
3. Update `StorageMetadata` interface:
   - Remove `sizeBytes`, keep `fileSize`
   - Remove `sessionId`
   - Remove `campaignId`
4. Update `SessionStory` interface:
   - Remove `storageUrl` field
5. Update `TranscriptionResult` interface:
   - Remove `durationSeconds`

### Step 3: Update Frontend Components (Day 5-7)

1. Search and replace all references:
   ```bash
   # Find all usages
   grep -r "\.storageUrl" src/app/
   grep -r "\.transcriptionText" src/app/
   grep -r "\.audioFileSize" src/app/
   grep -r "\.fileSize" src/app/
   ```

2. Update component templates and TypeScript:
   - `storageUrl` → `storageMetadata?.downloadUrl`
   - `transcriptionText` → `transcription?.rawTranscript`
   - `timestamps` → `transcription?.timestamps`
   - `transcriptionSegments` → `transcription?.segments`
   - `audioFileSize` → `storageMetadata?.fileSize`
   - `contentType` → `storageMetadata?.contentType`
   - `storagePath` → `storageMetadata?.storagePath`
   - `storyContent` → `content`

3. Key files to check:
   - `/src/app/audio/audio-session.component.ts`
   - `/src/app/audio/audio-session-detail.component.ts`
   - `/src/app/audio/services/*.service.ts`
   - `/src/app/campaign/campaign-detail.component.ts`

### Step 4: Update Backend Functions (Day 8-9)

1. Check all Cloud Functions that read/write sessions:
   - `functions/src/transcription/*.ts`
   - `functions/src/story-generation/*.ts`
   - `functions/src/podcast/*.ts`

2. Update to use canonical fields only

3. Ensure worker chain updates correct nested fields

### Step 5: Testing (Day 8-9)

1. **Clear old data** - Delete existing test sessions in Firestore (alpha app, fresh start)
2. Deploy backend functions
3. Deploy frontend
4. Test complete audio processing flow with new sessions:
   - Upload new session
   - Retranscribe
   - Regenerate story
   - Generate podcast
5. Verify no null reference errors

### Step 6: Production Deployment (Day 10)

1. **Delete old production data** (optional - or just leave and let it naturally phase out)
2. Deploy backend functions
3. Deploy frontend
4. Test with fresh upload
5. Monitor error logs for 24 hours

## Success Criteria

- [ ] UserProfile interface merged and unified
- [ ] All 13 duplicate fields removed from interfaces
- [ ] All frontend components updated and working
- [ ] All backend functions updated and working
- [ ] New sessions process correctly with clean data structure
- [ ] All tests passing
- [ ] No errors with fresh uploads

## Testing Checklist

- [ ] Unit tests updated for new field paths
- [ ] Integration tests for audio processing flow
- [ ] Manual testing of upload flow
- [ ] Manual testing of retranscription
- [ ] Manual testing of story regeneration
- [ ] Manual testing of podcast generation
- [ ] Test with sessions that have partial data
- [ ] Test with sessions missing optional fields

## Rollback Plan

If issues arise:
1. Revert code deployment (frontend + backend)
2. Delete broken sessions if needed (alpha app)
3. Fix issues
4. Redeploy

## Benefits

- **Reduced data inconsistency** - single source of truth for each field
- **Clearer codebase** - obvious which field to use
- **Easier maintenance** - update data in one place
- **Smaller documents** - less Firestore storage and bandwidth
- **Better TypeScript safety** - no conflicting interfaces

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing sessions | Alpha app - delete old sessions and start fresh |
| Missing field references | Thorough grep search and testing |
| Backend function errors | Deploy backend before frontend, test with new upload |

## Dependencies

- None (first phase)

## Follow-up Tickets

- #39 - Data Layer Legacy Fields Removal (Phase 2)
- #40 - Data Layer Optimization (Phase 3)
