# Remove enableKankaContext from Frontend Audio Upload

## Metadata

- **Created**: 2026-02-07
- **Completed**: 2026-02-07
- **Status**: Done
- **Priority**: Medium
- **Component**: Audio Upload / Backend Processing
- **Type**: Refactor / Technical Debt

## Description

The `enableKankaContext` parameter is currently hardcoded to `false` in the audio upload page component (`src/app/audio/audio-upload-page.component.ts:220`) when calling `startCompleteProcessing()`. This parameter should not be passed from the frontend at all, as the setting is stored in campaign settings in the database and the backend can retrieve it directly.

**CRITICAL DISCOVERIES**:

1. Even though `enableKankaContext` is being passed and stored, **it's not actually being used during transcription!** Both transcription endpoints use the raw prompt without calling `buildTranscriptionPrompt()` to include Kanka context.

2. **There is no backend Kanka service!** The `KankaService` only exists in the frontend (`src/app/kanka/kanka.service.ts`). The backend has:
   - The `buildTranscriptionPrompt()` helper that expects Kanka data
   - Story generation that reads `kankaSearchResult` from session document (but nothing writes it there)
   - No service to fetch Kanka data from the API

This means the Kanka integration for transcription has **never been implemented**, only the prompt builder exists.

## Current Implementation

### Frontend - Hardcoded to false

In `audio-upload-page.component.ts`, line 213-228:

```typescript
const sessionId = await this.completeProcessingService.startCompleteProcessing(
  campaignId,
  sessionDraft.id,
  event.file,
  {
    sessionTitle: event.sessionName || 'Untitled Session',
    sessionDate: event.sessionDate,
    enableKankaContext: false,  // ← Hardcoded to false
    transcriptionMode: event.transcriptionMode || 'batch'
  },
  (uploadProgress) => {
    this.progress.set(uploadProgress);
    this.statusMessage.set(`Uploading to cloud... ${Math.round(uploadProgress)}%`);
  }
);
```

### Backend - Not using the helper

**transcribe-audio-fast.ts** (line 204):
```typescript
{ text: AUDIO_TRANSCRIPTION_PROMPT },  // ← Raw prompt, no Kanka context
```

**transcribe-audio-batch.ts** (line 142):
```typescript
{text: 'Transcribe this audio file into JSON format...'},  // ← Hardcoded string!
```

Both should be using:
```typescript
import { buildTranscriptionPrompt } from './audio/transcription-prompt';

// Then in the request:
{ text: buildTranscriptionPrompt(kankaContext) }
```

## Expected Result

This ticket is now split into **two phases**:

### Phase 1: Fix Parameter Passing (This Ticket)

1. **Frontend** should NOT pass `enableKankaContext` parameter when calling the complete processing service
2. **Backend** should read the `settings.kankaEnabled` value directly from the campaign settings in the database
3. The audio processing flow should use the correct campaign setting rather than a hardcoded value
4. Store the setting value in session metadata for future use

### Phase 2: Implement Kanka Integration (Separate Ticket Needed)

Once Phase 1 is complete, a follow-up ticket should implement the actual Kanka integration:
1. Create a backend Kanka service to fetch entity data from Kanka API
2. When `settings.kankaEnabled` is true, fetch Kanka entities and store in session
3. Use `buildTranscriptionPrompt(kankaContext)` to include Kanka data in transcription prompts
4. This will make the feature actually functional for the first time

## Technical Details

### Files to Modify

1. **Frontend - Remove parameter from call site**
   - `src/app/audio/audio-upload-page.component.ts`
     - Remove `enableKankaContext: false` from the options object (line 220)

2. **Frontend - Update service interface**
   - `src/app/audio/services/audio-complete-processing.service.ts`
     - Update the `startCompleteProcessing()` method signature to remove `enableKankaContext` from the options parameter type
     - Ensure the service doesn't expect this parameter

3. **Backend - Read from database**
   - Identify the backend endpoint/Cloud Function that handles the processing request
   - Add logic to read campaign settings from Firestore
   - Retrieve `enableKankaContext` from the campaign document
   - Use this value in the processing logic

