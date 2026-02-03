# Ticket 34: Backend Podcast Script Generation with Database-Driven Model Selection

## Overview

Move podcast script generation from frontend to backend Cloud Function to create a unified "fire-and-forget" podcast generation endpoint. This enables users to start the entire podcast creation process (script + audio) and leave the site or continue browsing while receiving real-time progress updates via Firestore. Additionally, migrate to using Gemini 3.0 Flash in the backend with model configuration stored in Firestore instead of environment variables.

## Current State

**Current Implementation**:

1. **Script Generation** (Frontend):
   - Script generation happens in `podcast-script.service.ts` on the client side
   - Uses `@google/genai` SDK directly in the browser
   - API key stored in frontend environment file (`environment.googleAiApiKey`)
   - Model selection from frontend environment (`environment.aiModel`)
   - User must wait for script generation to complete before audio generation starts
   - If user navigates away or refreshes, script generation is lost

2. **Audio Generation** (Backend):
   - Already uses fire-and-forget pattern (implemented in Ticket 19)
   - Progress tracking via Firestore
   - Real-time updates via `onSnapshot`
   - User can leave/refresh and still see progress

**Current Workflow**:
```
Frontend → Generate Script (wait) → Display Script → Click Generate Audio → Cloud Function (background) → Audio Ready
                ↑                                              ↓
                └── User must wait here                 Firestore (progress updates)
```

**Files Involved**:
- `src/app/audio/podcast-script.service.ts` - Frontend script generation
- `src/app/prompts/podcast-script-generator.prompt.ts` - Prompt template
- `functions/src/generate-podcast-audio.ts` - Backend audio generation (already fire-and-forget)
- `src/environments/environment.ts` - Frontend configuration (API key + model)

**Current Configuration**:
- Google AI API key in frontend environment file (exposed to client)
- Model selection in frontend environment (`aiModel`)
- Kanka integration for campaign context

**Limitations**:
1. **Security**: API key exposed in frontend code (visible in browser)
2. **User Experience**: User must wait for script to complete before proceeding
3. **Fragmented Process**: Script and audio are separate steps
4. **Lost Progress**: If user refreshes during script generation, progress is lost
5. **No Progress Visibility**: User sees loading spinner but no detailed progress
6. **Model Configuration**: Model selection hardcoded in environment, requires redeployment to change
7. **No Centralized Settings**: Model configuration not stored in database

## Problem Statement

The current two-step podcast generation process creates several issues:

1. **Poor User Experience**: Users must wait through two separate long-running operations
2. **Security Concern**: Google AI API key is exposed in frontend bundle
3. **Lost Progress**: Script generation isn't resilient to page refresh
4. **Lack of Flexibility**: Model selection requires code/environment changes and redeployment
5. **No Progress Updates**: Script generation shows generic loading without detailed status
6. **Inconsistent Architecture**: Script (frontend) vs audio (backend fire-and-forget) use different patterns
7. **Configuration Management**: AI model settings scattered across environment files instead of centralized

**Opportunity**:
- Move script generation to backend alongside audio generation
- Create unified fire-and-forget endpoint for complete podcast generation
- Implement progress tracking for script generation
- Store model configuration in Firestore for runtime flexibility
- Use Gemini 3 Flash for improved performance and cost efficiency

## Proposed Solution

Migrate script generation to backend and unify with audio generation into a single fire-and-forget endpoint with comprehensive progress tracking and database-driven model configuration.

### New Workflow

```
Frontend → Cloud Function (immediate return) → Background: [Generate Script → Generate Audio → Upload] → Firestore
                                                                     ↓            ↓           ↓
Frontend ← Firestore onSnapshot (real-time progress) ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←┘
         (0% Validating → 10% Script → 50% Audio → 80% Upload → 100% Ready)
```

### Key Changes

1. **Create Settings Collection in Firestore**:
   - Store AI model configuration at global level
   - Default to Gemini 3 Flash (`gemini-3-flash`)
   - Allow runtime model switching without code deployment
   - Support future model additions via database updates

2. **Extend Existing Cloud Function: `generatePodcastAudio`**:
   - Extend existing endpoint to handle both script and audio generation
   - Add script generation step before audio generation
   - Maintain fire-and-forget pattern with immediate return
   - Progress tracking through all stages
   - Securely use `GOOGLE_AI_API_KEY` environment variable (backend-only)

3. **Unified Progress Tracking**:
   - **0-10%**: Validation and campaign context loading
   - **10-50%**: Script generation with Gemini
   - **50-80%**: Audio generation with ElevenLabs text-to-dialogue
   - **80-95%**: Upload to Firebase Storage
   - **95-100%**: Finalization

