# Implement Kanka Integration for Transcription (Phase 2)

## Metadata

- **Created**: 2026-02-07
- **Status**: Todo
- **Priority**: Medium
- **Component**: Audio Transcription / Kanka Integration
- **Type**: Feature Implementation
- **Depends On**: remove-enableKankaContext-from-frontend.md (Phase 1)

## Description

This ticket implements the actual Kanka integration for audio transcription. The infrastructure was partially built but never completed - a `buildTranscriptionPrompt()` helper exists that can add Kanka context to prompts, but:

1. There's no backend service to fetch Kanka data from the API
2. The transcription endpoints don't use the helper or fetch any Kanka data
3. The session document has a `kankaSearchResult` field that's never populated

**This ticket completes the feature**, enabling transcription to use campaign-specific character names, locations, quests, and organizations from Kanka to improve transcription accuracy.

## Context

**Phase 1** (prerequisite ticket) moved the `enableKankaContext` setting from frontend to backend, reading it from campaign settings. This ticket (Phase 2) makes the setting actually DO something by implementing the Kanka integration.

## Current State

### What Exists

✅ **Frontend Kanka Service** (`src/app/kanka/kanka.service.ts`)
- Fetches entities from Kanka API
- Caches results
- Extracts entity mentions from transcripts
- Only used for frontend features, not backend processing

✅ **Transcription Prompt Builder** (`functions/src/audio/transcription-prompt.ts`)
- `buildTranscriptionPrompt(kankaContext?)` helper
- Formats Kanka entities into prompt context
- Adds character names, locations, quests, organizations
- Never actually called by transcription endpoints

✅ **Campaign Settings Structure**
- `settings.kankaEnabled` boolean flag
- `settings.kankaCampaignId` for Kanka API
- Phase 1 made backend read these from database

### What's Missing

❌ **Backend Kanka Service**
- No Node.js/Cloud Functions service to fetch from Kanka API
- Backend can't access Kanka data during transcription

❌ **Kanka Data Fetching in Transcription Flow**
- Fast transcription doesn't fetch or use Kanka data
- Batch transcription doesn't fetch or use Kanka data
- `kankaSearchResult` field in session document is never populated

❌ **Integration with Transcription Prompts**
- Endpoints use raw prompts instead of `buildTranscriptionPrompt()`
- Kanka context never makes it into the Gemini API calls

## Expected Result

After this implementation:

1. **When `settings.kankaEnabled` is true**, transcription will:
   - Fetch relevant Kanka entities (characters, locations, quests, organizations)
   - Include entity names in the transcription prompt as reference context
   - Store the fetched data in `session.kankaSearchResult` for reuse by story generation

2. **Transcription prompts will include**:
   ```
   [Base transcription instructions]

   CAMPAIGN REFERENCE (for name/place accuracy only):
   Characters: Aragorn, Gandalf, Frodo
   Locations: Rivendell, Mordor, The Shire
   Quests: Destroy the Ring, Find the Heir
   Organisations: Fellowship of the Ring

   Remember: Use this context ONLY to spell names and places correctly
   when you hear them. Do not add information that wasn't spoken.
   ```

3. **Character and location names** in transcripts will be more accurate

4. **Story generation** continues to work, now using the `kankaSearchResult` stored during transcription

## Technical Details

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Transcription Request (campaignId, sessionId, audioFile)    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Read campaign settings from Firestore                    │
│    - settings.kankaEnabled                                  │
│    - settings.kankaCampaignId                               │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
              ┌─────────┴─────────┐
              │ kankaEnabled?     │
              └─────────┬─────────┘
                        │
         ┌──────────────┴───────────────┐
         │ YES                      NO  │
         ▼                              ▼
┌────────────────────────┐    ┌────────────────────┐
│ 2. Fetch Kanka Data    │    │ 2. Skip Kanka      │
│ - Characters           │    │    (context = null)│
│ - Locations            │    └────────┬───────────┘
│ - Quests               │             │
│ - Organizations        │             │
└────────┬───────────────┘             │
         │                             │
         ▼                             │
┌────────────────────────┐             │
│ 3. Store in Session    │             │
│    kankaSearchResult   │             │
└────────┬───────────────┘             │
         │                             │
         └──────────┬──────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Build Transcription Prompt                               │
