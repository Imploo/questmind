# Ticket 35: Backend Audio Transcription and Story Generation with Configurable AI Parameters

## Overview

Move audio transcription and story generation from frontend to backend Cloud Functions to create a unified, secure, and resilient architecture. This enables users to start AI processing and leave the site or continue browsing while receiving real-time progress updates via Firestore. Additionally, implement configurable AI parameters (temperature, topK, topP) for each AI feature: transcription, story generation, and podcast script generation.

## Current State

**Current Implementation**:

1. **Audio Transcription** (Frontend):
   - Transcription happens in `audio-transcription.service.ts` on the client side
   - Uses Google AI SDK directly in the browser
   - API key stored in frontend environment file
   - User must wait for transcription to complete
   - If user navigates away or refreshes, transcription progress is lost

2. **Story Generation** (Frontend):
   - Story generation happens in frontend using Google AI SDK
   - Uses `@google/genai` SDK directly in the browser
   - API key exposed in frontend environment
   - User must wait for story generation to complete
   - If user navigates away or refreshes, generation is lost

3. **Podcast Script Generation** (Backend):
   - Already moved to backend (Ticket 34)
   - Uses fire-and-forget pattern
   - Progress tracking via Firestore
   - Real-time updates via `onSnapshot`
   - User can leave/refresh and still see progress

**Current Workflow**:
```
Frontend → Transcribe Audio (wait) → Generate Story (wait) → Generate Podcast (backend)
                ↑                           ↑                        ↓
                └── User must wait here     └── User must wait   Firestore (progress updates)
```

**Files Involved**:
- `src/app/audio/audio-transcription.service.ts` - Frontend transcription
- `src/app/audio/audio-session.component.ts` - Component coordinating all processes
- `src/app/prompts/audio-transcription.prompt.ts` - Transcription prompt
- `src/app/prompts/story-generator.prompt.ts` - Story generation prompt
- `functions/src/generate-podcast-audio.ts` - Backend podcast generation (already fire-and-forget)

**Current Configuration**:
- Google AI API key in frontend environment file (exposed to client)
- Model selection in frontend environment
- No configurable AI parameters (temperature, topK, topP)
- Hardcoded parameters in code

**Limitations**:
1. **Security**: API key exposed in frontend code (visible in browser)
2. **User Experience**: User must wait through multiple long-running operations sequentially
3. **Fragmented Process**: Transcription, story, and podcast are separate sequential steps
4. **Lost Progress**: If user refreshes during transcription or story generation, progress is lost
5. **No Progress Visibility**: User sees loading spinner but no detailed progress for transcription/story
6. **No Parameter Customization**: Cannot adjust AI parameters (temperature, topK, topP) per feature
7. **Hardcoded Configuration**: AI parameters require code changes to adjust

## Problem Statement

The current multi-step audio processing workflow creates several issues:

1. **Poor User Experience**: Users must wait through three separate long-running operations
2. **Security Concern**: Google AI API key is exposed in frontend bundle
3. **Lost Progress**: Transcription and story generation aren't resilient to page refresh
4. **Lack of Flexibility**: AI parameters (temperature, topK, topP) are hardcoded
5. **No Progress Updates**: Transcription and story show generic loading without detailed status
6. **Inconsistent Architecture**: Transcription/story (frontend) vs podcast (backend fire-and-forget)
7. **Configuration Management**: No centralized settings for AI parameters per feature

**Opportunity**:
- Move transcription and story generation to backend alongside podcast generation
- Create unified fire-and-forget endpoint for complete audio-to-podcast pipeline
- Implement progress tracking for all stages
- Store AI parameters in Firestore for runtime flexibility per feature
- Allow customization of temperature, topK, topP for each AI operation

## Proposed Solution

Migrate transcription and story generation to backend and unify with podcast generation into a single fire-and-forget endpoint with comprehensive progress tracking and feature-specific AI parameter configuration.

### New Workflow

```
Frontend → Cloud Function (immediate return) → Background: [Transcribe → Generate Story → Generate Script → Generate Audio → Upload] → Firestore
                                                                ↓           ↓              ↓                ↓            ↓
Frontend ← Firestore onSnapshot (real-time progress) ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←┘
         (0% Upload → 10% Transcribe → 40% Story → 60% Script → 80% Audio → 95% Upload → 100% Ready)
```

### Key Changes

