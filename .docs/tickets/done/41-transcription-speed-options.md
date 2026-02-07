# Ticket #41: Transcription Speed Options (Fast vs Batch)

**Status:** Done
**Priority:** Medium
**Created:** 2026-02-07
**Completed:** 2026-02-07

## Overview

Allow users to choose between two transcription processing modes:
- **Fast Transcription**: Direct Gemini API call for immediate processing
- **Batch Transcription**: Queued Gemini Batch API processing (current implementation)

## Problem Statement

Currently, all transcriptions use the Gemini Batch API, which:
- Requires waiting in a queue
- Has unpredictable processing times
- Is more cost-effective but slower

Some users may prefer faster transcription results and are willing to:
- Pay higher API costs for speed
- Get immediate feedback on their audio session
- Iterate quickly during session prep

## Proposed Solution

### User Interface

Add a transcription mode selector when starting a new audio session transcription:

**Option 1: Radio Button Selection (Before Upload)**
```
┌─ Transcription Options ─────────────────────┐
│                                              │
│ ○ Fast Transcription                        │
│   Processes immediately using direct API    │
│   Higher cost, faster results (~2-5 mins)   │
│                                              │
│ ● Batch Transcription (Recommended)         │
│   Queued processing via Batch API           │
│   Lower cost, slower results (~10-30 mins)  │
│                                              │
│ [Upload Audio Files]                        │
└──────────────────────────────────────────────┘
```

**Option 2: Split Upload Button**
```
┌────────────────────────────────────────────┐
│ [Upload & Transcribe (Fast)]               │
│ or                                         │
│ [Upload to Queue (Batch)]                  │
└────────────────────────────────────────────┘
```

**Preferred: Option 1** - More explicit with clearer trade-offs

### Technical Architecture

#### Fast Transcription Flow

**Fire-and-forget API approach:**
1. **Upload** - User uploads audio to GCS (same as current)
2. **Backend Call** - Frontend calls `transcribeAudioFast` Cloud Function with:
   - GCS storage URL(s)
   - Audio session ID
3. **Immediate Return** - Cloud Function:
   - Validates input parameters
   - Updates progress to `transcribing` (40%)
   - Returns immediately with acknowledgment
4. **Async Processing** - Cloud Function continues in background:
   - Fetches AI settings from `/settings/ai`
   - Loads Kanka context
   - Makes call to Gemini API with:
     - GCS file URL
     - Existing `AUDIO_TRANSCRIPTION_PROMPT`
     - Kanka context appended
     - Model and generation config from database
   - Waits for response (non-blocking to frontend)
5. **Update Firestore** - When processing completes, function updates session with:
   - Transcription result
   - Progress: `transcribed` (80%)
   - Processing metadata
6. **Trigger Story Generation** - Enqueue story generation task
7. **Frontend Monitors** - Frontend watches Firestore for progress updates (same as batch mode)

**Key Difference from Batch:**
- Direct API call instead of batch job submission
- No separate callback handler needed (updates Firestore directly)
- Function returns immediately, processing happens in background
- Frontend monitors Firestore (same pattern as batch)
- More expensive API usage (no batch discount)

#### Batch Transcription Flow

