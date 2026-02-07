# Ticket 19: ElevenLabs Text-to-Dialogue Migration

## Overview

Migrate podcast audio generation from segmented TTS approach to ElevenLabs' new text-to-dialogue endpoint. This involves updating the script generation to include proper formatting and non-verbal sounds (laughter, sighs, etc.) for text-to-dialogue, and making a single API call to ElevenLabs with the complete script instead of processing it segment-by-segment.

## Current State

**Current Implementation** (Ticket 17):

1. **Script Generation**:
   - Gemini generates podcast script with HOST1/HOST2 segments
   - Script format is simple dialogue without special formatting
   - No non-verbal sound cues included
   - No text-to-dialogue specific instructions

2. **Audio Synthesis**:
   - Script is processed segment-by-segment
   - Each segment gets individual TTS call
   - Segments are combined using ffmpeg
   - Uses either Google Cloud TTS or Gemini 2.5 TTS

3. **Architecture**:
   - **Synchronous**: Frontend waits for Cloud Function to complete (20 minute timeout)
   - **Long-Running**: Function can take 2-3 minutes to complete
   - **No Progress Updates**: Frontend has no visibility into generation progress
   - **Refresh Issue**: If user refreshes page, progress is lost

**Current Workflow**:
```
Frontend → Cloud Function (waits) → [Segment 1 TTS, Segment 2 TTS, ...] → ffmpeg → MP3 → Response
```

**Files Involved**:
- `podcast-script.service.ts`: Generates dialogue script
- `podcast-audio.service.ts`: Handles TTS synthesis per segment
- Cloud Function: `generatePodcastAudio` (segments and combines audio)

**Limitations**:
1. **Multiple API Calls**: Each speaker segment requires separate TTS call
2. **Artificial Pauses**: Segments are combined mechanically, not naturally
3. **No Non-Verbal Sounds**: Missing laughter, sighs, pauses that make dialogue natural
4. **Complexity**: Audio combining logic adds complexity
5. **Quality**: Individual segments may not flow naturally together
6. **Context Loss**: Each segment is synthesized independently without conversational context
7. **Poor UX**: Frontend blocks waiting for response, no progress visibility
8. **Refresh Issue**: User loses progress if they refresh or navigate away

## Problem Statement

The current segmented approach to podcast audio generation has several limitations:

1. **Unnatural Flow**: Combining individual segments creates artificial transitions
2. **Missing Expressiveness**: No non-verbal sounds (laughter, sighs, pauses) that occur naturally in conversations
3. **Inefficiency**: Multiple TTS calls increase latency and complexity
4. **Context Loss**: Each segment lacks awareness of the full conversation flow
5. **Maintenance Burden**: Audio combining logic is complex and error-prone

**Opportunity**: ElevenLabs text-to-dialogue endpoint can generate complete conversational audio with:
- Natural speaker transitions
- Non-verbal sounds
- Better prosody and intonation
- Single API call for entire conversation

## Proposed Solution

Migrate to ElevenLabs text-to-dialogue endpoint with enhanced script generation and asynchronous architecture:

### New Workflow

```
Frontend → Cloud Function (immediate response) → Background: [Text-to-dialogue API → Upload] → Update Firestore
                                                                                            ↓
Frontend ← Firestore onSnapshot (real-time progress updates) ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←┘
```

### Key Changes

1. **Script Generation Enhancement**:
   - Update Gemini prompt to specify output is for ElevenLabs text-to-dialogue
   - Include instructions to add non-verbal sounds: *laughs*, *sighs*, *pauses*, etc.
   - Format script according to ElevenLabs text-to-dialogue requirements
   - Ensure proper speaker identification format

2. **Single API Call**:
   - Replace segment-by-segment TTS with single text-to-dialogue call
   - Send complete script to ElevenLabs in one request
   - Receive fully-rendered conversational audio
   - Remove audio combining logic (no longer needed)

3. **Asynchronous Architecture** (NEW):
   - **Fire-and-Forget**: Cloud Function returns immediately after validation
   - **Progress Tracking**: Function updates Firestore with progress at each stage
   - **Real-time Updates**: Frontend uses `onSnapshot` (wrapped in signal) to monitor progress
   - **Resilient**: User can refresh page and still see generation progress
   - **Non-blocking**: Frontend remains responsive during generation

4. **Simplified Code**:
   - Remove ffmpeg dependency
   - Simplify Cloud Function logic
   - Better error handling with status updates
   - Faster perceived response time

## Technical Implementation

### Phase 1: Update Script Generation Prompt

**Update: `podcast-script-generator.prompt.ts`**

```typescript
export const PODCAST_SCRIPT_GENERATOR_PROMPT = `You are a creative podcast script writer.
Your task is to convert a D&D session recap into an engaging podcast script with two hosts.