### Campaign Settings Structure

**Verified structure:**
- Collection path: `campaigns/{campaignId}` (settings are nested in campaign document)
- Field path: `settings.kankaEnabled` (boolean, optional)
- Type definition: `CampaignSettings` interface in `src/app/campaign/campaign.models.ts`

```typescript
export interface CampaignSettings {
  allowMembersToCreateSessions: boolean;
  kankaEnabled?: boolean;
  kankaCampaignId?: string;
}
```

### Backend Processing Location

**Identified endpoints:**
- `functions/src/transcribe-audio-fast.ts` - Fast transcription endpoint
  - Receives `enableKankaContext` parameter (line 16, 50)
  - Stores it in `transcriptionFast` metadata (line 106)
  - Passes it to story generation worker (line 292)

- `functions/src/transcribe-audio-batch.ts` - Batch transcription endpoint
  - Receives `enableKankaContext` parameter (line 18, 36)
  - Stores it in `transcriptionBatch` metadata (line 206)
  - Used in downstream processing

## Implementation Steps - Phase 1 Only

**Note**: Phase 2 (actual Kanka integration for transcription) is deferred to a separate ticket.

1. **Backend Changes - transcribe-audio-fast.ts**
   - [ ] Remove `enableKankaContext` from `TranscribeAudioFastRequest` interface (line 16)
   - [ ] Remove parameter destructuring (line 50)
   - [ ] Add helper function `getCampaignKankaEnabled(campaignId)` to fetch from DB
   - [ ] Call helper to get `kankaEnabled` value from campaign settings
   - [ ] Update metadata storage to use fetched value instead of parameter (line 106)
   - [ ] Update `processTranscriptionAsync()` signature to not require the parameter (line 144)
   - [ ] Pass fetched value to story generation worker (line 292)
   - [ ] **Note**: Keep using raw `AUDIO_TRANSCRIPTION_PROMPT` for now (Phase 2 will add Kanka context)

2. **Backend Changes - transcribe-audio-batch.ts**
   - [ ] Remove `enableKankaContext` from `TranscribeAudioBatchRequest` interface (line 18)
   - [ ] Remove parameter destructuring (line 36)
   - [ ] Add helper function `getCampaignKankaEnabled(campaignId)` to fetch from DB
   - [ ] Call helper to get `kankaEnabled` value from campaign settings
   - [ ] Update metadata storage to use fetched value instead of parameter (line 206)
   - [ ] **Fix**: Replace hardcoded string (line 142) with `AUDIO_TRANSCRIPTION_PROMPT` constant
   - [ ] **Note**: Phase 2 will add Kanka context integration

3. **Frontend Changes - audio-upload-page.component.ts**
   - [ ] Remove `enableKankaContext: false` from options object (line 220)
   - [ ] Verify the interface/type still matches backend expectation

4. **Frontend Changes - audio-complete-processing.service.ts**
   - [ ] Update `startCompleteProcessing()` method to remove `enableKankaContext` from options type
   - [ ] Ensure service doesn't pass this parameter to backend

5. **Testing**
   - [ ] Test fast transcription with `settings.kankaEnabled = true` in campaign
   - [ ] Test fast transcription with `settings.kankaEnabled = false` in campaign
   - [ ] Test fast transcription with missing `settings.kankaEnabled` (verify default to false)
   - [ ] Test batch transcription with `settings.kankaEnabled = true` in campaign
   - [ ] Test batch transcription with `settings.kankaEnabled = false` in campaign
   - [ ] Test batch transcription with missing `settings.kankaEnabled` (verify default to false)
   - [ ] Verify Kanka context is properly included/excluded in story generation based on setting

6. **Cleanup**
   - [ ] Search codebase for any other references to `enableKankaContext` being passed from frontend
   - [ ] Update TypeScript types in `functions/src/types/audio-session.types.ts` if needed
   - [ ] Update any related documentation or comments

## Benefits

1. **Single Source of Truth**: Campaign settings are only stored in the database, not hardcoded in frontend
2. **Flexibility**: Users can change the setting without redeploying the frontend
3. **Consistency**: The actual campaign setting is used, not a hardcoded value
4. **Maintainability**: Reduces parameter passing and frontend/backend coupling