**Current implementation (from Ticket #37):**
1. **Upload** - User uploads audio to GCS
2. **Submit Batch Job** - Backend calls `transcribeAudioBatch` with:
   - GCS URLs
   - Session ID
3. **Queue Processing** - Gemini Batch API:
   - Queues job for processing
   - Returns immediately with job ID
4. **Callback** - When complete, Gemini calls callback endpoint
5. **Update Firestore** - Callback handler updates session
6. **Trigger Story Generation** - Callback enqueues story generation

### Implementation Details

#### New Fast Transcription Function

**File:** `functions/src/transcribe-audio-fast.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { AUDIO_TRANSCRIPTION_PROMPT } from './shared/prompts/audio-transcription.prompt';
import { getKankaContext } from './utils/kanka-context';
import { buildTranscriptionPrompt } from './utils/prompt-builder';
import { enqueueTask } from './utils/task-queue';

export const transcribeAudioFast = onCall({
  timeoutSeconds: 540, // Allow time for processing, but frontend won't wait
  memory: '1GiB',
  maxInstances: 10
}, async (request) => {
  const { sessionId, storageUrls } = request.data;

  if (!sessionId || !storageUrls || storageUrls.length === 0) {
    throw new HttpsError('invalid-argument', 'Missing sessionId or storageUrls');
  }

  const db = getFirestore();

  try {
    // 1. Validate session exists
    const sessionDoc = await db.collection('audioSessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      throw new HttpsError('not-found', 'Audio session not found');
    }

    // 2. Update progress to transcribing
    await db.collection('audioSessions').doc(sessionId).update({
      'progress.stage': 'transcribing',
      'progress.progress': 40,
      'progress.mode': 'fast',
      'progress.updatedAt': FieldValue.serverTimestamp()
    });

    // 3. Return immediately - frontend doesn't wait
    // Processing continues in background
    processTranscriptionAsync(sessionId, storageUrls).catch(error => {
      console.error('Async transcription processing failed:', error);
    });

    return {
      success: true,
      message: 'Transcription started'
    };

  } catch (error: any) {
    console.error('Fast transcription initialization error:', error);
    throw error;
  }
});

// Background processing function
async function processTranscriptionAsync(
  sessionId: string,
  storageUrls: string[]
): Promise<void> {
  const db = getFirestore();
  const startTime = Date.now();

  try {
    // 1. Get AI settings
    const aiSettingsDoc = await db.collection('settings').doc('ai').get();
    const aiSettings = aiSettingsDoc.data();

    const transcriptionConfig = aiSettings?.features?.transcription || {};
    let model = transcriptionConfig.model || aiSettings?.defaultModel || 'gemini-2.5-flash';
    const temperature = transcriptionConfig.temperature ?? 0.1;
    const topK = transcriptionConfig.topK ?? 40;
    const topP = transcriptionConfig.topP ?? 1;
    const maxOutputTokens = transcriptionConfig.maxOutputTokens ?? 128000;

    // Validate model availability
    const availableModels = aiSettings?.availableModels || [];
    if (!availableModels.includes(model)) {
      console.warn(`Model ${model} not available, using defaultModel`);
      model = aiSettings?.defaultModel || 'gemini-2.5-flash';
    }

    // 2. Get session data and Kanka context
    const sessionDoc = await db.collection('audioSessions').doc(sessionId).get();
    const session = sessionDoc.data();
    if (!session) {
      throw new Error('Audio session not found during processing');
    }

    const kankaContext = session.campaignId
      ? await getKankaContext(session.campaignId)
      : null;

    // 3. Build system prompt with Kanka context
    const systemPrompt = buildTranscriptionPrompt(kankaContext);

    // 4. Call Gemini API
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const generativeModel = genAI.getGenerativeModel({
      model: model,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature,
        topK,
        topP,
        maxOutputTokens
      }
    });

    // 5. Process each audio file
    const allSegments: any[] = [];

    for (const storageUrl of storageUrls) {
      console.log(`Processing ${storageUrl} with fast transcription`);

      const result = await generativeModel.generateContent([
        {
          fileData: {
            mimeType: 'audio/mpeg',
            fileUri: storageUrl
          }
        }
      ]);

      const response = result.response;
      const text = response.text();

      // Parse JSON response
      let transcriptionData;
      try {
        transcriptionData = JSON.parse(text);
      } catch (parseError) {
        console.error('Failed to parse Gemini response:', text);
        throw new Error('Invalid response format from AI model');
      }

      // Check for error responses
      if (transcriptionData.error) {
        throw new Error(transcriptionData.message || transcriptionData.error);
      }

      // Extract segments
      const segments = transcriptionData.segments || [];
      if (segments.length === 0) {
        console.warn('No segments returned for', storageUrl);
        continue;
      }

      allSegments.push(...segments);
    }

    const processingTime = Date.now() - startTime;

    if (allSegments.length === 0) {
      throw new Error('No transcription segments found in audio');
    }

    // 6. Build full transcription text
    const fullTranscription = allSegments
      .map(s => {
        const timestamp = formatTimestamp(s.timeSeconds);
        const speaker = s.speaker ? `${s.speaker}: ` : '';
        return `[${timestamp}] ${speaker}${s.text}`;
      })
      .join('\n\n');

    // 7. Update Firestore with transcription
    await db.collection('audioSessions').doc(sessionId).update({
      transcription: fullTranscription,
      transcriptionSegments: allSegments,
      'progress.stage': 'transcribed',
      'progress.progress': 80,
      'progress.processingTimeMs': processingTime,
      'progress.modelUsed': model,
      'progress.generationConfig': { temperature, topK, topP, maxOutputTokens },
      'progress.updatedAt': FieldValue.serverTimestamp()
    });

    // 8. Trigger story generation
    await enqueueTask('generateStory', { sessionId });

    console.log(`Fast transcription completed for ${sessionId} in ${processingTime}ms`);

  } catch (error: any) {
    console.error('Fast transcription processing error:', error);

    // Update session with failure
    await db.collection('audioSessions').doc(sessionId).update({
      'progress.stage': 'failed',
      'progress.failure': {
        stage: 'transcribing',
        mode: 'fast',
        error: error.code || 'TRANSCRIPTION_FAILED',
        message: error.message,
        timestamp: FieldValue.serverTimestamp()
      }
    });
  }
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
```

#### Frontend Changes

**File:** `src/app/components/audio-session/audio-upload.component.ts`

Add transcription mode selection:

```typescript
export class AudioUploadComponent {
  // Add signal for transcription mode
  transcriptionMode = signal<'fast' | 'batch'>('batch');

  // Update upload method to use selected mode
  async uploadAndTranscribe() {
    const mode = this.transcriptionMode();

    // Upload files first (same for both modes)
    const storageUrls = await this.uploadToStorage();

    // Call appropriate Cloud Function based on mode
    if (mode === 'fast') {
      await this.transcribeAudioFast(storageUrls);
    } else {
      await this.transcribeAudioBatch(storageUrls);
    }
  }

  private async transcribeAudioFast(storageUrls: string[]) {
    const transcribeFast = this.functions.httpsCallable('transcribeAudioFast');

    try {
      // Fire-and-forget: function returns immediately
      const result = await transcribeFast({
        sessionId: this.sessionId(),
        storageUrls
      }).toPromise();

      console.log('Fast transcription started:', result);
      // Frontend monitors Firestore for progress updates
      // (same as batch mode - no need to wait for completion)
    } catch (error) {
      console.error('Fast transcription failed to start:', error);
      this.handleTranscriptionError(error);
    }
  }

  private async transcribeAudioBatch(storageUrls: string[]) {
    const transcribeBatch = this.functions.httpsCallable('transcribeAudioBatch');

    try {
      // Fire-and-forget: function returns immediately
      const result = await transcribeBatch({
        sessionId: this.sessionId(),
        storageUrls
      }).toPromise();

      console.log('Batch job submitted:', result);
      // Frontend monitors Firestore for progress updates
    } catch (error) {
      console.error('Batch submission failed:', error);
      this.handleTranscriptionError(error);
    }
  }
}
```

**Template updates:**

```html
<!-- Transcription mode selector -->
<div class="transcription-mode-selector">
  <h3>Transcription Options</h3>

  <label class="mode-option">
    <input
      type="radio"
      name="transcriptionMode"
      value="fast"
      [checked]="transcriptionMode() === 'fast'"
      (change)="transcriptionMode.set('fast')"
    />
    <div class="mode-details">
      <strong>Fast Transcription</strong>
      <p>Immediate processing, higher cost (~2-5 minutes)</p>
    </div>
  </label>

  <label class="mode-option recommended">
    <input
      type="radio"
      name="transcriptionMode"
      value="batch"
      [checked]="transcriptionMode() === 'batch'"
      (change)="transcriptionMode.set('batch')"
    />
    <div class="mode-details">
      <strong>Batch Transcription (Recommended)</strong>
      <p>Queued processing, lower cost (~10-30 minutes)</p>
    </div>
  </label>
</div>

<button
  (click)="uploadAndTranscribe()"
  [disabled]="!hasFiles()"
>
  Upload & Start Transcription
</button>
```

### Cost Considerations

**Fast Transcription:**
- Uses standard Gemini API pricing
- No batch discount applied
- Estimated: $X per hour of audio (check current Gemini pricing)
- Higher cost for immediate results

**Batch Transcription:**
- Uses Gemini Batch API pricing
- 50% discount on API costs (verify current batch discount)
- Estimated: $Y per hour of audio
- Lower cost, longer wait time

**UI Cost Display:**
```
Fast: ~$0.XX per minute  (Immediate)
Batch: ~$0.YY per minute (Queue: 10-30 min wait)
```

### User Experience

#### Progress Indicators

Both modes use the same Firestore-based progress monitoring. The frontend subscribes to the session document and updates the UI based on `progress.stage` and `progress.progress`.

**Fast Mode:**
```
┌─ Transcription Progress ────────────┐
│ ⚡ Fast Transcription                │
│ ████████████████░░░░░░ 60%          │
│ Processing audio...                 │
│ Estimated: 2 minutes remaining      │
└─────────────────────────────────────┘
```

**Batch Mode:**
```
┌─ Transcription Progress ────────────┐
│ ⏱️  Batch Transcription              │
│ Position in queue: #3               │
│ Estimated start: 5 minutes          │
└─────────────────────────────────────┘
```

**Note:** Frontend watches Firestore for updates in both modes - no long-running HTTP connections.

#### Settings Persistence

Store user's preference in local storage or user preferences:
- Remember last selected mode
- Allow setting default in user settings
- Show cost estimates for both modes

### Error Handling

**Fast Mode Specific Errors:**
- **Processing Timeout**: If processing exceeds Cloud Function timeout
  - Error written to Firestore `progress.failure`
  - Frontend detects failure via Firestore listener
  - User can manually retry with batch mode
- **API Rate Limits**: If direct API quota exceeded
  - Error written to Firestore `progress.failure`
  - Suggest batch mode as alternative
- **Out of Memory**: If file processing exceeds memory limit
  - Error written to Firestore
  - Log error for monitoring

**Common Errors (Both Modes):**
- Invalid audio format
- Corrupted audio file
- No speech detected
- API key issues

**Error Detection:**
- Frontend monitors Firestore for `progress.stage === 'failed'`
- Displays `progress.failure.message` to user
- Offers retry or mode switch options

### Configuration

**Firestore `/settings/ai` updates:**

Add configuration for both modes:

```typescript
interface AISettings {
  // ... existing fields ...

  features: {
    transcription: {
      model: string;
      temperature: number;
      topK: number;
      topP: number;
      maxOutputTokens: number;

      // NEW: Mode-specific settings
      modes: {
        fast: {
          enabled: boolean; // Feature flag
          maxFileSizeMB: number; // e.g., 100MB limit
          timeoutSeconds: number; // e.g., 540 (9 min)
          costMultiplier: number; // e.g., 2.0 (for UI display)
        };
        batch: {
          enabled: boolean;
          maxFileSizeMB: number; // e.g., 500MB
          expectedQueueTimeMinutes: number; // e.g., 15-30
          costMultiplier: number; // e.g., 1.0 (baseline)
        };
      };
    };
    // ... other features ...
  };
}
```

**Feature Flags:**
- `transcription.modes.fast.enabled` - Enable/disable fast mode
- `transcription.modes.batch.enabled` - Enable/disable batch mode
- Default: Both enabled, batch recommended

## Implementation Steps

### Phase 1: Backend - Fast Transcription Function
1. [ ] Create `functions/src/transcribe-audio-fast.ts`
2. [ ] Implement direct Gemini API integration
3. [ ] Reuse existing `AUDIO_TRANSCRIPTION_PROMPT` and prompt builder
4. [ ] Add AI settings fetcher from `/settings/ai`
5. [ ] Implement error handling with batch fallback
6. [ ] Add timeout configuration (540 seconds)
7. [ ] Add processing metadata tracking
8. [ ] Test with small audio files (< 10MB)
9. [ ] Test with medium audio files (50-100MB)
10. [ ] Test timeout and fallback logic

### Phase 2: Backend - Configuration
1. [ ] Update `/settings/ai` schema with mode-specific settings
2. [ ] Add feature flags for fast/batch modes
3. [ ] Configure file size limits per mode
4. [ ] Set up cost multipliers for UI display
5. [ ] Document configuration options

### Phase 3: Frontend - UI Components
1. [ ] Create transcription mode selector component
2. [ ] Add radio button interface with mode descriptions
3. [ ] Implement mode selection signal
4. [ ] Add cost estimation display
5. [ ] Style mode selector (with "Recommended" badge for batch)
6. [ ] Add help text explaining trade-offs

### Phase 4: Frontend - Integration
1. [ ] Update audio upload component to support mode selection
2. [ ] Add `transcribeAudioFast` callable function
3. [ ] Implement mode-specific upload flows
4. [ ] Update progress indicators for each mode
5. [ ] Add local storage for mode preference
6. [ ] Test mode switching and persistence

### Phase 5: Error Handling & Fallbacks
1. [ ] Implement automatic batch fallback for fast mode failures
2. [ ] Add user notifications for mode switches
3. [ ] Handle timeout errors gracefully
4. [ ] Handle rate limit errors
5. [ ] Test all error scenarios

### Phase 6: Testing & Validation
1. [ ] Test fast mode with various file sizes
2. [ ] Test batch mode (ensure no regression)
3. [ ] Test mode switching during upload
4. [ ] Test fallback scenarios
5. [ ] Test progress tracking for both modes
6. [ ] Verify cost calculations
7. [ ] Test on different browsers
8. [ ] Test with slow network connections

### Phase 7: Documentation & Cleanup
1. [ ] Update user documentation
2. [ ] Add inline code comments
3. [ ] Document configuration settings
4. [ ] Run `npm run build` and `npm run build:backend` in parallel
5. [ ] Update relevant tickets (cross-reference #37)

## Dependencies

- Ticket #37: Batch API implementation (must be completed first)
- Existing `AUDIO_TRANSCRIPTION_PROMPT` from `src/app/prompts/audio-transcription.prompt.ts`
- Existing Kanka integration for context
- Gemini API direct access (non-batch)
- Firebase Cloud Functions Gen2 (9-minute timeout support)
- Firestore for session tracking and settings

## Related Tickets

- **#37**: Gemini Batch API Transcription (prerequisite)
- **#35**: Backend Transcription and Story Generation
- **#14**: Kanka Integration for Story Generation

## Success Criteria

### Functionality
- [ ] Users can select between fast and batch transcription modes
- [ ] Fast mode processes audio within 2-5 minutes for typical files
- [ ] Batch mode continues to work as before
- [ ] Mode preference is persisted across sessions
- [ ] Automatic fallback to batch mode on fast mode failures
- [ ] Progress tracking works correctly for both modes
- [ ] Cost estimates displayed accurately

### Performance
- [ ] Fast mode completes within expected timeframe (2-5 min for typical audio)
- [ ] No regression in batch mode performance
- [ ] Cloud Function timeout handling works correctly
- [ ] Memory usage stays within limits for both modes

### User Experience
- [ ] Clear UI explaining trade-offs between modes
- [ ] Appropriate default (batch mode recommended)
- [ ] Helpful error messages if mode switch occurs
- [ ] Progress indicators accurate for each mode
- [ ] Cost transparency in the UI

### Code Quality
- [ ] Both builds pass: `npm run build` and `npm run build:backend`
- [ ] Code follows Angular best practices (signals, standalone components)
- [ ] Proper error handling throughout
- [ ] Clear documentation in code

## Questions for User

Before implementation, please clarify:

1. **Pricing Display**: Should we show actual dollar amounts or relative cost indicators (e.g., "2x faster, 2x cost")?

2. **Default Mode**: Should fast or batch be the default? (Recommendation: batch for cost savings)

3. **File Size Limits**: What's the maximum file size we should allow for fast mode? (Suggestion: 100MB for optimal performance)

4. **Failed Transcription**: If fast mode fails, should we:
   - Show error and let user manually retry with batch mode
   - Automatically retry with batch mode
   - Ask user before switching modes

5. **User Preferences**: Should the mode selection be:
   - Per-session (always show selector)
   - Persistent (remember user's choice)
   - Configurable in user settings

6. **Feature Flag**: Should we add an admin toggle to enable/disable fast mode globally?

## Risks & Mitigations

**Risk**: Processing fails on large files (timeout, memory, etc.)
**Mitigation**: Write errors to Firestore; frontend detects via listener; add file size validation in UI; set recommended limits

**Risk**: Higher API costs for users who always choose fast mode
**Mitigation**: Clear cost indicators in UI; make batch mode the default/recommended option; consider usage limits

**Risk**: Direct API rate limits exceeded
**Mitigation**: Write error to Firestore; suggest batch mode; implement retry logic; monitor quota usage

**Risk**: Users confused by mode selection
**Mitigation**: Clear UI with explanatory text; show cost/time trade-offs; make batch mode default with "Recommended" badge

**Risk**: Firestore listener issues or missed updates
**Mitigation**: Thorough testing of Firestore subscriptions; use existing listener pattern from batch mode; add fallback polling

**Risk**: Batch mode regression during implementation
**Mitigation**: Thorough testing of both modes; keep batch implementation unchanged; use feature flags for gradual rollout

## Estimated Impact

- **Backend**: Add new Cloud Function for fast transcription (~200 lines)
- **Frontend**: Add mode selector UI and integration (~150 lines)
- **Configuration**: Update AI settings schema
- **Testing**: Test both modes thoroughly
- **Documentation**: Update user guide with mode explanations

## Notes

### Architecture Decision: Fire-and-Forget

**Key Design Choice:**
- Both fast and batch modes use **fire-and-forget** pattern
- Cloud Functions return immediately after validation
- Processing happens asynchronously in background
- Firestore serves as the communication channel
- Frontend monitors Firestore for progress updates

**Benefits:**
- ✅ No long-running HTTP connections
- ✅ Consistent frontend code for both modes
- ✅ No timeout issues for frontend
- ✅ Better error recovery (errors written to Firestore)
- ✅ User can navigate away during processing

**Implementation:**
- `onCall` function validates and returns immediately
- Async helper function handles actual processing
- Errors caught and written to Firestore `progress.failure`
- Frontend Firestore listener handles all updates

### Development Strategy
1. **Build on Ticket #37**: Ensure batch mode is working first
2. **Use Haiku subagents**: For npm build commands to save costs
3. **Test incrementally**: Start with small files, increase size gradually
4. **Monitor costs**: Track actual API costs for both modes
5. **Feature flag**: Use Firestore config to enable/disable fast mode remotely
6. **Test Firestore listeners**: Ensure frontend properly monitors progress

### Cost Analysis Needed
- Research current Gemini API pricing for audio
- Compare batch vs direct API costs
- Calculate break-even point for user time value
- Consider implementing usage limits or warnings

### Future Enhancements
- **Priority Queue**: Allow users to pay extra for batch mode priority
- **Hybrid Mode**: Start with fast, fallback to batch automatically if timeout imminent
- **Usage Analytics**: Track which mode users prefer
- **Cost Tracking**: Show users their monthly cost by mode
- **Scheduled Batch**: Let users schedule batch jobs for overnight processing

---

## Implementation Notes

### Fire-and-Forget Pattern

**IMPORTANT**: Both modes use fire-and-forget architecture:

1. **Cloud Function Flow:**
   ```typescript
   export const transcribeAudioFast = onCall({...}, async (request) => {
     // 1. Validate inputs
     // 2. Update Firestore: progress.stage = 'transcribing'
     // 3. Start async processing (don't await)
     processTranscriptionAsync(...).catch(...)
     // 4. Return immediately
     return { success: true, message: 'Transcription started' }
   })
   ```

2. **Frontend Flow:**
   ```typescript
   async transcribeAudioFast(storageUrls: string[]) {
     // Call function (returns immediately)
     await this.functions.httpsCallable('transcribeAudioFast')({...})

     // Don't wait for processing - Firestore listener handles updates
     // Frontend already subscribes to audioSessions/{sessionId}
   }
   ```

3. **Firestore Communication:**
   - Function writes to: `audioSessions/{sessionId}/progress`
   - Frontend reads from: Same document via real-time listener
   - Errors written to: `audioSessions/{sessionId}/progress.failure`

4. **Consistency with Batch Mode:**
   - Both modes return immediately
   - Both update Firestore asynchronously
   - Frontend code is nearly identical for both modes
   - Only difference: which function to call

---

**Next Steps:**
1. Answer user questions about pricing, defaults, and UX preferences
2. Ensure Ticket #37 (batch mode) is completed and working
3. Research current Gemini API pricing for accurate cost estimates
4. Verify existing Firestore listener handles all progress updates
5. Create proof-of-concept for fast mode with small test file
6. Begin implementation based on user preferences