IMPORTANT: This script will be used with ElevenLabs text-to-dialogue API, which generates natural conversational audio.
Format the script accordingly.

HOSTS:
- HOST1 (Male voice): Analytical, focused on mechanics, tactics, and strategic decisions
- HOST2 (Female voice): Narrative-focused, emphasizes story, character moments, and emotional beats

STYLE:
- Natural, conversational dialogue
- Back-and-forth discussion (not monologues)
- Enthusiasm and energy when discussing epic moments
- Light humor and inside jokes
- Speculation and theories about future events
- Commentary on player decisions

NON-VERBAL SOUNDS:
Include natural non-verbal sounds to enhance realism:
- *laughs* - when something is funny
- *chuckles* - for light amusement
- *sighs* - for dramatic or disappointing moments
- *pauses* - for emphasis or thought
- *excited* - for epic moments
- *gasps* - for shocking revelations
- *hmm* - for contemplation

Example:
HOST1: So they actually kicked down the door? *laughs*
HOST2: Oh yeah, no hesitation at all. *chuckles* Classic party move.
HOST1: *sighs* I mean, stealth was an option...
HOST2: But where's the fun in that? *laughs*

IMPORTANT RULES:
- The hosts KNOW this is from a tabletop RPG session, but DON'T explicitly say "D&D" or "Dungeons & Dragons"
- Use natural terms like "the adventure", "the story", "the campaign", "the party"
- Reference campaign context naturally (characters, locations, quests) without mentioning "Kanka" or "database"
- Keep segments short (1-3 sentences per speaker before switching)
- Make it entertaining and engaging
- Total length: approximately 20 minutes of dialogue
- Use non-verbal sounds liberally to make conversation feel natural

CONTENT FOCUS:
1. Session highlights and epic moments
2. Key decisions and their impact
3. Combat tactics and strategy
4. Character development and roleplay
5. Plot revelations and mysteries
6. Memorable quotes or funny moments
7. Theories about what comes next

FORMAT FOR ELEVENLABS TEXT-TO-DIALOGUE:
Output the script in this exact format:
HOST1: [dialogue with *non-verbal* sounds]
HOST2: [dialogue with *non-verbal* sounds]
HOST1: [dialogue with *non-verbal* sounds]
...

PACING:
- Aim for approximately 20 minutes of dialogue
- This gives enough time to cover all important details thoroughly
- Don't rush through key moments
- Include tactical discussions, character motivations, and story implications
- Balance between entertainment and comprehensive coverage

Write the podcast script now based on the session story provided below.`;
```

### Phase 2: Research ElevenLabs Text-to-Dialogue API

**CRITICAL: Verify SDK Support**

The current implementation uses `@elevenlabs/elevenlabs-js` SDK. Before implementation:

1. **Check SDK Documentation**: Verify the SDK has a text-to-dialogue method
   - Possible method names: `convertTextToDialogue()`, `textToDialogue()`, or similar
   - Check if it's under `elevenlabs.textToSpeech.*` or a different namespace
   - Verify it's available in the current SDK version

2. **If SDK doesn't support text-to-dialogue yet**:
   - Use REST API directly with fetch (native Node.js)
   - See example in Phase 2 below

**Required Research**:

1. **ElevenLabs SDK Method**:
   - Verify exact method name for text-to-dialogue
   - Check method signature and parameters
   - Confirm it accepts speaker mapping
   - Verify non-verbal sound support (*laughs*, *sighs*, etc.)

2. **API/SDK Specifications**:
   - Speaker identification format (HOST1/HOST2 vs host1/host2)
   - Voice ID compatibility with text-to-dialogue
   - Maximum script length limits
   - Response format (stream vs buffer)
   - Rate limits for text-to-dialogue endpoint
   - Expected generation time

3. **Voice Compatibility**:
   - Verify current voices (tvFp0BgJPrEXGoDhDIA4, 7qdUFMklKPaaAVMsBTBt) work with text-to-dialogue
   - Check if text-to-dialogue requires specific voice types
   - Test voice quality in conversational context

4. **Non-Verbal Sounds**:
   - Confirm format: `*laughs*`, `*sighs*`, etc.
   - Test which non-verbal sounds are supported
   - Verify they render naturally in dialogue

**Implementation Options**:

```typescript
// Option 1: If SDK supports text-to-dialogue
const audioStream = await elevenlabs.textToSpeech.convertTextToDialogue({
  text: "HOST1: Welcome! *excited*\nHOST2: Thanks! *laughs*",
  model_id: 'eleven_turbo_v2_5',
  speakers: {
    'HOST1': 'tvFp0BgJPrEXGoDhDIA4',
    'HOST2': '7qdUFMklKPaaAVMsBTBt'
  },
  voice_settings: {
    stability: 0.3,
    style: 0.0,
    use_speaker_boost: true
  }
});

// Option 2: REST API directly (if SDK doesn't support it)
async function generateTextToDialogue(scriptText: string): Promise<Readable> {
  const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/conversational', {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: scriptText,
      model_id: 'eleven_turbo_v2_5',
      speakers: {
        'HOST1': HOST_VOICES.host1,
        'HOST2': HOST_VOICES.host2
      },
      voice_settings: {
        stability: 0.3,
        style: 0.0,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${await response.text()}`);
  }

  return Readable.from(response.body as any);
}
```

### Phase 3: Update Data Model for Progress Tracking

**Add progress fields to PodcastVersion interface**:

```typescript
interface PodcastVersion {
  version: number;
  createdAt: Date;
  scriptGeneratedAt: Date;
  audioGeneratedAt?: Date;
  audioUrl?: string;
  duration: number;
  fileSize?: number;
  storyVersion?: number;
  script?: PodcastScript;

  // Progress tracking fields (NEW)
  status: 'pending' | 'generating_audio' | 'uploading' | 'completed' | 'failed';
  progress: number; // 0-100
  progressMessage: string; // e.g., "Generating audio with text-to-dialogue..."
  error?: string;
}
```

**Firestore Update Pattern**:
```typescript
// Cloud Function updates progress at each stage
await sessionRef.update({
  'podcasts.N.status': 'generating_audio',
  'podcasts.N.progress': 30,
  'podcasts.N.progressMessage': 'Generating conversational audio...',
  updatedAt: FieldValue.serverTimestamp()
});
```

### Phase 4: Frontend Real-Time Listening

**Update Frontend Service** (`podcast-audio.service.ts`):

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { Firestore, doc, onSnapshot, updateDoc } from '@angular/fire/firestore';
import { getFunctions, httpsCallable } from '@angular/fire/functions';

export interface PodcastProgress {
  status: 'pending' | 'generating_audio' | 'uploading' | 'completed' | 'failed';
  progress: number;
  message: string;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class PodcastAudioService {
  private readonly firestore = inject(Firestore);
  private readonly functions = getFunctions();

  /**
   * Start podcast generation (fire-and-forget)
   * Returns immediately, use listenToPodcastProgress() to monitor
   */
  async startPodcastGeneration(
    campaignId: string,
    sessionId: string,
    version: number,
    script: PodcastScript
  ): Promise<void> {
    const generateAudio = httpsCallable(this.functions, 'generatePodcastAudio');

    // Fire and forget - function returns immediately after validation
    await generateAudio({
      campaignId,
      sessionId,
      version,
      script
    });
  }

  /**
   * Listen to podcast generation progress in real-time
   * Returns a signal that updates with progress
   */
  listenToPodcastProgress(
    campaignId: string,
    sessionId: string,
    version: number
  ): { progress: Signal<PodcastProgress | null>, unsubscribe: () => void } {
    const progressSignal = signal<PodcastProgress | null>(null);

    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    // Listen to Firestore changes
    const unsubscribe = onSnapshot(sessionRef, (snapshot) => {
      if (!snapshot.exists()) {
        progressSignal.set({
          status: 'failed',
          progress: 0,
          message: 'Session not found',
          error: 'Session document does not exist'
        });
        return;
      }

      const data = snapshot.data();
      const podcasts = data?.['podcasts'] || [];
      const podcast = podcasts.find((p: any) => p.version === version);

      if (!podcast) {
        progressSignal.set({
          status: 'pending',
          progress: 0,
          message: 'Waiting to start...'
        });
        return;
      }

      progressSignal.set({
        status: podcast.status || 'pending',
        progress: podcast.progress || 0,
        message: podcast.progressMessage || 'Processing...',
        error: podcast.error
      });
    }, (error) => {
      console.error('Error listening to podcast progress:', error);
      progressSignal.set({
        status: 'failed',
        progress: 0,
        message: 'Failed to monitor progress',
        error: error.message
      });
    });

    return {
      progress: progressSignal.asReadonly(),
      unsubscribe
    };
  }
}
```

**Update Component** (`audio-session.component.ts`):