1. **Extend Settings Collection in Firestore**:
   - Add feature-specific AI parameters
   - Configure temperature, topK, topP for:
     - Transcription
     - Story Generation
     - Podcast Script Generation
   - Allow per-feature model selection
   - Support runtime parameter tuning without code deployment

2. **Create New Cloud Function: `processAudioSession`**:
   - Handle complete audio-to-podcast pipeline
   - Upload audio file to Cloud Storage from frontend
   - Transcribe audio using Google AI
   - Generate story from transcription
   - Generate podcast script from story
   - Generate audio from script using ElevenLabs
   - Maintain fire-and-forget pattern with immediate return
   - Progress tracking through all stages

3. **Unified Progress Tracking**:
   - **0-5%**: Upload audio file to Cloud Storage
   - **5-10%**: Validation and preparation
   - **10-40%**: Audio transcription with Google AI
   - **40-60%**: Story generation from transcription
   - **60-70%**: Podcast script generation
   - **70-90%**: Audio generation with ElevenLabs
   - **90-100%**: Upload and finalization

4. **Feature-Specific AI Parameters**:
   - Settings collection structure:
     ```typescript
     settings/ai {
       features: {
         transcription: {
           model: "gemini-3-flash",
           temperature: 0.3,  // Low for accuracy
           topP: 0.95,
           topK: 40,
           maxOutputTokens: 8192
         },
         storyGeneration: {
           model: "gemini-3-flash",
           temperature: 0.8,  // Higher for creativity
           topP: 0.95,
           topK: 40,
           maxOutputTokens: 8192
         },
         podcastScript: {
           model: "gemini-3-flash",
           temperature: 0.9,  // Highest for conversational tone
           topP: 0.95,
           topK: 40,
           maxOutputTokens: 8192
         }
       }
     }
     ```

5. **Frontend Simplification**:
   - Single method: `startCompleteAudioProcessing(audioFile)`
   - Upload audio file to Cloud Storage
   - Call Cloud Function with audio URL
   - Listen to progress via `onSnapshot`
   - Remove Google AI SDK from frontend dependencies

## Technical Implementation

### Phase 1: Extend Settings Collection

**Update Firestore AI Settings Structure** (`settings/ai`):

```typescript
interface AIFeatureSettings {
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
}

interface AISettings {
  defaultModel: string;
  availableModels: string[];
  features: {
    transcription: AIFeatureSettings;
    storyGeneration: AIFeatureSettings;
    podcastScript: AIFeatureSettings;
  };
  apiProvider: 'google' | 'openai' | 'anthropic';
  createdAt: Date;
  updatedAt: Date;
}

// Updated settings document
{
  defaultModel: "gemini-3-flash",
  availableModels: [
    "gemini-3-flash",
    "gemini-2.5-pro",
    "gemini-1.5-pro",
    "gemini-1.5-flash"
  ],
  features: {
    transcription: {
      model: "gemini-3-flash",
      temperature: 0.3,  // Low temperature for accurate transcription
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192
    },
    storyGeneration: {
      model: "gemini-3-flash",
      temperature: 0.8,  // Medium-high for creative story generation
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192
    },
    podcastScript: {
      model: "gemini-3-flash",
      temperature: 0.9,  // High for natural conversational dialogue
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192
    }
  },
  apiProvider: "google",
  createdAt: new Date(),
  updatedAt: new Date()
}
```

**Migration Script** (`functions/src/migration-scripts/update-ai-settings.ts`):

```typescript
import { getFirestore } from 'firebase-admin/firestore';

export async function updateAISettingsWithFeatures() {
  const db = getFirestore();
  const settingsRef = db.doc('settings/ai');

  const updatedSettings = {
    defaultModel: "gemini-3-flash",
    availableModels: [
      "gemini-3-flash",
      "gemini-2.5-pro",
      "gemini-1.5-pro",
      "gemini-1.5-flash"
    ],
    features: {
      transcription: {
        model: "gemini-3-flash",
        temperature: 0.3,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192
      },
      storyGeneration: {
        model: "gemini-3-flash",
        temperature: 0.8,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192
      },
      podcastScript: {
        model: "gemini-3-flash",
        temperature: 0.9,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192
      }
    },
    apiProvider: "google",
    updatedAt: new Date()
  };

  await settingsRef.set(updatedSettings, { merge: true });
  console.log('AI settings updated with feature-specific parameters');
}
```