│    buildTranscriptionPrompt(kankaContext)                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Call Gemini API with enhanced prompt                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Story generation reads kankaSearchResult from session    │
└─────────────────────────────────────────────────────────────┘
```

### Files to Create

1. **Backend Kanka Service**
   - `functions/src/services/kanka.service.ts`
   - Port logic from `src/app/kanka/kanka.service.ts`
   - Adapt for Node.js environment
   - Use `node-fetch` or similar for HTTP requests
   - Handle Kanka API authentication

### Files to Modify

1. **Transcription Endpoints**
   - `functions/src/transcribe-audio-fast.ts`
   - `functions/src/transcribe-audio-batch.ts`

2. **Environment Configuration**
   - Backend needs Kanka API token (Secret Manager or env var)
   - May need to add to Cloud Functions config

3. **Types** (if needed)
   - `functions/src/types/audio-session.types.ts`
   - Ensure `KankaSearchResult` type is available

## Implementation Steps

### 1. Create Backend Kanka Service

- [ ] Create `functions/src/services/kanka.service.ts`
- [ ] Implement `KankaService` class with methods:
  - `async getAllEntities(kankaCampaignId: string): Promise<KankaSearchResult>`
  - `async searchEntities(kankaCampaignId: string, query: string): Promise<KankaSearchResult>`
  - Private helpers for fetching by entity type
- [ ] Add Kanka API token to Secret Manager (if not already there)
- [ ] Add secret to Cloud Functions configuration
- [ ] Implement error handling and retries
- [ ] Add logging for debugging

### 2. Integrate with Fast Transcription

- [ ] Import `KankaService` in `transcribe-audio-fast.ts`
- [ ] Import `buildTranscriptionPrompt` helper
- [ ] After reading campaign settings, check if `kankaEnabled` is true
- [ ] If true, fetch Kanka entities using `KankaService.getAllEntities()`
- [ ] Store fetched data in session document:
  ```typescript
  await sessionRef.update({
    kankaSearchResult: kankaContext,
    'transcriptionFast.kankaFetched': true,
  });
  ```
- [ ] Replace raw prompt (line 204) with:
  ```typescript
  { text: buildTranscriptionPrompt(kankaContext) }
  ```
- [ ] Add error handling for Kanka fetch failures (log error, continue with null context)

### 3. Integrate with Batch Transcription

- [ ] Import `KankaService` in `transcribe-audio-batch.ts`
- [ ] Import `AUDIO_TRANSCRIPTION_PROMPT` constant (replace hardcoded string)
- [ ] Import `buildTranscriptionPrompt` helper
- [ ] After reading campaign settings, check if `kankaEnabled` is true
- [ ] If true, fetch Kanka entities
- [ ] Store in session document (same as fast transcription)
- [ ] Replace hardcoded string (line 142) with:
  ```typescript
  { text: buildTranscriptionPrompt(kankaContext) }
  ```
- [ ] Add error handling for Kanka fetch failures

### 4. Update Story Generation Worker

- [ ] Verify `story-generation-worker.ts` correctly reads `kankaSearchResult` from session
- [ ] Confirm it still works with the new data source
- [ ] No changes should be needed (already reads from session document)

### 5. Configuration & Secrets

- [ ] Verify Kanka API token is in Secret Manager or environment
- [ ] Add token to Cloud Functions secrets list if needed
- [ ] Document required configuration in README or deployment docs

### 6. Testing

- [ ] **Unit Tests** (if test infrastructure exists):
  - Test `KankaService` with mock Kanka API responses
  - Test `buildTranscriptionPrompt()` with various inputs
  - Test transcription with kankaEnabled true/false

- [ ] **Integration Tests**:
  - Test fast transcription with `settings.kankaEnabled = true`
  - Test batch transcription with `settings.kankaEnabled = true`
  - Verify `kankaSearchResult` is stored in session document
  - Test with missing Kanka campaign ID (should handle gracefully)
  - Test with invalid Kanka API token (should handle gracefully)

- [ ] **End-to-End Tests**:
  - Upload audio with Kanka integration enabled
  - Verify transcription includes reference context in prompt
  - Check that character names mentioned in audio are spelled correctly
  - Verify story generation still works and uses the Kanka data

### 7. Documentation

- [ ] Add comments explaining Kanka integration in transcription files
- [ ] Update deployment documentation with Kanka API token requirements
- [ ] Add troubleshooting notes for common Kanka API issues

## Code Examples

### Backend Kanka Service (Template)

```typescript
// functions/src/services/kanka.service.ts
import fetch from 'node-fetch';
import { KankaSearchResult, KankaEntity, KankaEntityType } from '../types/audio-session.types';