4. **Backend Script Generation**:
   - Move `podcast-script.service.ts` logic to Cloud Function
   - Integrate Kanka context loading in backend
   - Use `@google/genai` SDK in Node.js environment
   - Store generated script in Firestore progress updates

5. **Database-Driven Model Configuration**:
   - Settings collection structure:
     ```typescript
     // Global settings
     settings/ai {
       defaultModel: "gemini-3-flash",
       availableModels: ["gemini-3-flash", "gemini-2.5-pro", "gemini-1.5-pro", "gemini-1.5-flash"],
       modelConfig: {
         "gemini-3-flash": {
           maxOutputTokens: 8192,
           temperature: 0.9,
           topP: 0.95,
           topK: 40
         }
       }
     }
     ```

6. **Frontend Simplification**:
   - Replace `podcast-script.service.ts` with unified `podcast-generation.service.ts`
   - Single method: `startCompletePodcastGeneration()`
   - Listen to progress via `onSnapshot`
   - Remove Google AI SDK from frontend dependencies

## Technical Implementation

### Phase 1: Create Settings Collection and Migration

**Create Firestore Settings Structure**:

1. **Global AI Settings Document** (`settings/ai`):
```typescript
interface AISettings {
  defaultModel: string;
  availableModels: string[];
  modelConfig: {
    [modelId: string]: {
      maxOutputTokens: number;
      temperature: number;
      topP: number;
      topK: number;
    };
  };
  apiProvider: 'google' | 'openai' | 'anthropic'; // Future extensibility
  createdAt: Date;
  updatedAt: Date;
}

// Initial settings document
{
  defaultModel: "gemini-3-flash",
  availableModels: [
    "gemini-3-flash",
    "gemini-2.5-pro",
    "gemini-1.5-pro",
    "gemini-1.5-flash"
  ],
  modelConfig: {
    "gemini-3-flash": {
      maxOutputTokens: 8192,
      temperature: 0.9,
      topP: 0.95,
      topK: 40
    },
    "gemini-2.5-pro": {
      maxOutputTokens: 8192,
      temperature: 0.9,
      topP: 0.95,
      topK: 40
    },
    "gemini-1.5-pro": {
      maxOutputTokens: 8192,
      temperature: 0.9,
      topP: 0.95,
      topK: 40
    },
    "gemini-1.5-flash": {
      maxOutputTokens: 8192,
      temperature: 0.9,
      topP: 0.95,
      topK: 40
    }
  },
  apiProvider: "google",
  createdAt: new Date(),
  updatedAt: new Date()
}
```

3. **Migration Script** (`functions/src/migration-scripts/create-ai-settings.ts`):
```typescript
import { getFirestore } from 'firebase-admin/firestore';

export async function createDefaultAISettings() {
  const db = getFirestore();
  const settingsRef = db.doc('settings/ai');

  const defaultSettings = {
    defaultModel: "gemini-3-flash",
    availableModels: [
      "gemini-2.0-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash"
    ],
    modelConfig: {
      "gemini-2.0-flash": {
        maxOutputTokens: 8192,
        temperature: 0.9,
        topP: 0.95,
        topK: 40
      },
      "gemini-1.5-pro": {
        maxOutputTokens: 8192,
        temperature: 0.9,
        topP: 0.95,
        topK: 40
      },
      "gemini-1.5-flash": {
        maxOutputTokens: 8192,
        temperature: 0.9,
        topP: 0.95,
        topK: 40
      }
    },
    apiProvider: "google",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await settingsRef.set(defaultSettings);
  console.log('AI settings initialized with Gemini 3 Flash as default');
}
```

**Firestore Security Rules** (`.firebaserc` or security rules file):
```javascript
// Settings collection rules
match /settings/{document} {
  // Only authenticated users can read settings
  allow read: if request.auth != null;

  // Only admins can write settings (implement admin check as needed)
  allow write: if request.auth != null &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

### Phase 2: Update Data Model for Complete Progress Tracking

**Update PodcastVersion interface** (`audio-session.models.ts`):

```typescript
interface PodcastVersion {
  version: number;
  createdAt: Date;
  scriptGeneratedAt?: Date;
  audioGeneratedAt?: Date;
  audioUrl?: string;
  duration?: number; // Optional until script is generated
  fileSize?: number;
  storyVersion?: number;
  script?: PodcastScript;

  // Enhanced progress tracking
  status:
    | 'pending'
    | 'loading_context'
    | 'generating_script'
    | 'script_complete'
    | 'generating_audio'
    | 'uploading'
    | 'completed'
    | 'failed';
  progress: number; // 0-100
  progressMessage: string;
  error?: string;

