# Ticket #37: Simplified Transcription Flow with Gemini Batch API

**Status:** Open
**Priority:** High
**Created:** 2026-02-05

## Overview

Simplify the audio transcription pipeline by leveraging Google's Gemini Batch API to process large audio files directly from Google Cloud Storage without downloading or chunking.

## Problem Statement

The current transcription flow is complex and involves:
- Downloading large audio files to Cloud Functions `/tmp` directory
- Splitting files into 30-minute chunks
- Processing each chunk separately
- Reassembling results

This approach:
- Consumes significant memory and processing time
- Requires complex state management across chunking steps
- Has higher failure points in the pipeline
- Uses more Cloud Functions execution time and resources

## Proposed Solution

### Simplified Architecture

Use Gemini's Batch API to process audio files directly from Google Cloud Storage without any intermediate processing.

**Flow:**
1. **Upload** - User uploads audio file(s) directly to GCS from frontend (same as current)
2. **Backend Receives Call** - Backend Cloud Function receives:
   - GCS storage URL(s)
   - Audio session ID
3. **Submit Batch Job** - Backend calls Gemini Batch API with:
   - Link to original GCS file URL (no download or split)
   - Existing Kanka context (campaign characters, locations, etc.)
   - System prompt for D&D transcription
4. **Gemini Processes** - Gemini Batch API:
   - Reads file directly from GCS
   - Transcribes entire audio file
   - Applies context and system prompt
5. **Callback Handler** - When batch is ready, Gemini calls callback function that:
   - Updates Firestore with transcription results
   - Updates progress to completed
   - Triggers story generation worker
6. **Story Generation** - Story generation worker called with transcription result

### Benefits

1. **Simplicity**: Eliminates downloading, chunking, and reassembly logic
2. **Performance**: Gemini handles large files natively, likely faster than chunked approach
3. **Reliability**: Fewer moving parts = fewer failure points
4. **Cost**: Less Cloud Functions execution time and memory usage
5. **Maintainability**: Significantly less code to maintain

## Technical Details

### AI Settings Configuration

The transcription model and generation parameters are stored in Firestore at `/settings/ai`:

```typescript
interface AISettings {
  apiProvider: 'google';
  defaultModel: string; // Fallback if feature-specific model not set
  availableModels: string[]; // List of models available
  features: {
    transcription: {
      model: string; // e.g., "gemini-3-flash-preview"
      temperature: number; // e.g., 0.1 for precise transcription
      topK: number; // e.g., 40
      topP: number; // e.g., 1
      maxOutputTokens: number; // e.g., 128000
    };
    storyGeneration: { /* similar structure */ };
    podcastScript: { /* similar structure */ };
  };
  modelConfig: {
    [modelName: string]: {
      temperature: number;
      topK: number;
      topP: number;
      maxOutputTokens: number;
    };
  };
}
```

**Current transcription settings (from `/settings/ai`):**
- **Model**: `gemini-3-flash-preview`
- **Temperature**: `0.1` (low for accuracy)
- **TopK**: `40`
- **TopP**: `1`
- **Max Output Tokens**: `128000`

These settings will be fetched at runtime and applied to the batch job configuration.

### Gemini Batch API Integration

#### Batch Job Submission