```typescript
export class AudioSessionComponent {
  // Podcast progress state
  podcastProgress = signal<PodcastProgress | null>(null);
  private progressUnsubscribe?: () => void;

  async generatePodcast() {
    if (!this.sessionId() || !this.generatedStory()) return;

    const version = (this.podcasts()?.length || 0) + 1;

    try {
      // 1. Start listening to progress BEFORE starting generation
      const { progress, unsubscribe } = this.podcastAudioService.listenToPodcastProgress(
        this.campaignId()!,
        this.sessionId()!,
        version
      );

      this.progressUnsubscribe = unsubscribe;

      // Create effect to watch progress
      effect(() => {
        const currentProgress = progress();
        if (currentProgress) {
          console.log('Podcast progress:', currentProgress);

          // Auto-cleanup when completed or failed
          if (currentProgress.status === 'completed' || currentProgress.status === 'failed') {
            setTimeout(() => {
              this.cleanupProgressListener();
            }, 3000); // Keep showing final state for 3 seconds
          }
        }
      });

      // 2. Start generation (fire-and-forget)
      await this.podcastAudioService.startPodcastGeneration(
        this.campaignId()!,
        this.sessionId()!,
        version,
        script
      );

      // Function returns immediately, progress updates come via Firestore
      console.log('Podcast generation started, monitoring progress...');

    } catch (error) {
      console.error('Failed to start podcast generation:', error);
      this.errorMessage.set('Failed to start podcast generation');
      this.cleanupProgressListener();
    }
  }

  private cleanupProgressListener() {
    if (this.progressUnsubscribe) {
      this.progressUnsubscribe();
      this.progressUnsubscribe = undefined;
    }
  }

  ngOnDestroy() {
    this.cleanupProgressListener();
  }
}
```

**Template** (audio-session.component.html):

```html
<!-- Progress indicator -->
@if (podcastProgress()) {
  <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
    <div class="flex items-center justify-between mb-2">
      <span class="text-sm font-medium text-blue-900">{{ podcastProgress()!.message }}</span>
      <span class="text-sm text-blue-700">{{ podcastProgress()!.progress }}%</span>
    </div>
    <div class="w-full bg-blue-200 rounded-full h-2">
      <div
        class="bg-blue-600 h-2 rounded-full transition-all duration-300"
        [style.width.%]="podcastProgress()!.progress"
      ></div>
    </div>

    @if (podcastProgress()!.status === 'failed') {
      <p class="text-xs text-red-600 mt-2">{{ podcastProgress()!.error }}</p>
    }

    @if (podcastProgress()!.status === 'completed') {
      <p class="text-xs text-green-600 mt-2">✓ Podcast ready!</p>
    }
  </div>
}
```

### Phase 5: Update Cloud Function with Progress Tracking

**Current State**: The function waits for completion and returns response synchronously.

**New Pattern**: Fire-and-forget with progress updates to Firestore.

**Modify: `functions/src/generate-podcast-audio.ts`**

Key changes needed:

1. **Return immediately after validation** - Don't wait for generation to complete
2. **Update progress in Firestore** at each stage
3. **Replace segment-by-segment approach** with single text-to-dialogue call
4. **Remove ffmpeg combining logic**
5. **Add helper function** to update progress

**Updated implementation**:

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

const HOST_VOICES: Record<'host1' | 'host2', string> = {
  host1: process.env.ELEVENLABS_HOST1_VOICE || 'tvFp0BgJPrEXGoDhDIA4',
  host2: process.env.ELEVENLABS_HOST2_VOICE || '7qdUFMklKPaaAVMsBTBt',
};

// Helper to update progress in Firestore
async function updateProgress(
  sessionRef: FirebaseFirestore.DocumentReference,
  version: number,
  status: string,
  progress: number,
  message: string,
  additionalData: any = {}
) {
  const podcasts = (await sessionRef.get()).data()?.podcasts || [];
  const index = podcasts.findIndex((p: any) => p.version === version);

  if (index !== -1) {
    podcasts[index] = {
      ...podcasts[index],
      status,
      progress,
      progressMessage: message,
      ...additionalData
    };

    await sessionRef.update({
      podcasts,
      updatedAt: FieldValue.serverTimestamp()
    });
  }
}

export const generatePodcastAudio = onCall(
  {
    cors: [/* existing CORS config */],
    secrets: ['ELEVENLABS_API_KEY'],
    timeoutSeconds: 600,
    memory: '512MiB'
  },
  async (request: CallableRequest<PodcastGenerationRequest>) => {
    const { auth, data } = request;

    // Validation (same as before)
    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { campaignId, sessionId, version, script } = data;

    // ... validation code (lines 61-107) ...

    const db = getFirestore();
    const sessionRef = db.doc(`campaigns/${campaignId}/audioSessions/${sessionId}`);

    // Create initial podcast entry with 'pending' status
    const now = new Date();
    const initialEntry = {
      version,
      createdAt: now,
      scriptGeneratedAt: now,
      duration: script.estimatedDuration,
      storyVersion: sessionData.storyRegenerationCount,
      script,
      status: 'pending',
      progress: 0,
      progressMessage: 'Starting podcast generation...'
    };

    await sessionRef.update({
      podcasts: upsertPodcast(existingPodcasts, initialEntry),
      latestPodcastVersion: version,
      updatedAt: FieldValue.serverTimestamp()
    });

    // RETURN IMMEDIATELY - Generation continues in background
    // Frontend will listen to Firestore updates via onSnapshot

    // Start generation asynchronously (don't await)
    generatePodcastInBackground(
      campaignId,
      sessionId,
      version,
      script,
      sessionRef,
      auth.uid
    ).catch(error => {
      console.error('Background generation failed:', error);
    });

    return {
      success: true,
      message: 'Podcast generation started'
    };
  }
);