## Risks & Considerations

1. **Breaking Change**: This changes the contract between frontend and backend
   - Need to ensure backend can handle both old (with parameter) and new (without parameter) requests during transition
   - OR deploy backend changes first, then frontend changes

2. **Default Value**: Need to decide what happens if the campaign setting is missing
   - Recommended: Default to `false` (more conservative)
   - Document the default behavior

3. **Migration**: Ensure all existing campaigns have the `enableKankaContext` setting
   - May need a data migration if some campaigns don't have this field

## Questions to Clarify

1. ✅ **Where exactly is the backend code that processes audio uploads?**
   - Answer: `functions/src/transcribe-audio-fast.ts` and `functions/src/transcribe-audio-batch.ts`

2. ✅ **What is the exact Firestore path for campaign settings?**
   - Answer: `campaigns/{campaignId}` with nested field `settings.kankaEnabled`

3. **Should we maintain backward compatibility during the transition, or can we do a coordinated deploy?**
   - Recommendation: Deploy backend changes first (backend reads from DB, ignores parameter), then deploy frontend changes (stops sending parameter)
   - This approach allows zero-downtime deployment

4. **Are there any other similar settings that should be handled the same way?**
   - Need to audit codebase for other settings being passed from frontend that should be read from database

## Code Examples

### Backend - Reading Campaign Settings

Add this helper function to both transcription files:

```typescript
async function getCampaignKankaEnabled(campaignId: string): Promise<boolean> {
  const db = getFirestore();
  const campaignRef = db.collection('campaigns').doc(campaignId);
  const campaignSnap = await campaignRef.get();

  if (!campaignSnap.exists) {
    console.warn(`Campaign ${campaignId} not found, defaulting kankaEnabled to false`);
    return false;
  }

  const campaignData = campaignSnap.data();
  return campaignData?.settings?.kankaEnabled ?? false;
}
```

Then use it in the processing function:

```typescript
// Replace this:
const enableKankaContext = request.data.enableKankaContext;

// With this:
const enableKankaContext = await getCampaignKankaEnabled(campaignId);
```

## Related Files

**Frontend:**
- `src/app/audio/audio-upload-page.component.ts` (line 220)
- `src/app/audio/services/audio-complete-processing.service.ts`
- `src/app/audio/services/audio-backend-operations.service.ts`

**Backend:**
- `functions/src/transcribe-audio-fast.ts`
- `functions/src/transcribe-audio-batch.ts`
- `functions/src/types/audio-session.types.ts`
- `functions/src/workers/story-generation-worker.ts`

**Models:**
- `src/app/campaign/campaign.models.ts` (CampaignSettings interface)
- `src/app/core/models/schemas/campaign.schema.ts` (CampaignSettingsSchema)

## Notes

This is part of a broader pattern where frontend code shouldn't pass configuration that's already stored in the database. The backend should be the authority on campaign settings and retrieve them directly from Firestore.

Similar patterns should be reviewed across the codebase to ensure configuration flows properly from database → backend → processing logic, rather than database → frontend → backend.

## Follow-up Ticket

**Phase 2: Implement Kanka Integration for Transcription**

See: `implement-kanka-transcription-integration.md`

This follow-up ticket covers:

1. **Backend Kanka Service**
   - Port the frontend `KankaService` logic to the backend
   - Create service to fetch entities from Kanka API
   - Handle authentication with Kanka API token
   - Implement caching if needed

2. **Integration with Transcription**
   - Fetch Kanka entities when `kankaEnabled` is true
   - Store `kankaSearchResult` in session document during transcription initialization
   - Use `buildTranscriptionPrompt(kankaContext)` in both fast and batch transcription
   - Update story generation to continue using the stored Kanka data

3. **Testing**
   - Verify Kanka entities appear in transcription prompts
   - Test that character/location names are more accurate in transcriptions
   - Ensure story generation still works with the new flow

This will complete the Kanka integration feature that was partially built but never finished.