  // New: Model used for generation
  modelUsed?: string; // e.g., "gemini-2.0-flash"
}
```

**Progress Stages**:
- `pending` (0%): Initial state
- `loading_context` (0-10%): Loading Kanka context
- `generating_script` (10-50%): Generating script with Gemini
- `script_complete` (50%): Script ready, starting audio
- `generating_audio` (50-80%): Generating audio with ElevenLabs
- `uploading` (80-95%): Uploading to Firebase Storage
- `completed` (100%): Fully complete
- `failed` (0%): Error occurred

### Phase 3: Extend Existing Backend Function

**Update File: `functions/src/generate-podcast-audio.ts`**

Add script generation before audio generation:

```typescript
// Add imports at the top
import { GoogleGenAI } from '@google/genai';
import { PODCAST_SCRIPT_GENERATOR_PROMPT } from './prompts/podcast-script-generator.prompt';

// Update interface to accept story and session info
interface PodcastGenerationRequest {
  campaignId: string;
  sessionId: string;
  version: number;
  story: string;  // NEW: Story text for script generation
  sessionTitle: string;  // NEW: Session title
  sessionDate?: string;  // NEW: Optional session date
  script?: PodcastScript;  // OPTIONAL: Pre-generated script (for backward compatibility)
}

interface AISettings {
  defaultModel: string;
  modelConfig: {
    [key: string]: {
      maxOutputTokens: number;
      temperature: number;
      topP: number;
      topK: number;
    };
  };
}

const HOST_VOICES: Record<'host1' | 'host2', string> = {
  host1: process.env.ELEVENLABS_HOST1_VOICE || 'tvFp0BgJPrEXGoDhDIA4',
  host2: process.env.ELEVENLABS_HOST2_VOICE || '7qdUFMklKPaaAVMsBTBt',
};

// Helper to update progress in Firestore
async function updateProgress(
  sessionRef: FirebaseFirestore.DocumentReference,
  existingPodcasts: any[],
  version: number,
  status: string,
  progress: number,
  message: string,
  additionalData: any = {}
) {
  const updatedPodcast = {
    version,
    status,
    progress,
    progressMessage: message,
    ...additionalData
  };

  await sessionRef.update({
    podcasts: upsertPodcast(existingPodcasts, updatedPodcast),
    updatedAt: FieldValue.serverTimestamp()
  });
}

// Update existing callable function
export const generatePodcastAudio = onCall(
  {
    cors: [
      'https://questmind.nl',
      'http://localhost:4200',
      /^https:\/\/.*\.web\.app$/,
      /^https:\/\/.*\.firebaseapp\.com$/
    ],
    secrets: ['GOOGLE_AI_API_KEY', 'ELEVENLABS_API_KEY'],  // Add GOOGLE_AI_API_KEY
    timeoutSeconds: 900, // 15 minutes for complete generation (increased from 600)
    memory: '1GiB' // More memory for script + audio generation (increased from 512MiB)
  },
  async (request) => {
    const { auth, data } = request;

    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const {
      campaignId,
      sessionId,
      version,
      story,
      sessionTitle,
      sessionDate,
      script  // Optional: if provided, skip script generation
    } = data as PodcastGenerationRequest;

    // Validation
    if (!campaignId || typeof campaignId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing campaignId.');
    }
    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing sessionId.');
    }
    if (!version || typeof version !== 'number') {
      throw new HttpsError('invalid-argument', 'Missing version.');
    }

    // If script not provided, story and sessionTitle are required
    if (!script) {
      if (!story || typeof story !== 'string') {
        throw new HttpsError('invalid-argument', 'Missing story (required for script generation).');
      }
      if (!sessionTitle || typeof sessionTitle !== 'string') {
        throw new HttpsError('invalid-argument', 'Missing sessionTitle (required for script generation).');
      }
    } else {
      // If script provided, validate it
      if (!Array.isArray(script.segments) || script.segments.length === 0) {
        throw new HttpsError('invalid-argument', 'Invalid script provided.');
      }
    }

    const googleAiKey = process.env.GOOGLE_AI_API_KEY;
    const elevenlabsKey = process.env.ELEVENLABS_API_KEY;

    if (!googleAiKey) {
      throw new HttpsError('failed-precondition', 'Google AI API key is not configured.');
    }
    if (!elevenlabsKey) {
      throw new HttpsError('failed-precondition', 'ElevenLabs API key is not configured.');
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
      throw new HttpsError('permission-denied', 'Only the session owner can generate podcasts.');
    }

    const existingPodcasts = Array.isArray(sessionData.podcasts) ? sessionData.podcasts : [];
    const existingEntry = existingPodcasts.find((podcast: any) => podcast?.version === version);

    const now = new Date();
    const initialPodcastEntry = {
      version,
      createdAt: existingEntry?.createdAt ?? now,
      storyVersion: sessionData.storyRegenerationCount ?? existingEntry?.storyVersion,
      status: 'pending' as const,
      progress: 0,
      progressMessage: 'Starting complete podcast generation...'
    };

    await sessionRef.update({
      podcasts: upsertPodcast(existingPodcasts, initialPodcastEntry),
      latestPodcastVersion: version,
      updatedAt: FieldValue.serverTimestamp()
    });

    // RETURN IMMEDIATELY - Generation continues in background
    generatePodcastInBackground(
      campaignId,
      sessionId,
      version,
      script,  // May be undefined - will be generated if needed
      story,
      sessionTitle,
      sessionDate,
      sessionRef,
      existingPodcasts,
      auth.uid,
      storage
    ).catch(error => {
      console.error('Background podcast generation failed:', error);
    });

    return {
      success: true,
      message: 'Podcast generation started'
    };
  }
);