// Background generation function
async function generatePodcastInBackground(
  campaignId: string,
  sessionId: string,
  version: number,
  script: PodcastScript,
  sessionRef: FirebaseFirestore.DocumentReference,
  userId: string
) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    await updateProgress(sessionRef, version, 'failed', 0, 'API key not configured', {
      error: 'ElevenLabs API key is not configured'
    });
    return;
  }

  const elevenlabs = new ElevenLabsClient({ apiKey });
  const storage = getStorage().bucket();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
  const outputPath = path.join(tempDir, `podcast-${sessionId}-v${version}.mp3`);

  try {
    // Update: Starting audio generation
    await updateProgress(
      sessionRef,
      version,
      'generating_audio',
      10,
      'Generating conversational audio with text-to-dialogue...'
    );

    // 1. Format script for text-to-dialogue
    const scriptText = script.segments
      .map((seg) => `${seg.speaker.toUpperCase()}: ${seg.text}`)
      .join('\n');

    console.log(`Generating podcast with text-to-dialogue (${script.segments.length} segments)`);

    // 2. Call ElevenLabs text-to-dialogue API (SINGLE CALL)
    await updateProgress(
      sessionRef,
      version,
      'generating_audio',
      30,
      'Calling ElevenLabs text-to-dialogue API...'
    );

    const audioStream = await elevenlabs.textToSpeech.convertTextToDialogue({
      text: scriptText,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.3,
        style: 0.0,
        use_speaker_boost: true
      },
      speakers: {
        'HOST1': HOST_VOICES.host1,
        'HOST2': HOST_VOICES.host2
      }
    });

    // Update: Receiving audio
    await updateProgress(
      sessionRef,
      version,
      'generating_audio',
      60,
      'Receiving audio stream...'
    );

    // 3. Convert stream to buffer
    const chunks: Buffer[] = [];
    const readable = Readable.from(audioStream as any);

    for await (const chunk of readable) {
      chunks.push(Buffer.from(chunk));
    }

    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      throw new Error('Empty audio buffer from text-to-dialogue');
    }

    console.log(`Generated podcast: ${audioBuffer.length} bytes`);
    fs.writeFileSync(outputPath, audioBuffer);

    // Update: Uploading to storage
    await updateProgress(
      sessionRef,
      version,
      'uploading',
      80,
      'Uploading podcast to storage...'
    );

    // 4. Upload to Firebase Storage
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
          userId
        }
      }
    });

    const encodedPath = encodeURIComponent(storagePath);
    const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${storage.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    const fileSize = fs.statSync(outputPath).size;

    // Update: Completed!
    await updateProgress(
      sessionRef,
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

    console.log(`Podcast generation completed: ${fileUrl}`);

  } catch (error: any) {
    console.error('Error generating podcast:', error);

    await updateProgress(
      sessionRef,
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

**Key Changes**:
1. ✅ Function returns immediately after creating initial podcast entry
2. ✅ Generation continues in `generatePodcastInBackground()`
3. ✅ Progress updates at each stage (0% → 10% → 30% → 60% → 80% → 100%)
4. ✅ Frontend listens via onSnapshot and sees real-time updates
5. ✅ User can refresh and still see progress
6. ✅ Single text-to-dialogue API call (no segments + ffmpeg)

### Phase 5: Configuration

**Current Configuration** (already in place):

The Cloud Function already has proper configuration via environment variables:
- `ELEVENLABS_API_KEY` - Secret accessed via `process.env.ELEVENLABS_API_KEY`
- `ELEVENLABS_HOST1_VOICE` - Optional override for male voice (defaults to 'tvFp0BgJPrEXGoDhDIA4')
- `ELEVENLABS_HOST2_VOICE` - Optional override for female voice (defaults to '7qdUFMklKPaaAVMsBTBt')

**Configuration Tasks**:

1. **Verify voice IDs are suitable for text-to-dialogue**: Current voice IDs may need to be updated if text-to-dialogue requires specific voice types
2. **Test with existing voices**: Try text-to-dialogue with current voice IDs first
3. **Update if needed**: If voices don't work with text-to-dialogue, update environment variables:
   ```bash
   # Set in Cloud Function environment (if needed)
   ELEVENLABS_HOST1_VOICE=<new-voice-id>
   ELEVENLABS_HOST2_VOICE=<new-voice-id>
   ```

**No frontend changes needed** - All configuration lives in the backend Cloud Function.

### Phase 6: Update Dependencies

**Current Dependencies**:
```json
{
  "dependencies": {
    "@elevenlabs/elevenlabs-js": "^x.x.x", // Already present
    "fluent-ffmpeg": "^2.1.2" // Will be REMOVED
  }
}
```

**After Migration**:
```json
{
  "dependencies": {
    "@elevenlabs/elevenlabs-js": "^x.x.x" // Keep, verify it supports text-to-dialogue
    // fluent-ffmpeg REMOVED - no longer needed
  }
}
```

**Verify**: Check that current `@elevenlabs/elevenlabs-js` version supports text-to-dialogue endpoint. Update if needed.

## Implementation Steps

### Step 1: Research Phase (CRITICAL - Do First!)
- [ ] **PRIORITY**: Verify `@elevenlabs/elevenlabs-js` SDK supports text-to-dialogue
- [ ] Identify exact method name in SDK (e.g., `convertTextToDialogue()`)
- [ ] Check SDK version requirements for text-to-dialogue
- [ ] Review SDK documentation for text-to-dialogue examples
- [ ] If SDK doesn't support it, research REST API endpoint
- [ ] Verify current voice IDs work with text-to-dialogue
- [ ] Test non-verbal sound format (*laughs*, *sighs*, etc.)
- [ ] Confirm speaker identification format (HOST1 vs host1)
- [ ] Verify maximum script length limits
- [ ] Check rate limits and pricing for text-to-dialogue
- [ ] Test sample request with small 2-segment script

### Step 2: Update Script Generation
- [ ] Update `PODCAST_SCRIPT_GENERATOR_PROMPT` with text-to-dialogue instructions
- [ ] Add guidelines for non-verbal sounds
- [ ] Test script generation with new prompt
- [ ] Verify output format matches ElevenLabs expectations
- [ ] Ensure non-verbal sounds are naturally integrated

### Step 3: Update Data Model
- [ ] Add progress tracking fields to `PodcastVersion` interface
- [ ] Add `status`, `progress`, `progressMessage` fields
- [ ] Update TypeScript types in frontend
- [ ] Document progress states: pending → generating_audio → uploading → completed/failed

### Step 4: Implement Frontend Real-Time Listening
- [ ] Create `listenToPodcastProgress()` method in `podcast-audio.service.ts`
- [ ] Wrap onSnapshot in a signal for reactive updates
- [ ] Return unsubscribe function for cleanup
- [ ] Update `startPodcastGeneration()` to be fire-and-forget
- [ ] Update component to use progress signal
- [ ] Add effect to watch progress updates
- [ ] Implement cleanup on component destroy
- [ ] Update template to show progress bar and status
- [ ] Test that refresh preserves progress visibility

### Step 5: Update Cloud Function with Progress Tracking
- [ ] Modify `generatePodcastAudio` to return immediately after validation
- [ ] Create `generatePodcastInBackground()` async function
- [ ] Create `updateProgress()` helper function
- [ ] Add progress updates at each stage (0%, 10%, 30%, 60%, 80%, 100%)
- [ ] Implement single text-to-dialogue API call
- [ ] Remove ffmpeg dependency and combining logic
- [ ] Update timeout to 600s (reduced from 1200s)
- [ ] Update memory to 512MiB (reduced from 1GiB)
- [ ] Test with Cloud Function emulator
- [ ] Deploy to Firebase

### Step 5: Configuration
- [ ] Verify existing `ELEVENLABS_API_KEY` environment variable is set
- [ ] Test current voice IDs work with text-to-dialogue endpoint
- [ ] Update voice IDs if needed (via `ELEVENLABS_HOST1_VOICE` and `ELEVENLABS_HOST2_VOICE`)
- [ ] Test API authentication with text-to-dialogue endpoint
- [ ] Verify voice quality with text-to-dialogue

### Step 6: Testing
- [ ] Test script generation with non-verbal sounds
- [ ] Test fire-and-forget Cloud Function call (should return immediately)
- [ ] Test real-time progress updates via onSnapshot
- [ ] Test progress visibility after page refresh
- [ ] Test single API call to ElevenLabs text-to-dialogue
- [ ] Test with various script lengths
- [ ] Test error handling (API failures, show in progress updates)
- [ ] Test concurrent generations (multiple users/sessions)
- [ ] Test audio quality and naturalness
- [ ] Verify non-verbal sounds are rendered correctly
- [ ] Test cleanup of onSnapshot listeners
- [ ] Test progress updates at each stage (0%, 10%, 30%, 60%, 80%, 100%)

### Step 7: Migration
- [ ] Deploy updated prompt to production
- [ ] Deploy updated Cloud Function
- [ ] Update frontend services
- [ ] Monitor for errors
- [ ] Compare costs (old vs new)
- [ ] Collect user feedback on audio quality

### Step 8: Cleanup
- [ ] Remove ffmpeg dependency from package.json
- [ ] Remove ffmpeg import from generate-podcast-audio.ts
- [ ] Update documentation
- [ ] Verify no unused code remains

## Benefits

### Audio Quality
1. ✅ **Better Quality**: Natural conversational flow with proper intonation
2. ✅ **Non-Verbal Sounds**: Laughter, sighs, pauses make dialogue feel real
3. ✅ **Better Context**: Entire conversation processed together for better flow
4. ✅ **More Natural**: Speakers interact naturally, not mechanically combined

### Architecture
5. ✅ **Simpler Code**: Single API call vs multiple segments + combining
6. ✅ **Faster Generation**: No segment combining, reduced processing time (~30% improvement)
7. ✅ **Reduced Complexity**: Remove ffmpeg and audio processing logic
8. ✅ **Lower Maintenance**: Fewer moving parts, simpler error handling

### User Experience
9. ✅ **Non-Blocking UI**: Frontend remains responsive during generation
10. ✅ **Real-Time Progress**: Users see exactly what's happening
11. ✅ **Resilient to Refresh**: Progress persists across page reloads
12. ✅ **Better Feedback**: Clear progress messages at each stage
13. ✅ **Immediate Response**: Function returns in <1 second, generation continues in background

## Considerations

### Cost Comparison

**Old Approach** (Gemini 2.5 TTS + ffmpeg):
- Multiple TTS calls (one per segment)
- Audio processing overhead
- Estimated: $0.80 per podcast

**New Approach** (ElevenLabs text-to-dialogue):
- Single API call
- ElevenLabs pricing: ~$0.30 per 1K characters
- 20-minute script ≈ 6-8K characters
- Estimated: $1.80-$2.40 per podcast

**Trade-off**: Higher cost per podcast, but significantly better quality and simpler implementation.

### API Limits

**ElevenLabs**:
- Rate limits: Check API documentation
- Maximum script length: Verify limit
- Character count limits per request
- Concurrent request limits

**Mitigation**:
- Implement rate limiting in Cloud Function
- Add request queuing if needed
- Monitor usage and set alerts

### Voice Quality

**Testing Required**:
- Test Dutch voice options
- Compare male/female voice quality
- Verify non-verbal sound rendering
- Test prosody and intonation
- Compare with previous implementation

### Generation Time

**Expected Improvements**:
- Old: 60-120 seconds (TTS) + 10-20 seconds (combining) = 70-140 seconds
- New: 40-80 seconds (single call) = 40-80 seconds
- **Improvement**: ~30% faster

### Error Handling

**If ElevenLabs API Fails**:
- Return clear error message to user
- Implement retry logic with exponential backoff (already in place for rate limits)
- Log errors for monitoring
- Mark podcast status as 'failed' in Firestore (already implemented)

## Success Criteria

### Audio Quality
- [ ] Script generation includes text-to-dialogue formatting
- [ ] Non-verbal sounds are naturally integrated (*laughs*, *sighs*, etc.)
- [ ] Single API call to ElevenLabs generates complete podcast
- [ ] Audio quality is natural and conversational
- [ ] Speaker transitions are smooth
- [ ] Non-verbal sounds render naturally in dialogue

### Architecture & Performance
- [ ] Cloud Function returns immediately (<1 second response time)
- [ ] Generation continues in background
- [ ] No audio combining logic required (ffmpeg removed)
- [ ] Generation time is reduced by ~30% from current segmented approach
- [ ] Cloud Function memory usage reduced to 512MiB
- [ ] Timeout reduced to 600s

### User Experience
- [ ] Frontend shows real-time progress updates (0%, 10%, 30%, 60%, 80%, 100%)
- [ ] Progress messages are clear and informative
- [ ] User can refresh page and still see generation progress
- [ ] onSnapshot listener properly cleans up on component destroy
- [ ] Progress bar animates smoothly with updates
- [ ] Errors are displayed clearly in progress UI
- [ ] Completed podcasts show success state

### Technical
- [ ] Progress updates correctly write to Firestore
- [ ] Multiple concurrent generations don't interfere
- [ ] Error handling is robust (API failures, timeouts)
- [ ] Costs are acceptable (~$1.80-$2.40 per podcast)
- [ ] No memory leaks from onSnapshot listeners

## Alternative Approaches Considered

### Option 1: Keep Segment-Based Approach
**Pros**: Already working, known costs
**Cons**: Less natural, more complex, misses non-verbal sounds
**Decision**: Rejected - text-to-dialogue is superior

### Option 2: Use REST API Instead of SDK
**Pros**: More control, can use latest API features immediately
**Cons**: More code to maintain, lose SDK benefits
**Decision**: Use SDK if available, otherwise REST API (research in Step 1 will determine)

### Option 3: Wait for Future Improvements
**Pros**: Avoid migration work if better solution coming
**Cons**: Miss quality improvements now
**Decision**: Rejected - implement now, can iterate later

## Related Features

- **Ticket 16**: Session Podcast Recap Generator (original feature)
- **Ticket 17**: Podcast MP3 Generation and Storage (current implementation)
- **Podcast Script Service**: Generates dialogue scripts
- **Cloud Functions**: Handles audio generation

## Future Enhancements

1. **Voice Cloning**: Use custom voices for hosts
2. **Emotion Control**: Fine-tune emotional expression per segment
3. **Background Music**: Add subtle background music (post-processing)
4. **Multi-Language**: Support other languages beyond Dutch
5. **Dynamic Voices**: Let users choose different voice pairs
6. **Expressive Controls**: Adjust speaking rate, pitch per segment

## Estimated Scope

- **Complexity**: Medium-High (audio + architectural changes)
- **Modified Files**:
  - `podcast-script-generator.prompt.ts` (add text-to-dialogue instructions and non-verbal sounds)
  - `functions/src/generate-podcast-audio.ts` (fire-and-forget pattern, progress tracking, single text-to-dialogue call, remove ffmpeg)
  - `functions/package.json` (remove ffmpeg dependency)
  - `podcast-audio.service.ts` (add fire-and-forget method, add onSnapshot listener with signal)
  - `audio-session.component.ts` (update to use progress signal, cleanup listeners)
  - `audio-session.component.html` (update template for progress display)
  - `audio-session.models.ts` (add progress fields to PodcastVersion interface)
- **Dependencies**:
  - **Remove**: fluent-ffmpeg (no longer needed)
  - **Verify/Update**: @elevenlabs/elevenlabs-js (ensure it supports text-to-dialogue)
  - **Use**: Firebase onSnapshot for real-time updates (already available)
- **Configuration**: Use existing environment variables (ELEVENLABS_API_KEY, ELEVENLABS_HOST1_VOICE, ELEVENLABS_HOST2_VOICE)
- **Infrastructure**:
  - ElevenLabs text-to-dialogue endpoint integration
  - Firestore real-time listeners (onSnapshot)
  - Background function execution pattern
- **Testing**:
  - API integration testing
  - Real-time progress update testing
  - Refresh/reload resilience testing
  - Voice quality testing
  - Cost monitoring
- **Risk**: Medium (API method verification needed, architectural change to fire-and-forget, cost increase)

## Implementation Priority

**Priority**: Medium-High

**Rationale**:
- Significant quality improvement for podcast feature
- Simplifies codebase (removes ffmpeg complexity)
- Natural conversation flow is key value proposition
- Non-verbal sounds add personality and engagement

## Status

**Status**: Draft
**Priority**: Medium-High
**Created**: 2026-02-03
**Dependencies**: Ticket 17 (current podcast implementation)
**Tech Stack**: ElevenLabs text-to-dialogue API, Google Gemini (script generation), Firebase Storage

## Notes

- **CRITICAL**: First verify that `@elevenlabs/elevenlabs-js` SDK supports text-to-dialogue. If not, use REST API directly.
- **Architectural Change**: This ticket includes a significant architectural change from synchronous to asynchronous (fire-and-forget) pattern. This is a **prerequisite** for good UX with long-running operations.
- **Current Voice IDs**: Already configured (tvFp0BgJPrEXGoDhDIA4, 7qdUFMklKPaaAVMsBTBt). Verify they work with text-to-dialogue.
- **Configuration**: All ElevenLabs config is in Cloud Function via environment variables (ELEVENLABS_API_KEY, ELEVENLABS_HOST1_VOICE, ELEVENLABS_HOST2_VOICE)
- **Backend-Only ElevenLabs**: ElevenLabs integration is backend-only, but frontend gets real-time progress updates via Firestore
- **Cost Monitoring**: Track actual costs during beta phase (~$1.80-$2.40 per podcast expected)
- **Quality Testing**: Test with real podcasts to confirm quality improvement
- **Non-Verbal Sounds**: Test that *laughs*, *sighs*, etc. render naturally in the dialogue
- **Clean Migration**: Old segment-based code will be completely removed - no fallback approach
- **Progress Tracking**: Progress fields in Firestore enable resilient UX - user can refresh and still see status
- **Memory Management**: Remember to unsubscribe from onSnapshot listeners to prevent memory leaks
