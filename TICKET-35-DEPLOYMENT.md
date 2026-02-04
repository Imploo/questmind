# Ticket 35: Backend Audio Processing - Deployment Guide

## Overview

This ticket implements complete audio-to-podcast processing in the backend using Cloud Functions, following the proven pattern from Ticket 34 (podcast generation).

## What Was Implemented

### Backend Infrastructure

1. **New Cloud Function**: `processAudioSession`
   - Location: `functions/src/process-audio-session.ts`
   - Fire-and-forget pattern with background processing
   - Complete pipeline: transcribe → story → script → audio → upload

2. **Audio Chunking Service**
   - Location: `functions/src/audio/chunking.service.ts`
   - Handles large audio files (>30 minutes)
   - Uses ffmpeg for splitting and processing

3. **Prompts Migrated to Backend**
   - `functions/src/prompts/audio-transcription.prompt.ts`
   - `functions/src/prompts/session-story-generator.prompt.ts`

4. **Type Definitions**
   - Location: `functions/src/types/audio-session.types.ts`
   - Shared types for processing

5. **AI Settings Migration Script**
   - Location: `functions/src/migration-scripts/update-ai-settings.ts`
   - Adds feature-specific AI configurations

### Frontend Updates

1. **New Service**: `AudioCompleteProcessingService`
   - Location: `src/app/audio/audio-complete-processing.service.ts`
   - Unified interface for starting processing and listening to progress

2. **Extended Data Model**
   - Updated `AudioSessionRecord` with complete processing fields
   - Added `CompleteProcessingStatus` type
   - Added `ProcessingProgress` interface

3. **Component Updates**
   - Modified `audio-session.component.ts` to use new service
   - Added `startCompleteProcessing()` method
   - Real-time progress updates via Firestore listeners

## Deployment Steps

### 1. Install Dependencies

```bash
cd functions
npm install
```

This installs:
- `fluent-ffmpeg` - Audio processing
- `@ffmpeg-installer/ffmpeg` - Bundled ffmpeg binary
- `@types/fluent-ffmpeg` - TypeScript definitions

### 2. Build Backend

```bash
cd functions
npm run build
```

### 3. Set Secrets (if not already set)

```bash
firebase functions:secrets:set GOOGLE_AI_API_KEY
firebase functions:secrets:set ELEVENLABS_API_KEY
```

### 4. Deploy Backend Function

```bash
firebase deploy --only functions:processAudioSession
```

### 5. Run Settings Migration

Option A - Using Firebase Console:
1. Go to Firebase Console → Functions
2. Find and run `processAudioSession` manually via test
3. Or use Firebase CLI shell:

```bash
firebase functions:shell
> const migration = require('./lib/migration-scripts/update-ai-settings');
> migration.updateAISettings()
```

Option B - Create a one-time callable function (safer):
Add to `functions/src/index.ts`:
```typescript
export { updateAISettings } from './migration-scripts/update-ai-settings';
```

Then deploy and call via frontend or Postman.

### 6. Verify Settings in Firestore

Check `settings/ai` document contains:
```json
{
  "features": {
    "transcription": {
      "model": "gemini-3-flash",
      "temperature": 0.3,
      "topP": 0.95,
      "topK": 40,
      "maxOutputTokens": 128000
    },
    "storyGeneration": {
      "model": "gemini-3-flash",
      "temperature": 0.8,
      "topP": 0.95,
      "topK": 40,
      "maxOutputTokens": 32000
    },
    "podcastScript": {
      "model": "gemini-3-flash",
      "temperature": 0.9,
      "topP": 0.95,
      "topK": 40,
      "maxOutputTokens": 8192
    }
  }
}
```

### 7. Deploy Frontend

```bash
firebase deploy --only hosting
```

### 8. Test End-to-End

1. Upload a test audio file (<5 minutes recommended for first test)
2. Verify progress updates appear in real-time
3. Check all stages complete:
   - Loading context (0-5%)
   - Transcribing (5-40%)
   - Generating story (40-60%)
   - Generating script (60-75%)
   - Generating audio (75-90%)
   - Uploading (90-100%)
4. Verify final podcast is available

### 9. Monitor Logs

```bash
firebase functions:log --only processAudioSession
```

Watch for:
- Progress updates at each stage
- Model usage logs
- Token usage
- Any errors or warnings

## Architecture

### Fire-and-Forget Pattern

```
User Upload → Cloud Storage → processAudioSession() → Return Immediately
                                       ↓
                    Background: Process all stages
                                       ↓
                    Firestore updates (progress tracking)
                                       ↓
Frontend ← onSnapshot listener ← Real-time progress
```

### Progress Stages

| Status | Progress | Description |
|--------|----------|-------------|
| `loading_context` | 0-5% | Load AI settings and Kanka context |
| `transcribing` | 5-40% | Transcribe audio (with chunking if >30 min) |
| `transcription_complete` | 40% | Checkpoint - transcription saved |
| `generating_story` | 40-60% | Generate story from transcript |
| `story_complete` | 60% | Checkpoint - story saved |
| `generating_script` | 60-75% | Generate podcast script |
| `script_complete` | 75% | Checkpoint - script saved |
| `generating_audio` | 75-90% | Generate audio with ElevenLabs |
| `uploading` | 90-100% | Upload to Cloud Storage |
| `completed` | 100% | All done! |

### Error Recovery