```typescript
// functions/src/transcribe-audio.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export const transcribeAudioBatch = onCall(async (request) => {
  const { sessionId, storageUrls } = request.data;

  // 1. Get AI settings from Firestore
  const db = getFirestore();
  const aiSettingsDoc = await db.collection('settings').doc('ai').get();
  const aiSettings = aiSettingsDoc.data();

  // Extract transcription-specific settings
  const transcriptionConfig = aiSettings?.features?.transcription || {};
  const model = transcriptionConfig.model || aiSettings?.defaultModel || 'gemini-2.5-flash';
  const temperature = transcriptionConfig.temperature ?? 0.1;
  const topK = transcriptionConfig.topK ?? 40;
  const topP = transcriptionConfig.topP ?? 1;
  const maxOutputTokens = transcriptionConfig.maxOutputTokens ?? 128000;

  // Validate model is available
  const availableModels = aiSettings?.availableModels || [];
  if (!availableModels.includes(model)) {
    console.warn(`Model ${model} not in availableModels, using defaultModel`);
    model = aiSettings?.defaultModel || 'gemini-2.5-flash';
  }

  // 2. Get session data and Kanka context
  const session = await getAudioSession(sessionId);
  const kankaContext = await getKankaContext(session.campaignId);

  // 3. Build system prompt with Kanka context
  const systemPrompt = buildTranscriptionPrompt(kankaContext);

  // 4. Submit batch job to Gemini with DB-configured settings
  const genAI = new GoogleGenerativeAI(AI_API_KEY);
  const batchJob = await genAI.submitBatchJob({
    files: storageUrls, // Direct GCS URLs
    systemInstruction: systemPrompt,
    model: model, // From database
    generationConfig: {
      temperature: temperature,
      topK: topK,
      topP: topP,
      maxOutputTokens: maxOutputTokens
    },
    callbackUrl: `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/geminiCallback`,
    metadata: { sessionId }
  });

  // 5. Store batch job ID and settings used in Firestore
  await updateSessionProgress(sessionId, {
    stage: 'transcribing',
    progress: 40,
    batchJobId: batchJob.id,
    modelUsed: model,
    generationConfig: { temperature, topK, topP, maxOutputTokens },
    updatedAt: FieldValue.serverTimestamp()
  });

  // 6. Return immediately (fire-and-forget)
  return { success: true, batchJobId: batchJob.id, modelUsed: model };
});
```

#### Callback Handler

```typescript
// functions/src/gemini-callback.ts
export const geminiCallback = onRequest(async (req, res) => {
  const { status, result, metadata } = req.body;
  const { sessionId } = metadata;

  try {
    if (status === 'completed') {
      // Parse the JSON response from Gemini
      const transcriptionData = typeof result === 'string' ? JSON.parse(result) : result;

      // Check for error responses from the prompt
      if (transcriptionData.error) {
        await updateSessionProgress(sessionId, {
          stage: 'failed',
          failure: {
            stage: 'transcribing',
            error: transcriptionData.error,
            message: transcriptionData.message,
            timestamp: FieldValue.serverTimestamp()
          }
        });
        res.status(200).send({ success: false, error: transcriptionData.error });
        return;
      }

      // Extract segments from the response
      const segments = transcriptionData.segments || [];

      if (segments.length === 0) {
        await updateSessionProgress(sessionId, {
          stage: 'failed',
          failure: {
            stage: 'transcribing',
            error: 'NO_SEGMENTS',
            message: 'No transcription segments returned',
            timestamp: FieldValue.serverTimestamp()
          }
        });
        res.status(200).send({ success: false });
        return;
      }

      // Build full transcription text and timestamps
      const fullTranscription = segments
        .map(s => `[${formatTimestamp(s.timeSeconds)}] ${s.speaker ? s.speaker + ': ' : ''}${s.text}`)
        .join('\n\n');

      // 1. Update Firestore with transcription
      await updateAudioSession(sessionId, {
        transcription: fullTranscription,
        transcriptionSegments: segments, // Store structured segments
        progress: { stage: 'transcribed', progress: 80 }
      });

      // 2. Trigger story generation
      await enqueueTask('generateStory', { sessionId });

      res.status(200).send({ success: true, segmentCount: segments.length });

    } else if (status === 'failed') {
      // Handle batch job failure
      await updateSessionProgress(sessionId, {
        stage: 'failed',
        failure: {
          stage: 'transcribing',
          error: result.error || 'BATCH_JOB_FAILED',
          timestamp: FieldValue.serverTimestamp()
        }
      });

      res.status(200).send({ success: false });
    }

  } catch (error) {
    console.error('Callback handler error:', error);
    await updateSessionProgress(sessionId, {
      stage: 'failed',
      failure: {
        stage: 'transcribing',
        error: 'CALLBACK_ERROR',
        message: error.message,
        timestamp: FieldValue.serverTimestamp()
      }
    });
    res.status(500).send({ error: error.message });
  }
});

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

#### System Prompt with Kanka Context

The transcription uses the existing system prompt from `src/app/prompts/audio-transcription.prompt.ts` with Kanka context appended:

```typescript
import { AUDIO_TRANSCRIPTION_PROMPT } from '../../../app/prompts/audio-transcription.prompt';