// Background generation function (updated to include script generation)
async function generatePodcastInBackground(
  campaignId: string,
  sessionId: string,
  version: number,
  script: PodcastScript | undefined,
  story: string | undefined,
  sessionTitle: string | undefined,
  sessionDate: string | undefined,
  sessionRef: FirebaseFirestore.DocumentReference,
  existingPodcasts: any[],
  userId: string,
  storage: any
) {
  const googleAiKey = process.env.GOOGLE_AI_API_KEY;
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY;

  if (!googleAiKey || !elevenlabsKey) {
    await updateProgress(sessionRef, existingPodcasts, version, 'failed', 0, 'API keys not configured', {
      error: 'Required API keys are not configured'
    });
    return;
  }

  const db = getFirestore();
  const googleAi = new GoogleGenAI({ apiKey: googleAiKey });
  const elevenlabs = new ElevenLabsClient({ apiKey: elevenlabsKey });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
  const outputPath = path.join(tempDir, `podcast-${sessionId}-v${version}.mp3`);

  try {
    let finalScript: PodcastScript;

    // STEP 1: Generate script if not provided
    if (!script) {
      // Load AI Settings from Firestore
      await updateProgress(
        sessionRef,
        existingPodcasts,
        version,
        'loading_context',
        5,
        'Loading AI model settings...'
      );

      const settingsSnap = await db.doc('settings/ai').get();
      const globalSettings = settingsSnap.data() as AISettings | undefined;

      if (!globalSettings) {
        throw new Error('AI settings not configured in database');
      }

      const selectedModel = globalSettings.defaultModel;
      const modelConfig = globalSettings.modelConfig[selectedModel];

      if (!modelConfig) {
        throw new Error(`Model configuration not found for: ${selectedModel}`);
      }

      console.log(`Using model: ${selectedModel} for script generation`);

      // Generate Script with Gemini
      await updateProgress(
        sessionRef,
        existingPodcasts,
        version,
        'generating_script',
        15,
        'Generating podcast script with AI...'
      );

      const promptText = `${PODCAST_SCRIPT_GENERATOR_PROMPT}\n\nSESSION TITLE: ${sessionTitle}\nSESSION DATE: ${
        sessionDate || 'Unknown'
      }\n\nSESSION STORY:\n${story}\n\nGenereer een podcast script met natuurlijke dialoog tussen HOST1 (man) en HOST2 (vrouw).`;

      const scriptResponse = await googleAi.models.generateContent({
        model: selectedModel,
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }]
          }
        ],
        config: modelConfig
      });

      if (!scriptResponse.text) {
        throw new Error('No script generated by AI');
      }

      // Parse script
      finalScript = parseScriptResponse(scriptResponse.text);

      if (finalScript.segments.length === 0) {
        throw new Error('Failed to parse script segments');
      }

      await updateProgress(
        sessionRef,
        existingPodcasts,
        version,
        'script_complete',
        50,
        `Script generated with ${finalScript.segments.length} segments`,
        {
          script: finalScript,
          scriptGeneratedAt: new Date(),
          duration: finalScript.estimatedDuration,
          modelUsed: selectedModel
        }
      );

      console.log(`Script generated: ${finalScript.segments.length} segments, ~${finalScript.estimatedDuration}s`);
    } else {
      // Script was provided, skip generation
      finalScript = script;
      await updateProgress(
        sessionRef,
        existingPodcasts,
        version,
        'script_complete',
        50,
        'Using provided script',
        {
          script: finalScript,
          scriptGeneratedAt: new Date(),
          duration: finalScript.estimatedDuration
        }
      );
      console.log(`Using provided script: ${finalScript.segments.length} segments`);
    }

    // STEP 2: Generate Audio with ElevenLabs
    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'generating_audio',
      55,
      'Generating conversational audio...'
    );

    const dialogueInputs = finalScript.segments.map((seg: any) => ({
      text: seg.text,
      voiceId: HOST_VOICES[seg.speaker as 'host1' | 'host2'] || HOST_VOICES.host1
    }));

    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'generating_audio',
      60,
      'Calling ElevenLabs text-to-dialogue API...'
    );

    const audioStream = await elevenlabs.textToDialogue.convert({
      inputs: dialogueInputs
    });

    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'generating_audio',
      70,
      'Receiving audio stream...'
    );

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    const readable = Readable.from(audioStream as any);

    for await (const chunk of readable) {
      chunks.push(Buffer.from(chunk));
    }

    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      throw new Error('Empty audio buffer from text-to-dialogue');
    }

    console.log(`Generated podcast audio: ${audioBuffer.length} bytes`);
    fs.writeFileSync(outputPath, audioBuffer);

    // STEP 5: Upload to Firebase Storage
    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'uploading',
      85,
      'Uploading podcast to storage...'
    );

    const storagePath = `campaigns/${campaignId}/podcasts/${sessionId}/v${version}.mp3`;
    const downloadToken = randomUUID();

    await storage.upload(outputPath, {
      destination: storagePath,
      metadata: {
        contentType: 'audio/mpeg',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          sessionId,
          campaignId,
          version: version.toString(),
          userId,
          modelUsed: selectedModel
        }
      }
    });

    const encodedPath = encodeURIComponent(storagePath);
    const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${storage.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    const fileSize = fs.statSync(outputPath).size;

    // STEP 6: Mark as completed
    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'completed',
      100,
      'Podcast ready!',
      {
        audioUrl: fileUrl,
        fileSize,
        audioGeneratedAt: new Date(),
        error: null
      }
    );

    console.log(`Complete podcast generation finished: ${fileUrl}`);

  } catch (error: any) {
    console.error('Error generating complete podcast:', error);

    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'failed',
      0,
      'Failed to generate podcast',
      {
        error: error?.message || 'Unknown error'
      }
    );
  } finally {
    // Cleanup
    safeUnlink(outputPath);
    safeRemoveDir(tempDir);
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

function upsertPodcast(existing: any[], nextEntry: any): any[] {
  const index = existing.findIndex(podcast => podcast?.version === nextEntry.version);
  if (index === -1) {
    return [...existing, nextEntry];
  }
  const updated = [...existing];
  updated[index] = { ...existing[index], ...nextEntry };
  return updated;
}

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn('Failed to delete temp file:', filePath, error);
  }
}