### Phase 2: Update Data Model

**Update AudioSessionRecord interface** (`audio-session.models.ts`):

```typescript
interface AudioSessionRecord {
  // Existing fields...

  // Enhanced processing status
  processingStatus:
    | 'idle'
    | 'uploading_audio'
    | 'transcribing'
    | 'transcription_complete'
    | 'generating_story'
    | 'story_complete'
    | 'generating_podcast'
    | 'podcast_complete'
    | 'failed';

  processingProgress: number; // 0-100
  processingMessage: string;
  processingError?: string;

  // Track which models were used
  modelsUsed?: {
    transcription?: string;
    storyGeneration?: string;
    podcastScript?: string;
  };

  // Audio file info
  audioFileUrl?: string;
  audioFileSize?: number;
  audioFileUploadedAt?: Date;
}
```

**Progress Stages**:
- `idle` (0%): Initial state
- `uploading_audio` (0-5%): Uploading audio file to Cloud Storage
- `transcribing` (5-40%): Transcribing audio with Google AI
- `transcription_complete` (40%): Transcription ready
- `generating_story` (40-60%): Generating story from transcription
- `story_complete` (60%): Story ready
- `generating_podcast` (60-100%): Podcast script + audio generation
- `podcast_complete` (100%): Everything complete
- `failed` (0%): Error occurred

### Phase 3: Create New Backend Function

**New File: `functions/src/process-audio-session.ts`**

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { GoogleGenAI } from '@google/genai';
import { AUDIO_TRANSCRIPTION_PROMPT } from './prompts/audio-transcription.prompt';
import { STORY_GENERATOR_PROMPT } from './prompts/story-generator.prompt';
import { PODCAST_SCRIPT_GENERATOR_PROMPT } from './prompts/podcast-script-generator.prompt';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

interface ProcessAudioRequest {
  campaignId: string;
  sessionId: string;
  audioFileUrl: string;  // URL to audio file in Cloud Storage
}

interface AISettings {
  features: {
    transcription: AIFeatureSettings;
    storyGeneration: AIFeatureSettings;
    podcastScript: AIFeatureSettings;
  };
}

interface AIFeatureSettings {
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
}

// Helper to update progress
async function updateProgress(
  sessionRef: FirebaseFirestore.DocumentReference,
  status: string,
  progress: number,
  message: string,
  additionalData: any = {}
) {
  await sessionRef.update({
    processingStatus: status,
    processingProgress: progress,
    processingMessage: message,
    ...additionalData,
    updatedAt: FieldValue.serverTimestamp()
  });
}

export const processAudioSession = onCall(
  {
    cors: [
      'https://questmind.nl',
      'http://localhost:4200',
      /^https:\/\/.*\.web\.app$/,
      /^https:\/\/.*\.firebaseapp\.com$/
    ],
    secrets: ['GOOGLE_AI_API_KEY', 'ELEVENLABS_API_KEY'],
    timeoutSeconds: 900,  // 15 minutes for complete processing
    memory: '2GiB'  // More memory for audio processing
  },
  async (request) => {
    const { auth, data } = request;

    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { campaignId, sessionId, audioFileUrl } = data as ProcessAudioRequest;

    // Validation
    if (!campaignId || typeof campaignId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing campaignId.');
    }
    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing sessionId.');
    }
    if (!audioFileUrl || typeof audioFileUrl !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing audioFileUrl.');
    }

    const googleAiKey = process.env.GOOGLE_AI_API_KEY;
    const elevenlabsKey = process.env.ELEVENLABS_API_KEY;

    if (!googleAiKey || !elevenlabsKey) {
      throw new HttpsError('failed-precondition', 'API keys not configured.');
    }

    const db = getFirestore();
    const campaignRef = db.doc(`campaigns/${campaignId}`);
    const campaignSnap = await campaignRef.get();

    if (!campaignSnap.exists) {
      throw new HttpsError('not-found', 'Campaign not found.');
    }

    const campaignData = campaignSnap.data() || {};
    if (!campaignData.members || !campaignData.members[auth.uid]) {
      throw new HttpsError('permission-denied', 'User is not a campaign member.');
    }

    const sessionRef = db.doc(`campaigns/${campaignId}/audioSessions/${sessionId}`);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      throw new HttpsError('not-found', 'Session not found.');
    }

    const sessionData = sessionSnap.data() || {};
    if (sessionData.ownerId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Only session owner can process audio.');
    }

    // Initialize processing status
    await sessionRef.update({
      processingStatus: 'uploading_audio',
      processingProgress: 0,
      processingMessage: 'Starting audio processing...',
      audioFileUrl,
      updatedAt: FieldValue.serverTimestamp()
    });

    // RETURN IMMEDIATELY - Processing continues in background
    processAudioInBackground(
      campaignId,
      sessionId,
      audioFileUrl,
      sessionRef,
      auth.uid
    ).catch(error => {
      console.error('Background audio processing failed:', error);
    });

    return {
      success: true,
      message: 'Audio processing started'
    };
  }
);