Each checkpoint preserves progress:
- If transcription fails → Retry from transcription
- If story fails → Transcription preserved, retry story
- If script fails → Story preserved, retry script
- If audio fails → Script preserved, retry audio

## Feature-Specific AI Parameters

The implementation uses different AI parameters for each task:

### Transcription (Accuracy)
- **Temperature**: 0.3 (low for accuracy)
- **Model**: gemini-3-flash
- **Max Tokens**: 128000
- **Purpose**: Precise speech-to-text

### Story Generation (Creativity)
- **Temperature**: 0.8 (medium-high for narrative)
- **Model**: gemini-3-flash
- **Max Tokens**: 32000
- **Purpose**: Engaging story recap

### Podcast Script (Conversational)
- **Temperature**: 0.9 (high for natural dialogue)
- **Model**: gemini-3-flash
- **Max Tokens**: 8192
- **Purpose**: Natural podcast conversation

## Security Improvements

✅ Google AI API key removed from frontend
✅ All AI operations happen in secure backend
✅ User authentication enforced
✅ Campaign membership verified
✅ Session ownership checked

## Performance Considerations

- **Chunking**: Audio >30 minutes automatically split
- **Memory**: 2GB allocated to Cloud Function
- **Timeout**: 15 minutes max execution time
- **Parallel Processing**: Chunks processed sequentially but efficiently
- **Storage**: Temporary files cleaned up automatically

## Known Limitations

1. **Max Audio Length**: ~60 minutes (due to 15-minute Cloud Function timeout)
2. **ElevenLabs Limit**: Script must be ≤5000 characters
3. **Concurrent Uploads**: Users should wait for completion before starting new upload
4. **Model Availability**: Requires Gemini 2.5 Flash access

## Troubleshooting

### Function Times Out
- Check audio file length
- Verify ffmpeg is working (check logs for "Audio duration: X")
- Consider increasing timeout or optimizing chunking

### Transcription Quality Poor
- Verify Kanka context is being loaded correctly
- Check audio quality (clear speech, minimal background noise)
- Adjust transcription temperature if needed

### Podcast Generation Fails
- Check story length (may be too long for script)
- Verify ElevenLabs API key is set
- Check ElevenLabs quota

### Progress Not Updating
- Verify Firestore onSnapshot listener is active
- Check browser console for errors
- Verify session document permissions

## Testing Checklist

- [ ] Short audio (<5 min) - Complete pipeline
- [ ] Medium audio (10-20 min) - Verify no chunking
- [ ] Long audio (45-60 min) - Verify chunking works
- [ ] Kanka enabled - Context used correctly
- [ ] Kanka disabled - Works without context
- [ ] User corrections - Applied to story
- [ ] Page refresh during processing - Progress preserved
- [ ] Network interruption - Can resume
- [ ] Multiple sessions - No interference
- [ ] Concurrent users - Isolated processing

## Rollback Plan

If issues occur:

1. **Revert Frontend**:
   ```bash
   git revert <commit-hash>
   firebase deploy --only hosting
   ```

2. **Disable New Function**:
   - Function can remain deployed but unused
   - Frontend will continue using old `startProcessing()` method

3. **Keep Old Code**: The old processing methods are still present in the component (marked as LEGACY) for easy rollback

## Frontend Cleanup Status

### ✅ Removed
- Old `startProcessing()` method - replaced by `startCompleteProcessing()`
- Direct transcription/story generation flow - now handled by backend

### 🔄 Still in Frontend (for good reason)
These services remain because they support separate user actions:

1. **AudioTranscriptionService**
   - Used by "Retranscribe" button
   - Allows users to retranscribe an existing audio file
   - Still needs Google AI API key in frontend

2. **SessionStoryService**
   - Used by "Regenerate Story" button
   - Allows users to regenerate story from existing transcript
   - Still needs Google AI API key in frontend

3. **AudioStorageService**
   - File validation before upload
   - Storage metadata management
   - No API keys needed

### 📝 Architecture After Cleanup

**New Upload Flow** (Backend):
```
User → Upload → startCompleteProcessing() → Backend Cloud Function
                                           → Transcribe + Story + Podcast
                                           → Real-time progress updates
```

**Regenerate Features** (Frontend - separate actions):
```
User clicks "Regenerate Story" → sessionStoryService → Google AI
User clicks "Retranscribe" → audioTranscriptionService → Google AI
User clicks "Generate Podcast" → podcastAudioService → Backend Cloud Function
```

### 🎯 Complete Migration (Future)

To fully remove Google AI API key from frontend:
1. Create backend endpoints for:
   - `regenerateStory` Cloud Function
   - `retranscribeAudio` Cloud Function
2. Update component to call these instead of frontend services
3. Remove `audioTranscriptionService` and `sessionStoryService`
4. Remove `@google/genai` from frontend `package.json`
5. Remove Google AI API key from frontend environment

Estimated effort: 2-3 days

## Next Steps (Future Enhancements)

1. **Complete Backend Migration**: Move regenerate/retranscribe to backend (see above)
2. **Add Retry Logic**: Automatic retry for transient failures
3. **Queue System**: Handle multiple uploads from same user
4. **Progress Persistence**: Store progress in Firestore for resumption after failures
5. **Analytics**: Track processing times, model usage, costs
6. **Optimization**: Parallel chunking where possible

## Support

For issues or questions:
1. Check Firebase Functions logs
2. Review Firestore `audioSessions` document for error messages
3. Test with short audio first to isolate issues
4. Verify all secrets are set correctly