function safeRemoveDir(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn('Failed to delete temp dir:', dirPath, error);
  }
}
```

### Phase 4: Update Frontend Service

**Update existing `podcast-audio.service.ts`**:

The existing service already has the fire-and-forget pattern. Just update the method signature to accept story/sessionTitle instead of requiring a pre-generated script:

```typescript
// Update existing method in podcast-audio.service.ts

/**
 * Start podcast generation (script + audio)
 * Returns immediately, use listenToPodcastProgress() to monitor
 */
async startPodcastGeneration(
  campaignId: string,
  sessionId: string,
  version: number,
  story: string,  // NEW: Story for script generation
  sessionTitle: string,  // NEW: Session title
  sessionDate?: string  // NEW: Optional session date
): Promise<void> {
  const generateAudio = httpsCallable(this.functions, 'generatePodcastAudio');

  // Fire and forget - function returns immediately after validation
  await generateAudio({
    campaignId,
    sessionId,
    version,
    story,
    sessionTitle,
    sessionDate
    // No script parameter - will be generated in backend
  });
}

// The existing listenToPodcastProgress() method remains unchanged
// It already handles progress updates via onSnapshot
```

**Remove `podcast-script.service.ts`** - no longer needed since script generation moved to backend

### Phase 5: Update Component

**Update `audio-session.component.ts`**:

Simplify to pass story directly instead of generating script first:

```typescript
// OLD: Two-step process
async generatePodcast() {
  // 1. Generate script (wait)
  const script = await this.podcastScriptService.generatePodcastScript(...).toPromise();

  // 2. Generate audio (fire-and-forget)
  await this.podcastAudioService.startPodcastGeneration(..., script);
}