// Background processing function
async function processAudioInBackground(
  campaignId: string,
  sessionId: string,
  audioFileUrl: string,
  sessionRef: FirebaseFirestore.DocumentReference,
  userId: string
) {
  const googleAiKey = process.env.GOOGLE_AI_API_KEY;
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY;

  if (!googleAiKey || !elevenlabsKey) {
    await updateProgress(sessionRef, 'failed', 0, 'API keys not configured', {
      processingError: 'Required API keys are not configured'
    });
    return;
  }

  const db = getFirestore();
  const googleAi = new GoogleGenAI({ apiKey: googleAiKey });

  try {
    // STEP 1: Load AI Settings
    await updateProgress(sessionRef, 'transcribing', 5, 'Loading AI settings...');

    const settingsSnap = await db.doc('settings/ai').get();
    const settings = settingsSnap.data() as AISettings | undefined;

    if (!settings?.features) {
      throw new Error('AI feature settings not configured');
    }

    const transcriptionConfig = settings.features.transcription;
    const storyConfig = settings.features.storyGeneration;
    const podcastConfig = settings.features.podcastScript;

    console.log('Using models:', {
      transcription: transcriptionConfig.model,
      story: storyConfig.model,
      podcast: podcastConfig.model
    });

    // STEP 2: Transcribe Audio
    await updateProgress(sessionRef, 'transcribing', 10, 'Transcribing audio...');

    // Download audio file from Cloud Storage
    const storage = getStorage();
    const bucket = storage.bucket();
    const audioFile = bucket.file(audioFileUrl);
    const [audioBuffer] = await audioFile.download();

    // Transcribe with Google AI
    const transcriptionResponse = await googleAi.models.generateContent({
      model: transcriptionConfig.model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: AUDIO_TRANSCRIPTION_PROMPT },
            {
              inlineData: {
                mimeType: 'audio/webm',
                data: audioBuffer.toString('base64')
              }
            }
          ]
        }
      ],
      config: {
        temperature: transcriptionConfig.temperature,
        topP: transcriptionConfig.topP,
        topK: transcriptionConfig.topK,
        maxOutputTokens: transcriptionConfig.maxOutputTokens
      }
    });

    const transcription = transcriptionResponse.text;

    if (!transcription) {
      throw new Error('No transcription generated');
    }

    await updateProgress(
      sessionRef,
      'transcription_complete',
      40,
      'Transcription complete',
      {
        transcription,
        transcriptionCompletedAt: new Date(),
        'modelsUsed.transcription': transcriptionConfig.model
      }
    );

    console.log(`Transcription complete: ${transcription.length} characters`);

    // STEP 3: Generate Story
    await updateProgress(sessionRef, 'generating_story', 45, 'Generating story...');

    const storyPrompt = `${STORY_GENERATOR_PROMPT}\n\nTRANSCRIPTION:\n${transcription}`;

    const storyResponse = await googleAi.models.generateContent({
      model: storyConfig.model,
      contents: [
        {
          role: 'user',
          parts: [{ text: storyPrompt }]
        }
      ],
      config: {
        temperature: storyConfig.temperature,
        topP: storyConfig.topP,
        topK: storyConfig.topK,
        maxOutputTokens: storyConfig.maxOutputTokens
      }
    });

    const story = storyResponse.text;

    if (!story) {
      throw new Error('No story generated');
    }

    await updateProgress(
      sessionRef,
      'story_complete',
      60,
      'Story generation complete',
      {
        generatedStory: story,
        storyGeneratedAt: new Date(),
        storyRegenerationCount: 1,
        'modelsUsed.storyGeneration': storyConfig.model
      }
    );

    console.log(`Story generated: ${story.length} characters`);

    // STEP 4: Generate Podcast (Script + Audio)
    await updateProgress(sessionRef, 'generating_podcast', 65, 'Generating podcast...');

    // Generate podcast script
    const sessionData = await sessionRef.get();
    const sessionTitle = sessionData.get('title') || 'Untitled Session';
    const sessionDate = sessionData.get('date');

    const scriptPrompt = `${PODCAST_SCRIPT_GENERATOR_PROMPT}\n\nSESSION TITLE: ${sessionTitle}\nSESSION DATE: ${
      sessionDate || 'Unknown'
    }\n\nSESSION STORY:\n${story}`;

    const scriptResponse = await googleAi.models.generateContent({
      model: podcastConfig.model,
      contents: [
        {
          role: 'user',
          parts: [{ text: scriptPrompt }]
        }
      ],
      config: {
        temperature: podcastConfig.temperature,
        topP: podcastConfig.topP,
        topK: podcastConfig.topK,
        maxOutputTokens: podcastConfig.maxOutputTokens
      }
    });

    const scriptText = scriptResponse.text;

    if (!scriptText) {
      throw new Error('No script generated');
    }

    const script = parseScriptResponse(scriptText);

    await updateProgress(
      sessionRef,
      'generating_podcast',
      75,
      'Podcast script complete, generating audio...',
      {
        'modelsUsed.podcastScript': podcastConfig.model
      }
    );

    // Generate audio with ElevenLabs
    const elevenlabs = new ElevenLabsClient({ apiKey: elevenlabsKey });

    const HOST_VOICES = {
      host1: process.env.ELEVENLABS_HOST1_VOICE || 'tvFp0BgJPrEXGoDhDIA4',
      host2: process.env.ELEVENLABS_HOST2_VOICE || '7qdUFMklKPaaAVMsBTBt'
    };

    const dialogueInputs = script.segments.map((seg: any) => ({
      text: seg.text,
      voiceId: HOST_VOICES[seg.speaker as 'host1' | 'host2'] || HOST_VOICES.host1
    }));

    await updateProgress(sessionRef, 'generating_podcast', 80, 'Generating podcast audio...');

    const audioStream = await elevenlabs.textToDialogue.convert({
      inputs: dialogueInputs
    });

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    const { Readable } = await import('stream');
    const readable = Readable.from(audioStream as any);

    for await (const chunk of readable) {
      chunks.push(Buffer.from(chunk));
    }

    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      throw new Error('Empty audio buffer');
    }

    // STEP 5: Upload podcast to Cloud Storage
    await updateProgress(sessionRef, 'generating_podcast', 90, 'Uploading podcast...');

    const version = 1;  // For now, assume version 1
    const storagePath = `campaigns/${campaignId}/podcasts/${sessionId}/v${version}.mp3`;

    const bucket = storage.bucket();
    const file = bucket.file(storagePath);

    await file.save(audioBuffer, {
      contentType: 'audio/mpeg',
      metadata: {
        metadata: {
          sessionId,
          campaignId,
          version: version.toString(),
          userId
        }
      }
    });

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '03-01-2500'
    });

    // STEP 6: Mark as complete
    await updateProgress(
      sessionRef,
      'podcast_complete',
      100,
      'All processing complete!',
      {
        podcasts: [
          {
            version: 1,
            createdAt: new Date(),
            scriptGeneratedAt: new Date(),
            audioGeneratedAt: new Date(),
            audioUrl: url,
            script,
            duration: script.estimatedDuration,
            status: 'completed',
            progress: 100
          }
        ],
        latestPodcastVersion: 1,
        processingError: null
      }
    );

    console.log('Complete audio processing finished');

  } catch (error: any) {
    console.error('Error processing audio:', error);

    await updateProgress(
      sessionRef,
      'failed',
      0,
      'Processing failed',
      {
        processingError: error?.message || 'Unknown error'
      }
    );
  }
}