const DEFAULT_TYPES: KankaEntityType[] = ['characters', 'locations', 'quests', 'organisations'];
const KANKA_API_BASE = 'https://api.kanka.io/1.0';

export class KankaService {
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async getAllEntities(kankaCampaignId: string): Promise<KankaSearchResult> {
    const result: KankaSearchResult = {
      characters: [],
      locations: [],
      quests: [],
      organisations: [],
    };

    for (const entityType of DEFAULT_TYPES) {
      try {
        const entities = await this.fetchEntitiesByType(kankaCampaignId, entityType);
        result[entityType] = entities;
      } catch (error) {
        console.error(`[Kanka] Failed to fetch ${entityType}:`, error);
        // Continue with empty array for this type
        result[entityType] = [];
      }
    }

    return result;
  }

  private async fetchEntitiesByType(
    kankaCampaignId: string,
    entityType: KankaEntityType
  ): Promise<KankaEntity[]> {
    const url = `${KANKA_API_BASE}/campaigns/${kankaCampaignId}/${entityType}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Kanka API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    return json.data || [];
  }
}
```

### Integration Example (Fast Transcription)

```typescript
// In transcribe-audio-fast.ts

import { KankaService } from './services/kanka.service';
import { buildTranscriptionPrompt } from './audio/transcription-prompt';

// In processTranscriptionAsync function:

async function processTranscriptionAsync(
  campaignId: string,
  sessionId: string,
  storageUrl: string,
  audioFileName: string,
  userCorrections?: string
): Promise<void> {
  const db = getFirestore();
  const sessionRef = db
    .collection('campaigns')
    .doc(campaignId)
    .collection('audioSessions')
    .doc(sessionId);

  try {
    // ... existing code to get AI settings ...

    // Fetch campaign settings
    const campaignRef = db.collection('campaigns').doc(campaignId);
    const campaignSnap = await campaignRef.get();
    const campaignData = campaignSnap.data();
    const kankaEnabled = campaignData?.settings?.kankaEnabled ?? false;
    const kankaCampaignId = campaignData?.settings?.kankaCampaignId;

    // Fetch Kanka context if enabled
    let kankaContext: KankaSearchResult | undefined;
    if (kankaEnabled && kankaCampaignId) {
      const kankaToken = process.env.KANKA_API_TOKEN;
      if (kankaToken) {
        try {
          console.log('[Fast Transcription] Fetching Kanka entities...');
          const kankaService = new KankaService(kankaToken);
          kankaContext = await kankaService.getAllEntities(kankaCampaignId);

          // Store in session for story generation
          await sessionRef.update({
            kankaSearchResult: kankaContext,
          });

          console.log('[Fast Transcription] Kanka entities fetched successfully');
        } catch (error) {
          console.error('[Fast Transcription] Failed to fetch Kanka data:', error);
          // Continue without Kanka context
        }
      } else {
        console.warn('[Fast Transcription] Kanka enabled but API token not configured');
      }
    }

    // ... existing code to generate signed URL ...

    // Call Gemini API with Kanka-enhanced prompt
    const result = await googleAi.models.generateContent({
      model: model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildTranscriptionPrompt(kankaContext) }, // ← Use helper here
            {
              fileData: {
                mimeType: mimeType,
                fileUri: signedUrl,
              },
            },
          ],
        },
      ],
      config: { /* ... existing config ... */ },
    });

    // ... rest of processing ...
  } catch (error) {
    // ... error handling ...
  }
}
```

## Environment Variables / Secrets

### Required Configuration

Add to Cloud Functions secrets:
```bash
KANKA_API_TOKEN=<your-kanka-personal-access-token>
```

Update `functions/src/transcribe-audio-fast.ts` and `transcribe-audio-batch.ts`:
```typescript
export const transcribeAudioFast = onCall(
  {
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: ['GOOGLE_AI_API_KEY', 'KANKA_API_TOKEN'], // ← Add here
  },
  async (request: CallableRequest<TranscribeAudioFastRequest>) => {
    // ...
  }
);
```

## Benefits

1. **Improved Transcription Accuracy**
   - Character names spelled correctly (e.g., "Gandalf" not "Gandolf")
   - Location names accurate (e.g., "Rivendell" not "Rivendale")
   - Proper nouns from campaign lore recognized

2. **Consistent Naming**
   - Same spelling across transcription and story generation
   - Matches user's Kanka campaign data

3. **Better User Experience**
   - Less manual correction needed
   - More professional-looking session summaries

4. **Single Source of Truth**
   - Kanka data stored once in session document
   - Reused by both transcription and story generation

## Risks & Considerations

### Performance

- **Kanka API Latency**: Fetching entities adds time to transcription start
  - Mitigation: Fetch in parallel with other initialization
  - Mitigation: Use reasonable timeout and continue without Kanka on failure

- **Too Many Entities**: Large campaigns might have hundreds of entities
  - Mitigation: Limit to top-level entities only
  - Mitigation: Consider caching at campaign level (future optimization)

### Reliability

- **Kanka API Failures**: API might be down or rate-limited
  - Mitigation: Graceful degradation - log error and continue without context
  - Never fail transcription just because Kanka is unavailable

- **Missing Configuration**: User might enable Kanka but not provide campaign ID
  - Mitigation: Check for valid configuration before attempting fetch
  - Log warning but don't fail

### Security

- **API Token Exposure**: Must not leak Kanka token
  - Use Secret Manager, never commit tokens
  - Don't log token values

- **Campaign ID Validation**: Don't trust user-provided Kanka campaign IDs
  - Kanka API will return 403/404 if unauthorized
  - Handle these errors gracefully

## Testing Checklist

- [ ] Fast transcription with Kanka enabled, valid config
- [ ] Fast transcription with Kanka enabled, invalid campaign ID
- [ ] Fast transcription with Kanka enabled, missing API token
- [ ] Fast transcription with Kanka disabled
- [ ] Batch transcription with Kanka enabled, valid config
- [ ] Batch transcription with Kanka enabled, invalid campaign ID
- [ ] Batch transcription with Kanka disabled
- [ ] Story generation uses stored `kankaSearchResult`
- [ ] Story generation works when `kankaSearchResult` is missing
- [ ] Verify prompt includes entity names when Kanka is enabled
- [ ] Verify prompt is normal when Kanka is disabled
- [ ] End-to-end: Upload → Transcribe → Generate Story with Kanka enabled

## Success Criteria

✅ Backend Kanka service successfully fetches entities from Kanka API
✅ Transcription prompts include Kanka context when `settings.kankaEnabled` is true
✅ Session document stores `kankaSearchResult` for reuse
✅ Story generation continues to work unchanged
✅ Graceful degradation when Kanka is unavailable
✅ No secrets leaked, proper error handling
✅ Documentation updated with configuration requirements

## Related Files

**To Create:**
- `functions/src/services/kanka.service.ts`

**To Modify:**
- `functions/src/transcribe-audio-fast.ts`
- `functions/src/transcribe-audio-batch.ts`

**Already Exists (Reference):**
- `functions/src/audio/transcription-prompt.ts` (helper to use)
- `functions/src/workers/story-generation-worker.ts` (reads kankaSearchResult)
- `src/app/kanka/kanka.service.ts` (frontend reference implementation)
- `functions/src/types/audio-session.types.ts` (KankaSearchResult type)

## Estimated Complexity

**Medium-High**

- Backend service creation: 2-3 hours
- Integration with fast transcription: 1-2 hours
- Integration with batch transcription: 1-2 hours
- Testing and debugging: 2-3 hours
- Documentation: 1 hour

**Total: 7-11 hours**

## Notes

- This ticket assumes Phase 1 is complete (backend reads `settings.kankaEnabled` from database)
- The frontend Kanka service can serve as a reference implementation
- Consider adding rate limiting / caching in future if Kanka API usage becomes an issue
- This completes a feature that was started but never finished - the infrastructure was partially built but never wired up