// NEW: Single fire-and-forget call (script generated in backend)
async generatePodcast() {
  if (!this.sessionId() || !this.generatedStory()) return;

  const version = (this.podcasts()?.length || 0) + 1;

  try {
    // 1. Start listening to progress BEFORE starting generation
    // (listenToPodcastProgress already exists in podcast-audio.service.ts)
    const { progress, unsubscribe } = this.podcastAudioService.listenToPodcastProgress(
      this.campaignId()!,
      this.sessionId()!,
      version
    );

    this.progressUnsubscribe = unsubscribe;
    this.podcastProgress.set(progress);

    // 2. Start generation (fire-and-forget) - now includes script generation
    await this.podcastAudioService.startPodcastGeneration(
      this.campaignId()!,
      this.sessionId()!,
      version,
      this.generatedStory()!,  // Story for script generation
      this.sessionTitle() || 'Untitled Session',
      this.sessionDate()
    );

    console.log('Podcast generation started (script + audio)');

  } catch (error) {
    console.error('Failed to start podcast generation:', error);
    this.errorMessage.set('Failed to start podcast generation');
    this.cleanupProgressListener();
  }
}
```

### Phase 6: Configuration

**Firebase Functions Configuration**:

1. **Set `GOOGLE_AI_API_KEY` Secret**:
```bash
# Using Firebase CLI
firebase functions:secrets:set GOOGLE_AI_API_KEY
# Paste your Google AI API key when prompted
```

2. **Existing `ELEVENLABS_API_KEY`**: Already configured

3. **Initialize AI Settings in Firestore**:
```bash
# Run migration script (one-time)
firebase functions:shell
> createDefaultAISettings()
```

4. **Update `functions/package.json`**:
```json
{
  "dependencies": {
    "@google/genai": "^0.21.0",
    "@elevenlabs/elevenlabs-js": "^x.x.x",
    // ... other dependencies
  }
}
```

5. **Remove from Frontend** (`package.json`):
```json
{
  "dependencies": {
    // REMOVE: "@google/genai": "^x.x.x"
  }
}
```

## Implementation Steps

### Step 1: Create Settings Collection
- [ ] Create AI settings interface in shared types
- [ ] Write migration script to initialize `settings/ai` document
- [ ] Set default model to `gemini-3-flash`
- [ ] Configure available models array
- [ ] Add model configurations (tokens, temperature, etc.)
- [ ] Update Firestore security rules for settings collection
- [ ] Run migration to create settings document
- [ ] Test reading settings from Firestore

### Step 2: Update Backend Configuration
- [ ] Set `GOOGLE_AI_API_KEY` as Firebase secret
- [ ] Verify `ELEVENLABS_API_KEY` is configured
- [ ] Add `@google/genai` to functions dependencies
- [ ] Copy `PODCAST_SCRIPT_GENERATOR_PROMPT` to functions/src/prompts
- [ ] Test Cloud Function can access both API keys

### Step 3: Extend Existing Backend Function
- [ ] Update `generate-podcast-audio.ts` with script generation
- [ ] Add `@google/genai` import and PODCAST_SCRIPT_GENERATOR_PROMPT
- [ ] Update interface to accept story/sessionTitle/sessionDate (script optional)
- [ ] Add GOOGLE_AI_API_KEY to secrets
- [ ] Implement settings loading from Firestore
- [ ] Add script generation logic before audio generation
- [ ] Use story directly (no Kanka context loading needed)
- [ ] Update progress tracking to include script generation stages
- [ ] Support backward compatibility (accept pre-generated script)
- [ ] Test with Cloud Functions emulator

### Step 4: Update Data Model
- [ ] Add new status values to PodcastVersion
- [ ] Add `modelUsed` field
- [ ] Update progress tracking fields
- [ ] Add script storage in progress updates
- [ ] Update TypeScript interfaces in frontend

### Step 5: Update Frontend Service
- [ ] Update `podcast-audio.service.ts`
- [ ] Modify `startPodcastGeneration()` to accept story/sessionTitle/sessionDate
- [ ] Remove script parameter (now optional/internal)
- [ ] Keep existing `listenToPodcastProgress()` (already supports new stages)
- [ ] Remove `@google/genai` dependency from frontend package.json
- [ ] Remove `podcast-script.service.ts` (logic moved to backend)
- [ ] Test with updated parameters

### Step 6: Update Component
- [ ] Update `generatePodcast()` to pass story/sessionTitle/sessionDate
- [ ] Remove script generation step (now happens in backend)
- [ ] Keep existing progress listener (already handles new stages)
- [ ] Remove dependency on `podcast-script.service.ts`
- [ ] Update error handling messages
- [ ] Test component integration

### Step 7: Update UI
- [ ] Update progress bar for new stages (0-10-50-80-100%)
- [ ] Add stage-specific messages
- [ ] Show script preview once generated
- [ ] Update loading states
- [ ] Test progress display with all stages

### Step 8: Testing
- [ ] Test settings loading from Firestore
- [ ] Test model selection (uses global default)
- [ ] Test complete generation flow (script → audio → upload)
- [ ] Test progress updates at each stage
- [ ] Test page refresh during generation
- [ ] Test error handling (API failures at each stage)
- [ ] Test with pre-generated story (contains Kanka context)
- [ ] Test concurrent generations
- [ ] Test backward compatibility (passing pre-generated script)
- [ ] Verify API key security (not exposed to client)
- [ ] Test cleanup of listeners

### Step 9: Migration & Deployment
- [ ] Run migration to create AI settings
- [ ] Deploy Cloud Function with new secrets
- [ ] Deploy frontend changes
- [ ] Monitor for errors
- [ ] Verify cost efficiency with Gemini 3 Flash
- [ ] Collect user feedback

### Step 10: Cleanup
- [ ] Remove old `podcast-script.service.ts` (if not needed)
- [ ] Remove `@google/genai` from frontend package.json
- [ ] Remove Google AI API key from frontend environment
- [ ] Update documentation
- [ ] Archive old two-step workflow code

## Benefits

### Security
1. ✅ **API Key Protection**: Google AI API key no longer exposed in frontend
2. ✅ **Backend-Only Access**: All AI operations happen server-side

### User Experience
3. ✅ **Single Action**: One button click generates complete podcast
4. ✅ **Real-Time Progress**: Detailed progress through all stages
5. ✅ **Resilient**: Page refresh doesn't lose progress
6. ✅ **Non-Blocking**: User can browse or leave site during generation
7. ✅ **Better Feedback**: Clear messages at each stage

### Architecture
8. ✅ **Unified Pattern**: Script and audio use same fire-and-forget approach
9. ✅ **Simplified Frontend**: Remove AI SDK and complex logic
10. ✅ **Centralized Configuration**: Model settings in database, not code
11. ✅ **Runtime Flexibility**: Change models without redeployment
12. ✅ **Better Separation**: AI logic in backend, UI logic in frontend

### Performance & Cost
13. ✅ **Faster Model**: Gemini 3 Flash outperforms Gemini 2.5 Pro while being 3x faster
14. ✅ **Lower Cost**: Gemini 3 Flash is priced at a fraction of the cost
15. ✅ **Reduced Latency**: Backend-to-backend API calls are faster

### Maintenance
16. ✅ **Single Source of Truth**: Settings in database
17. ✅ **Easy Model Updates**: Update Firestore, no code changes
18. ✅ **Simplified Configuration**: Global settings, no per-campaign complexity
19. ✅ **Future Extensibility**: Easy to add new models or providers

## Considerations

### Migration Complexity
- **Risk**: Moving script generation is a significant change
- **Mitigation**:
  - Test thoroughly with emulator
  - Deploy incrementally
  - Keep old code temporarily for rollback option

### API Rate Limits
- **Google AI**: Monitor rate limits for Gemini API
- **ElevenLabs**: Already handled in existing code
- **Mitigation**: Implement request queuing if needed

### Database Reads
- **Cost**: Every generation reads settings document
- **Mitigation**:
  - Cache settings in Cloud Function memory
  - Settings rarely change, so cache is effective

### Story Context
- **Approach**: Script generation uses the story that's already been generated
- **Benefit**: Story already includes Kanka context from frontend generation
- **Simplification**: No need to load Kanka context in backend

### Model Configuration
- **Challenge**: Admins need UI to update model settings
- **Solution**: Create admin settings page (future enhancement)
- **Workaround**: Manually update Firestore documents initially via Firebase Console

## Success Criteria

### Functionality
- [ ] Single endpoint generates complete podcast (script + audio)
- [ ] Settings loaded from Firestore successfully
- [ ] Campaign-level model override works
- [ ] Progress tracking works through all stages (0-100%)
- [ ] Script preview available after generation
- [ ] Page refresh preserves progress visibility
- [ ] Google AI API key not exposed in frontend

### Performance
- [ ] Function returns immediately (<1 second)
- [ ] Total generation time similar or better than old approach
- [ ] Gemini 3 Flash performs well for script generation (3x faster than 2.5 Pro)
- [ ] Settings caching reduces database reads

### User Experience
- [ ] Single button starts complete generation
- [ ] Progress bar shows detailed stages
- [ ] User can navigate away and return
- [ ] Clear error messages for each stage
- [ ] Script preview appears when ready

### Security
- [ ] API keys only in backend environment
- [ ] Settings collection properly secured
- [ ] Only campaign members can generate podcasts
- [ ] API keys never logged or exposed

### Maintainability
- [ ] Model selection easy to change via Firestore
- [ ] Code well-documented
- [ ] Error handling comprehensive
- [ ] Easy to add new models

## Alternative Approaches Considered

### Option 1: Keep Script Generation in Frontend
**Pros**: Less migration work
**Cons**: API key exposure, inconsistent patterns, poor UX
**Decision**: Rejected - security and UX benefits outweigh migration cost

### Option 2: Use Environment Variables for Model Selection
**Pros**: Simpler implementation
**Cons**: Requires redeployment to change, no per-campaign customization
**Decision**: Rejected - database storage provides needed flexibility

### Option 3: Create New Unified Function (vs Extending Existing)
**Pros**: Clean separation, easier testing
**Cons**: More migration work, duplicate code, need to update frontend calls
**Decision**: Rejected - extending existing `generatePodcastAudio` is simpler and maintains backward compatibility

### Option 4: Use Different AI Provider
**Pros**: Potentially better models
**Cons**: Migration complexity, cost uncertainty
**Decision**: Rejected for now - stick with Google AI, evaluate later

## Related Features

- **Ticket 19**: ElevenLabs Text-to-Dialogue Migration (audio generation pattern)
- **Ticket 17**: Podcast MP3 Generation and Storage (original podcast feature)
- **Ticket 16**: Session Podcast Recap Generator (script generation)
- **Ticket 14**: Kanka Integration (campaign context)

## Future Enhancements

1. **Admin Settings UI**: Web interface to manage AI settings
2. **Model Performance Tracking**: Monitor quality and cost per model
3. **A/B Testing**: Compare model outputs
4. **Custom Prompts**: Per-campaign prompt customization
5. **Voice Selection**: Let users choose ElevenLabs voices
6. **Multi-Provider Support**: Add OpenAI, Anthropic, etc.
7. **Backend Kanka Integration**: Move Kanka context loading to backend
8. **Retry Logic**: Automatic retry on AI failures
9. **Quality Metrics**: Track generation success rates
10. **Cost Tracking**: Monitor per-generation costs

## Estimated Scope

- **Complexity**: Medium-High (backend extension + settings migration)
- **Modified Files**:
  - **Update Backend**: `functions/src/generate-podcast-audio.ts` (add script generation)
  - **New Backend**: `functions/src/migration-scripts/create-ai-settings.ts`
  - **New Backend**: `functions/src/prompts/podcast-script-generator.prompt.ts` (copy from frontend)
  - **Update Frontend**: `src/app/audio/podcast-audio.service.ts` (update method signature)
  - **Update Frontend**: `src/app/audio/audio-session.component.ts` (simplify, remove script service)
  - **Update Frontend**: `src/app/audio/audio-session.models.ts` (add new status values)
  - **Update**: `functions/package.json` (add @google/genai)
  - **Update**: `src/package.json` (remove @google/genai)
  - **Remove**: `src/app/audio/podcast-script.service.ts` (logic moved to backend)
  - **Update**: Firestore security rules (add settings collection)
- **Dependencies**:
  - **Add Backend**: `@google/genai` (Cloud Functions)
  - **Remove Frontend**: `@google/genai`
  - **Existing**: `@elevenlabs/elevenlabs-js` (backend)
- **Configuration**:
  - **New Secret**: `GOOGLE_AI_API_KEY` (Firebase Functions)
  - **New Collection**: `settings/ai` (Firestore global settings)
- **Infrastructure**:
  - Firestore settings collection
  - Firebase Functions secrets management
  - Model configuration system
- **Testing**:
  - Unit tests for settings loading
  - Integration tests for complete flow
  - Emulator testing
  - End-to-end testing
  - Security testing (API key exposure)
- **Risk**: Medium-High (significant architectural change, API key migration)

## Implementation Priority

**Priority**: High

**Rationale**:
- **Security**: API key exposure is a security concern
- **UX**: Unified fire-and-forget pattern significantly improves experience
- **Architecture**: Creates consistent pattern for long-running operations
- **Flexibility**: Database-driven configuration enables runtime adjustments
- **Performance**: Gemini 3 Flash is 3x faster than 2.5 Pro at a fraction of the cost
- **Foundation**: Sets up pattern for future AI features

## Status

**Status**: Draft
**Priority**: High
**Created**: 2026-02-03
**Dependencies**:
  - Ticket 19 (ElevenLabs text-to-dialogue - already implemented)
  - Ticket 17 (Podcast audio generation - already implemented)
**Tech Stack**:
  - Google Gemini 3 Flash
  - Firebase Cloud Functions
  - Firebase Firestore (settings storage)
  - ElevenLabs text-to-dialogue API

## Notes

- **Security First**: Primary driver is removing API key from frontend
- **UX Improvement**: Secondary benefit is unified fire-and-forget pattern
- **Model Selection**: Gemini 3 Flash chosen for superior performance (3x faster than 2.5 Pro) and cost efficiency
- **Settings in Database**: Enables runtime flexibility without redeployment
- **Story Contains Context**: Script generation uses pre-generated story that already has Kanka context
- **Extend Existing Endpoint**: Simpler to extend `generatePodcastAudio` than create new endpoint
- **Admin UI**: Settings management UI deferred to future enhancement
- **Testing Strategy**: Test both new flow and backward compatibility
- **Rollback Plan**: Backward compatible - can still pass pre-generated script
- **Cost Monitoring**: Track Gemini API costs during beta
- **Performance Baseline**: Document current generation times for comparison
- **Global Settings**: Simplified - no per-campaign model configuration needed
- **Future Extensibility**: Architecture supports adding more AI providers or per-campaign overrides later