function parseScriptResponse(text: string): any {
  const segments: any[] = [];
  const lines = text.split('\n').filter(line => line.trim());

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('HOST1:')) {
      segments.push({
        speaker: 'host1',
        text: trimmedLine.replace('HOST1:', '').trim()
      });
    } else if (trimmedLine.startsWith('HOST2:')) {
      segments.push({
        speaker: 'host2',
        text: trimmedLine.replace('HOST2:', '').trim()
      });
    }
  }

  const totalWords = segments.reduce((sum, seg) => sum + seg.text.split(/\s+/).length, 0);
  const estimatedDuration = Math.ceil((totalWords / 150) * 60);

  return { segments, estimatedDuration };
}
```

### Phase 4: Update Frontend Service

**Create new unified service: `audio-processing.service.ts`**:

```typescript
import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Firestore, doc, onSnapshot } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class AudioProcessingService {
  private functions = inject(Functions);
  private storage = inject(Storage);
  private firestore = inject(Firestore);

  /**
   * Upload audio file and start complete processing pipeline
   * Returns immediately, use listenToProgress() to monitor
   */
  async startCompleteProcessing(
    campaignId: string,
    sessionId: string,
    audioFile: File
  ): Promise<void> {
    // 1. Upload audio file to Cloud Storage
    const storagePath = `campaigns/${campaignId}/audio/${sessionId}/${Date.now()}.webm`;
    const storageRef = ref(this.storage, storagePath);

    await uploadBytes(storageRef, audioFile);
    const audioFileUrl = await getDownloadURL(storageRef);

    // 2. Call Cloud Function (fire-and-forget)
    const processAudio = httpsCallable(this.functions, 'processAudioSession');

    await processAudio({
      campaignId,
      sessionId,
      audioFileUrl
    });
  }

  /**
   * Listen to processing progress in real-time
   */
  listenToProgress(
    campaignId: string,
    sessionId: string
  ): {
    progress: { status: string; progress: number; message: string };
    unsubscribe: () => void;
  } {
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    const progress = {
      status: 'idle',
      progress: 0,
      message: 'Not started'
    };

    const unsubscribe = onSnapshot(sessionRef, (snapshot) => {
      const data = snapshot.data();
      if (data) {
        progress.status = data.processingStatus || 'idle';
        progress.progress = data.processingProgress || 0;
        progress.message = data.processingMessage || 'Processing...';
      }
    });

    return { progress, unsubscribe };
  }
}
```

### Phase 5: Update Component

**Update `audio-session.component.ts`**:

```typescript
// OLD: Multiple separate steps
async transcribeAudio() {
  // Wait for transcription
  await this.audioTranscriptionService.transcribe(...);
}