function buildTranscriptionPrompt(kankaContext: KankaContext): string {
  // Start with the base transcription prompt
  let fullPrompt = AUDIO_TRANSCRIPTION_PROMPT;

  // Append Kanka context if available
  if (kankaContext) {
    fullPrompt += `\n\nCAMPAIGN CONTEXT (for name/place recognition only):\n`;

    if (kankaContext.campaignName) {
      fullPrompt += `Campaign: ${kankaContext.campaignName}\n`;
    }

    if (kankaContext.characters?.length > 0) {
      fullPrompt += `\nCharacters:\n`;
      fullPrompt += kankaContext.characters
        .map(c => `- ${c.name}: ${c.type || ''} ${c.race || ''} ${c.class || ''}`.trim())
        .join('\n');
    }

    if (kankaContext.locations?.length > 0) {
      fullPrompt += `\n\nLocations:\n`;
      fullPrompt += kankaContext.locations
        .map(l => `- ${l.name}${l.description ? ': ' + l.description : ''}`)
        .join('\n');
    }

    if (kankaContext.npcs?.length > 0) {
      fullPrompt += `\n\nNPCs:\n`;
      fullPrompt += kankaContext.npcs
        .map(n => `- ${n.name}${n.description ? ': ' + n.description : ''}`)
        .join('\n');
    }

    if (kankaContext.organisations?.length > 0) {
      fullPrompt += `\n\nOrganisations:\n`;
      fullPrompt += kankaContext.organisations
        .map(o => `- ${o.name}${o.description ? ': ' + o.description : ''}`)
        .join('\n');
    }

    if (kankaContext.quests?.length > 0) {
      fullPrompt += `\n\nActive Quests:\n`;
      fullPrompt += kankaContext.quests
        .map(q => `- ${q.name}${q.description ? ': ' + q.description : ''}`)
        .join('\n');
    }
  }

  return fullPrompt;
}
```

**Key Features of the Existing Prompt:**
- Anti-repetition rules to prevent hallucination
- Quality guidelines for accurate transcription
- Campaign context usage rules (only for name recognition)
- JSON output format with segments, timestamps, and speakers
- Error handling for corrupted or silent audio
- Focus on in-game content only (excludes meta-game talk)

**Expected Output Format:**

Success response:
```json
{
  "segments": [
    {
      "timeSeconds": 0,
      "text": "The party enters the ancient dungeon cautiously.",
      "speaker": "DM"
    },
    {
      "timeSeconds": 15.5,
      "text": "I want to check the door for traps.",
      "speaker": "Rogue"
    }
  ]
}
```

Error response:
```json
{
  "error": "NO_AUDIO_DETECTED",
  "message": "No speech detected in audio file"
}
```

or

```json
{
  "error": "AUDIO_CORRUPTED",
  "message": "Audio file is corrupted or unreadable"
}
```

### Storage Path Configuration

**Current structure (keep the same):**
```
gs://{bucket}/campaigns/{campaignId}/audio/{sessionId}/{filename}
```

The Gemini Batch API can read directly from this GCS path without any changes to storage structure or security rules.

### Progress Tracking

**Progress stages:**
- `uploading` (0-20%) - Frontend upload to GCS
- `submitted` (20-40%) - Batch job submitted to Gemini
- `transcribing` (40-80%) - Gemini processing (callback updates this)
- `generating-story` (80-100%) - Story generation from transcription
- `completed` (100%) - All processing complete

### Error Handling

**Gemini Batch API Errors:**
- Invalid GCS URL → Update session with failure
- API quota exceeded → Retry with exponential backoff
- Transcription failed → Log error, mark session as failed
- Callback timeout → Poll batch job status periodically

**Recovery Strategy:**
```typescript
// Polling fallback if callback doesn't arrive within expected time
export const pollBatchJobs = onSchedule('every 5 minutes', async () => {
  const pendingSessions = await getPendingTranscriptions();

  for (const session of pendingSessions) {
    if (isCallbackOverdue(session)) {
      const status = await genAI.getBatchJobStatus(session.batchJobId);

      if (status.completed) {
        // Manually trigger callback logic
        await processTranscriptionResult(session.id, status.result);
      }
    }
  }
});
```

## Implementation Steps

### Phase 1: Backend Setup
1. [ ] Research Gemini Batch API documentation for audio processing
2. [ ] Create `transcribe-audio-batch.ts` Cloud Function
3. [ ] Implement AI settings fetcher from `/settings/ai` document
4. [ ] Add model validation against `availableModels` list
5. [ ] Create `gemini-callback.ts` HTTP endpoint
6. [ ] Import and use existing `AUDIO_TRANSCRIPTION_PROMPT` from frontend
7. [ ] Implement system prompt builder that appends Kanka context
8. [ ] Set up batch job submission with GCS URLs and DB-configured model/params
9. [ ] Implement callback handler that parses JSON segments format
10. [ ] Add error handling for prompt's error responses (NO_AUDIO_DETECTED, AUDIO_CORRUPTED)

### Phase 2: Callback & Recovery
1. [ ] Configure callback URL in Gemini API settings
2. [ ] Implement callback authentication/validation
3. [ ] Create polling fallback for missed callbacks
4. [ ] Set up Cloud Scheduler for periodic polling
5. [ ] Implement retry logic for failed batch jobs

### Phase 3: Frontend Updates
1. [ ] Update frontend to call new `transcribeAudioBatch` function
2. [ ] Remove chunking-related UI elements
3. [ ] Update progress indicator for new stages
4. [ ] Test with large audio files (100MB+)

### Phase 4: Testing & Validation
1. [ ] Test with small files (< 10MB)
2. [ ] Test with medium files (50-100MB)
3. [ ] Test with large files (200-400MB)
4. [ ] Test callback handling
5. [ ] Test polling fallback
6. [ ] Test error scenarios (invalid URLs, API failures)

### Phase 5: Cleanup
1. [ ] Remove old chunking service code
2. [ ] Remove old download worker code
3. [ ] Update documentation
4. [ ] Remove unused dependencies

## API Research Needed

**Before implementation, verify:**
1. Does Gemini Batch API support direct GCS URLs for audio input?
2. What are the file size limits for Gemini Batch API?
3. What is the expected processing time for large files?
4. How are callbacks authenticated/secured?
5. What is the callback payload format?
6. Is there a polling API as fallback?
7. Can we include system instructions and context in batch jobs?

**Alternatives if Batch API doesn't support direct GCS:**
- Use Gemini's regular API with streaming for large files
- Use Google Speech-to-Text API with GCS URIs (proven to work)
- Keep chunking approach but optimize it

## Comparison: Current vs Proposed

| Aspect | Current (Chunking) | Proposed (Batch API) |
|--------|-------------------|---------------------|
| Download | Required to /tmp | Not needed |
| Chunking | Split into 30-min parts | Not needed |
| Processing | Sequential chunks | Single batch job |
| Memory | High (download + chunks) | Low (no local files) |
| Execution Time | Long (download + chunk + process) | Short (submit + wait) |
| Failure Points | 3-4 stages | 1-2 stages |
| Code Complexity | High | Low |
| Maintenance | Complex state management | Simple job tracking |
| Cost | Higher (more execution time) | Lower (less execution time) |

## Success Criteria

### Functionality
- [ ] Backend successfully submits batch jobs with GCS URLs
- [ ] Gemini processes audio files directly from GCS
- [ ] Callback handler receives and processes results correctly
- [ ] Transcription includes Kanka context appropriately
- [ ] Story generation triggered after transcription completes
- [ ] Progress tracking works correctly for all stages
- [ ] Polling fallback activates if callback fails

### Performance
- [ ] Transcription completes faster than chunking approach
- [ ] No memory issues with large files (300MB+)
- [ ] Cloud Functions execution time reduced by 50%+
- [ ] No file downloads to `/tmp` directory

### Reliability
- [ ] Handles callback failures gracefully
- [ ] Polling fallback catches missed callbacks
- [ ] Proper error logging and recovery
- [ ] Failed batch jobs can be retried

### Code Quality
- [ ] Both builds pass: `npm run build` and `npm run build:backend`
- [ ] Legacy chunking code removed
- [ ] Clear documentation of new flow
- [ ] Proper error handling throughout

## Dependencies

- Gemini Batch API availability and features
- Existing `AUDIO_TRANSCRIPTION_PROMPT` from `src/app/prompts/audio-transcription.prompt.ts`
- Existing Kanka integration for context
- Current GCS storage structure (no changes needed)
- Firestore `/settings/ai` document for model configuration
- Firestore for progress tracking and results

## Risks & Mitigations

**Risk**: Gemini Batch API doesn't support direct GCS URLs for audio
**Mitigation**: Research API capabilities first; fallback to Speech-to-Text API if needed

**Risk**: Batch processing takes longer than expected
**Mitigation**: Keep frontend progress UI generic; show "transcribing" status

**Risk**: Callbacks get lost or delayed
**Mitigation**: Implement polling fallback with Cloud Scheduler

**Risk**: File size limits in Batch API
**Mitigation**: Add file size validation before submission; provide user feedback

**Risk**: Breaking existing in-progress sessions
**Mitigation**: Accept as part of refactor (no backward compatibility as per requirements)

## Estimated Impact

- **Backend**: Major simplification - remove chunking/download services, add batch API integration
- **Frontend**: Minor updates - call new function, update progress stages
- **Infrastructure**: Add Cloud Scheduler for polling fallback
- **Database**: No schema changes needed
- **Storage**: No changes needed

## Notes

### Development Strategy
1. **Research first**: Verify Gemini Batch API capabilities before coding
2. **Prompt reuse**: Move existing `AUDIO_TRANSCRIPTION_PROMPT` to shared location for frontend/backend access
3. **Incremental rollout**: Test with small files before large ones
4. **Keep old code temporarily**: Don't delete until new approach validated
5. **Monitor closely**: Track first batch jobs carefully
6. **Use Haiku subagents**: For npm build commands to save costs
7. **Test error cases**: Validate prompt's error handling (NO_AUDIO_DETECTED, AUDIO_CORRUPTED)
8. **Parse JSON carefully**: Callback handler must correctly parse the prompt's JSON segments format

### Related Tickets
- **#36**: Alternative worker chain architecture (superseded if this works)
- **#35**: Backend transcription and story generation
- **#14**: Kanka integration for context

### Future Enhancements
- Support multiple audio files in single batch job
- Add progress callback during processing (if API supports)
- Implement priority queuing for paid users
- Add estimated completion time based on file size

---

**Next Steps:**
1. Research Gemini Batch API documentation
2. Create proof-of-concept with small test file
3. Validate API capabilities match requirements
4. Begin implementation if viable; otherwise consider alternatives