async generateStory() {
  // Wait for story
  await this.storyService.generateStory(...);
}

async generatePodcast() {
  // Fire-and-forget for podcast only
  await this.podcastService.generate(...);
}

// NEW: Single fire-and-forget call
async startCompleteProcessing() {
  if (!this.audioRecording()) return;

  try {
    // 1. Start listening to progress BEFORE starting processing
    const { progress, unsubscribe } = this.audioProcessingService.listenToProgress(
      this.campaignId()!,
      this.sessionId()!
    );

    this.progressUnsubscribe = unsubscribe;
    this.processingProgress.set(progress);

    // 2. Start complete processing (fire-and-forget)
    await this.audioProcessingService.startCompleteProcessing(
      this.campaignId()!,
      this.sessionId()!,
      this.audioRecording()!
    );

    console.log('Complete audio processing started');

  } catch (error) {
    console.error('Failed to start processing:', error);
    this.errorMessage.set('Failed to start audio processing');
    this.cleanupProgressListener();
  }
}
```

## Implementation Steps

### Step 1: Extend Settings Collection
- [ ] Update AI settings interface with feature-specific parameters
- [ ] Write migration script to add feature configs
- [ ] Set default parameters for transcription (low temp)
- [ ] Set default parameters for story generation (medium-high temp)
- [ ] Set default parameters for podcast script (high temp)
- [ ] Run migration to update settings document
- [ ] Test reading feature-specific settings from Firestore

### Step 2: Create Backend Function
- [ ] Create new Cloud Function `processAudioSession`
- [ ] Add audio file upload handling
- [ ] Implement transcription step with configurable params
- [ ] Implement story generation step with configurable params
- [ ] Integrate podcast script/audio generation
- [ ] Add comprehensive progress tracking
- [ ] Implement error handling for each stage
- [ ] Test with Cloud Functions emulator

### Step 3: Update Data Model
- [ ] Add processing status fields to AudioSessionRecord
- [ ] Add modelsUsed tracking object
- [ ] Add audio file metadata fields
- [ ] Update progress tracking fields
- [ ] Update TypeScript interfaces in frontend

### Step 4: Create Frontend Service
- [ ] Create new `audio-processing.service.ts`
- [ ] Implement audio file upload to Cloud Storage
- [ ] Implement Cloud Function call
- [ ] Implement progress listener
- [ ] Remove `@google/genai` dependency from frontend
- [ ] Test service integration

### Step 5: Update Component
- [ ] Replace separate transcribe/story/podcast methods
- [ ] Implement single `startCompleteProcessing()` method
- [ ] Update progress tracking UI
- [ ] Remove old service dependencies
- [ ] Update error handling
- [ ] Test component integration

### Step 6: Update UI
- [ ] Update progress bar for new stages (0-5-10-40-60-70-90-100%)
- [ ] Add stage-specific messages
- [ ] Show transcription preview when ready
- [ ] Show story preview when ready
- [ ] Show podcast preview when ready
- [ ] Update loading states
- [ ] Test progress display with all stages

### Step 7: Configuration
- [ ] Verify `GOOGLE_AI_API_KEY` is set as Firebase secret
- [ ] Verify `ELEVENLABS_API_KEY` is configured
- [ ] Run settings migration
- [ ] Update Firestore security rules
- [ ] Test Cloud Function can access secrets

### Step 8: Testing
- [ ] Test complete pipeline end-to-end
- [ ] Test settings loading for each feature
- [ ] Test parameter customization per feature
- [ ] Test progress updates at each stage
- [ ] Test page refresh during processing
- [ ] Test error handling at each stage
- [ ] Test concurrent processing
- [ ] Verify API key security
- [ ] Test cleanup of listeners

### Step 9: Deployment
- [ ] Deploy updated Cloud Function
- [ ] Deploy frontend changes
- [ ] Monitor for errors
- [ ] Verify processing times
- [ ] Collect user feedback

### Step 10: Cleanup
- [ ] Remove `audio-transcription.service.ts`
- [ ] Remove old story generation service
- [ ] Remove `@google/genai` from frontend package.json
- [ ] Remove Google AI API key from frontend environment
- [ ] Update documentation
- [ ] Archive old code

## Benefits

### Security
1. ✅ **API Key Protection**: Google AI API key no longer exposed in frontend
2. ✅ **Backend-Only Access**: All AI operations happen server-side

### User Experience
3. ✅ **Single Action**: One button click processes complete audio-to-podcast pipeline
4. ✅ **Real-Time Progress**: Detailed progress through all stages
5. ✅ **Resilient**: Page refresh doesn't lose progress
6. ✅ **Non-Blocking**: User can browse or leave site during processing
7. ✅ **Better Feedback**: Clear messages at each stage

### Architecture
8. ✅ **Unified Pattern**: All AI operations use fire-and-forget approach
9. ✅ **Simplified Frontend**: Remove AI SDK and complex logic
10. ✅ **Feature-Specific Configuration**: Tune AI parameters per feature
11. ✅ **Runtime Flexibility**: Change parameters without redeployment
12. ✅ **Better Separation**: AI logic in backend, UI logic in frontend

### AI Quality
13. ✅ **Optimized Parameters**: Different temperature/topK/topP per feature
14. ✅ **Transcription Accuracy**: Low temperature for accurate transcription
15. ✅ **Story Creativity**: Higher temperature for creative story generation
16. ✅ **Podcast Naturalness**: Highest temperature for conversational dialogue

### Maintenance
17. ✅ **Centralized Settings**: All AI configs in Firestore
18. ✅ **Easy Tuning**: Update parameters via database
19. ✅ **A/B Testing**: Test different parameter combinations
20. ✅ **Future Extensibility**: Easy to add new AI features

## Considerations

### Migration Complexity
- **Risk**: Moving transcription and story generation is a significant change
- **Mitigation**: Test thoroughly with emulator, deploy incrementally

### Audio File Upload
- **Challenge**: Audio files can be large (10-100 MB)
- **Mitigation**: Use Cloud Storage for upload, stream processing

### Processing Time
- **Challenge**: Complete pipeline may take 5-10 minutes
- **Mitigation**: Fire-and-forget pattern with progress tracking

### API Rate Limits
- **Risk**: Multiple AI calls per session (transcribe + story + podcast)
- **Mitigation**: Monitor rate limits, implement queuing if needed

### Parameter Tuning
- **Challenge**: Finding optimal temperature/topK/topP per feature
- **Solution**: Start with reasonable defaults, allow user customization later

## Success Criteria

### Functionality
- [ ] Single endpoint processes complete audio-to-podcast pipeline
- [ ] Settings loaded from Firestore for each feature
- [ ] Feature-specific parameters work correctly
- [ ] Progress tracking works through all stages (0-100%)
- [ ] Transcription, story, and podcast previews available
- [ ] Page refresh preserves progress visibility
- [ ] Google AI API key not exposed in frontend

### Performance
- [ ] Function returns immediately (<1 second)
- [ ] Total processing time acceptable (<10 minutes)
- [ ] Parameter configuration improves AI output quality

### User Experience
- [ ] Single button starts complete processing
- [ ] Progress bar shows detailed stages
- [ ] User can navigate away and return
- [ ] Clear error messages for each stage

### Security
- [ ] API keys only in backend environment
- [ ] Settings collection properly secured
- [ ] Only campaign members can process audio
- [ ] API keys never logged or exposed

## Related Features

- **Ticket 34**: Backend Podcast Script Generation (provides pattern)
- **Ticket 19**: ElevenLabs Text-to-Dialogue Migration (audio generation)
- **Ticket 17**: Podcast MP3 Generation and Storage
- **Ticket 16**: Session Podcast Recap Generator
- **Ticket 7**: Audio Session Transcription (original implementation)

## Future Enhancements

1. **Admin Settings UI**: Web interface to tune AI parameters per feature
2. **User-Level Customization**: Let users adjust parameters
3. **A/B Testing**: Compare parameter combinations
4. **Quality Metrics**: Track output quality per parameter set
5. **Model Selection**: Different models per feature
6. **Cost Tracking**: Monitor per-feature AI costs
7. **Retry Logic**: Automatic retry on failures
8. **Batch Processing**: Process multiple sessions in parallel

## Estimated Scope

- **Complexity**: High (complete pipeline migration)
- **New Files**:
  - `functions/src/process-audio-session.ts` (new Cloud Function)
  - `functions/src/migration-scripts/update-ai-settings.ts`
  - `src/app/audio/audio-processing.service.ts` (unified service)
- **Modified Files**:
  - `src/app/audio/audio-session.component.ts`
  - `src/app/audio/audio-session.models.ts`
  - Firestore security rules
- **Removed Files**:
  - `src/app/audio/audio-transcription.service.ts`
  - Old story generation service
- **Dependencies**:
  - No new dependencies needed
  - Remove `@google/genai` from frontend
- **Risk**: High (major architectural change, complete pipeline refactor)

## Implementation Priority

**Priority**: High

**Rationale**:
- **Security**: API key exposure is critical security concern
- **UX**: Unified fire-and-forget pattern greatly improves experience
- **Consistency**: Aligns with podcast generation pattern (Ticket 34)
- **Quality**: Feature-specific parameters improve AI output
- **Architecture**: Creates consistent pattern for all AI operations

## Status

**Status**: Draft
**Priority**: High
**Created**: 2026-02-04
**Dependencies**:
  - Ticket 34 (Backend podcast script generation - provides pattern)
  - Ticket 19 (ElevenLabs text-to-dialogue - already implemented)
**Tech Stack**:
  - Google Gemini 3 Flash
  - Firebase Cloud Functions
  - Firebase Firestore (settings + progress tracking)
  - Firebase Cloud Storage (audio files)
  - ElevenLabs text-to-dialogue API

## Notes

- **Security First**: Primary driver is removing API key from frontend
- **Complete Pipeline**: Process entire audio-to-podcast flow in one call
- **Feature-Specific Parameters**: Key differentiator from Ticket 34
- **Temperature Tuning**:
  - Transcription: 0.3 (accuracy)
  - Story: 0.8 (creativity)
  - Podcast: 0.9 (conversational)
- **Builds on Ticket 34**: Uses same patterns and architecture
- **Audio Upload**: Frontend uploads to Cloud Storage first
- **Testing Strategy**: Emulator testing, then gradual rollout
- **Rollback Plan**: Keep old services temporarily for rollback
- **Cost Monitoring**: Track AI API costs during beta
- **Performance Baseline**: Document current processing times
