# Ticket 16: Session Podcast Recap Generator

## Overview

Add functionality to generate AI-powered podcast recaps of completed D&D sessions. The podcast features two hosts (male and female voices) discussing the session events in a conversational format, using the generated story as the primary source material and Kanka context for enhanced storytelling.

**Data Relationship**: Each play date is an audio session containing one story. Each audio session can have multiple versioned podcasts, allowing users to regenerate podcasts if they improve the story with corrections.

## Current State

**Session Story Service** (`src/app/audio/session-story.service.ts`):

- Generates markdown session recaps from audio transcripts
- Uses Kanka integration for campaign context
- Supports user corrections for iterative improvement
- Output format: Markdown text only

**Audio Session Component** (`src/app/audio/audio-session.component.ts`):

- Displays generated story in markdown format
- Provides controls for story regeneration
- No audio/podcast generation capabilities

**Limitations**:

- Session recaps exist only as text (markdown)
- No audio format for consuming session recaps
- Users must read the recap to remember what happened
- No engaging alternative format for session review

## Problem Statement

After a D&D session, players receive a text-based recap. While this is useful for reference, it has limitations:

1. **Reading Time**: Long recaps take time to read
2. **Engagement**: Text can be less engaging than audio
3. **Accessibility**: Audio formats are more accessible for some users
4. **Multi-tasking**: Can't consume recaps while doing other activities
5. **Entertainment Value**: Missing opportunity for engaging recap format

**Opportunity**: Create a podcast-style recap where two AI hosts discuss the session events conversationally, making it more engaging and accessible.

## Proposed Solution

Add a **podcast generation** feature that converts session recaps into entertaining audio podcasts with two AI hosts discussing the session.

### Podcast Characteristics

**Two Hosts**:

- **Host 1**: Male voice - analytical, focused on mechanics and strategy
- **Host 2**: Female voice - narrative-focused, emphasizes story and character moments

**Conversational Style**:

- Natural back-and-forth dialogue
- Hosts discuss session highlights, key decisions, epic moments
- Commentary on player choices and outcomes
- Speculation about future developments
- Inside jokes and light humor appropriate to the session

**Context Awareness**:

- Hosts know it's a D&D session but don't mention "D&D" explicitly
- Use campaign-specific terminology naturally
- Reference Kanka context (characters, locations, quests) without mentioning "Kanka"
- Sound like they're reviewing a story/adventure, not explicitly a tabletop game

**Content Focus**:

- Session highlights and epic moments
- Character development and decisions
- Combat encounters and tactics (with details)
- Plot progression and revelations
- Funny or memorable quotes
- Foreshadowing and theories
- All important details from the session (20 minutes allows for thorough coverage)

### User Workflow

1. **User completes session** → Transcription and story generation happen automatically
2. **User reviews generated story** → Story is visible in markdown format
3. **User clicks "Generate Podcast"** → Explicit action required (not automatic)
4. **System generates podcast script** → AI creates dialogue between two hosts
5. **System synthesizes audio** → Text-to-speech for both voices
6. **Podcast is saved** → Versioned, doesn't overwrite previous podcasts
7. **User can play/download** → Podcast appears in overview list

### Podcast Management

**Data Structure**:

- **Audio Session** = One play date with one story
- **Podcasts** = Multiple versioned podcasts per audio session
- Each time a user generates/regenerates a podcast, a new version is created
- All versions are preserved and accessible

**Versioning**:

- Each podcast generation creates a new version (v1, v2, v3, etc.)
- Previous versions remain available within the same audio session
- Versioning format: `v1`, `v2`, `v3`, etc.
- Users can regenerate if they improve the story with corrections
- Each version is linked to the audio session it belongs to

**Storage**:

- Audio files stored in Firebase Storage under: `/podcasts/{audioSessionId}/{version}.mp3`
- Metadata stored in Firestore within the `audioSessions/{sessionId}` document
- File format: MP3 or M4A (platform-compatible)
- Size considerations: 20 minute podcasts (~20 MB per version)

**Podcast Library**:

- Overview page showing all audio sessions with their podcasts
- Each audio session shows its versioned podcasts
- Filterable by session date
- Sortable by date, session name
- Audio player embedded in UI
- Download button for offline listening
- Version history per audio session

## Technical Implementation

### Phase 1: AI Podcast Script Generation

**Approach**: Use Google Gemini to generate a conversational podcast script from the story.

**New Service: Podcast Script Generator** (`src/app/audio/podcast-script.service.ts`):

```typescript
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { GoogleGenAI } from '@google/genai';

import { KankaService } from '../kanka/kanka.service';
import { PODCAST_SCRIPT_GENERATOR_PROMPT } from '../prompts';
import { environment } from '../../environments/environment';

export interface PodcastScript {
  segments: PodcastSegment[];
  estimatedDuration: number; // seconds
}

export interface PodcastSegment {
  speaker: 'host1' | 'host2'; // male or female
  text: string;
  emotion?: 'neutral' | 'excited' | 'curious' | 'amused';
}

@Injectable({
  providedIn: 'root',
})
export class PodcastScriptService {
  private readonly ai: GoogleGenAI;
  private readonly kankaService = inject(KankaService);

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: environment.googleAiApiKey });
  }

  generatePodcastScript(
    story: string,
    sessionTitle: string,
    sessionDate: string | undefined,
    kankaContext?: string
  ): Observable<PodcastScript> {
    const contextSection = kankaContext ? `\n\nCAMPAIGN CONTEXT:\n${kankaContext}` : '';

    return from(
      this.ai.models.generateContent({
        model: environment.aiModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${PODCAST_SCRIPT_GENERATOR_PROMPT}

SESSION TITLE: ${sessionTitle}
SESSION DATE: ${sessionDate || 'Unknown'}
${contextSection}

SESSION STORY:
${story}

Generate a podcast script with natural dialogue between HOST1 (male) and HOST2 (female).`,
              },
            ],
          },
        ],
        config: {
          maxOutputTokens: 8192,
          temperature: 0.9, // Higher creativity for natural dialogue
          topP: 0.95,
          topK: 40,
        },
      })
    ).pipe(map((response) => this.parseScriptResponse(response.text())));
  }

  private parseScriptResponse(text: string): PodcastScript {
    // Parse AI response into structured PodcastScript
    // Expected format:
    // HOST1: [text]
    // HOST2: [text]
    // ...

    const segments: PodcastSegment[] = [];
    const lines = text.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      if (line.startsWith('HOST1:')) {
        segments.push({
          speaker: 'host1',
          text: line.replace('HOST1:', '').trim(),
        });
      } else if (line.startsWith('HOST2:')) {
        segments.push({
          speaker: 'host2',
          text: line.replace('HOST2:', '').trim(),
        });
      }
    }

    // Estimate duration: ~150 words per minute, average 3 words per second
    const totalWords = segments.reduce((sum, seg) => sum + seg.text.split(/\s+/).length, 0);
    const estimatedDuration = Math.ceil((totalWords / 150) * 60);

    return { segments, estimatedDuration };
  }
}
```

### Phase 2: Text-to-Speech Synthesis

**Approach**: Use a TTS service to convert script to audio.

**TTS Options**:

1. **Google Cloud Text-to-Speech** (Recommended)

   - High-quality voices (WaveNet, Neural2)
   - Multiple voice options per gender
   - SSML support for prosody control
   - Pricing: ~$16 per 1M characters
   - Integration: REST API or client library

2. **ElevenLabs** (Premium Option)

   - Most natural-sounding voices
   - Voice cloning capabilities
   - Higher pricing (~$0.30 per 1K characters)
   - Great for production podcasts

3. **OpenAI TTS** (Alternative)
   - Good voice quality
   - Simple API
   - Moderate pricing
   - Limited voice options

**Recommended**: Start with Google Cloud TTS (consistency with existing AI stack)

**New Service: Podcast Audio Generator** (`src/app/audio/podcast-audio.service.ts`):

```typescript
import { Injectable } from '@angular/core';
import { Observable, from, forkJoin } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

import { PodcastScript, PodcastSegment } from './podcast-script.service';

export interface PodcastAudio {
  audioUrl: string;
  duration: number;
  fileSize: number;
}

@Injectable({
  providedIn: 'root',
})
export class PodcastAudioService {
  private readonly ttsClient: TextToSpeechClient;

  // Voice configuration
  private readonly voices = {
    host1: {
      languageCode: 'nl-NL', // Dutch
      name: 'nl-NL-Wavenet-B', // Male voice
      ssmlGender: 'MALE',
    },
    host2: {
      languageCode: 'nl-NL',
      name: 'nl-NL-Wavenet-A', // Female voice
      ssmlGender: 'FEMALE',
    },
  };

  constructor() {
    // Initialize Google Cloud TTS client
    this.ttsClient = new TextToSpeechClient({
      // Authentication via environment
    });
  }

  async generatePodcastAudio(script: PodcastScript, sessionId: string): Promise<PodcastAudio> {
    // Generate audio for each segment
    const audioSegments = await this.synthesizeSegments(script.segments);

    // Combine audio segments
    const combinedAudio = await this.combineAudioSegments(audioSegments);

    // Upload to Firebase Storage
    const audioUrl = await this.uploadToStorage(combinedAudio, sessionId);

    return {
      audioUrl,
      duration: script.estimatedDuration,
      fileSize: combinedAudio.length,
    };
  }

  private async synthesizeSegments(segments: PodcastSegment[]): Promise<Buffer[]> {
    const requests = segments.map((segment) => this.synthesizeSegment(segment));
    return Promise.all(requests);
  }

  private async synthesizeSegment(segment: PodcastSegment): Promise<Buffer> {
    const voice = this.voices[segment.speaker];

    const [response] = await this.ttsClient.synthesizeSpeech({
      input: { text: segment.text },
      voice: {
        languageCode: voice.languageCode,
        name: voice.name,
        ssmlGender: voice.ssmlGender as any,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0.0,
        volumeGainDb: 0.0,
      },
    });

    return Buffer.from(response.audioContent as Uint8Array);
  }

  private async combineAudioSegments(segments: Buffer[]): Promise<Buffer> {
    // Use ffmpeg or similar to combine audio segments
    // Add short pauses between speakers
    // This is simplified - actual implementation needs audio processing library

    return Buffer.concat(segments);
  }

  private async uploadToStorage(
    audio: Buffer,
    sessionId: string,
    version: number
  ): Promise<string> {
    // Upload to Firebase Storage
    // Path structure: /podcasts/{audioSessionId}/v{version}.mp3
    // Example: /podcasts/abc123/v1.mp3, /podcasts/abc123/v2.mp3
    // Each audio session (play date) has its own folder
    // Multiple versions within that folder

    const filePath = `podcasts/${sessionId}/v${version}.mp3`;
    // Upload audio buffer to Firebase Storage at filePath
    // Configure public access
    // Return public download URL
    return ''; // Implementation with Firebase Storage SDK
  }
}
```

### Phase 3: Data Model Updates

**Data Hierarchy**:

```
Campaign
  └── Audio Session (one per play date)
      ├── Story (one per session, can be regenerated)
      └── Podcasts[] (multiple versions per session)
          ├── v1
          ├── v2
          └── v3...
```

**Firestore Schema** (`audioSessions` collection):

Each audio session document represents one play date and contains:

- One story (can be regenerated with user corrections)
- Multiple podcast versions (array of podcasts, never overwritten)

```typescript
interface AudioSession {
  // ... existing fields (userId, title, date, story, transcript, etc.)

  // Podcast-specific fields
  podcasts?: PodcastVersion[]; // Array of all podcast versions for this session
  latestPodcastVersion?: number; // Quick reference to latest version number
}

interface PodcastVersion {
  version: number; // Sequential: 1, 2, 3, etc.
  createdAt: Timestamp;
  scriptGeneratedAt: Timestamp;
  audioGeneratedAt: Timestamp;
  audioUrl: string; // Firebase Storage URL: /podcasts/{sessionId}/v{version}.mp3
  duration: number; // seconds (target: ~1200 for 20 minutes)
  fileSize: number; // bytes (~20MB for 20-minute MP3)
  storyVersion?: number; // Which story version was used to generate this podcast
  script?: PodcastScript; // Optional: store script for debugging/regeneration
}
```

**Models** (`src/app/audio/audio-session.models.ts`):

```typescript
export interface PodcastVersion {
  version: number;
  createdAt: Date;
  scriptGeneratedAt: Date;
  audioGeneratedAt: Date;
  audioUrl: string;
  duration: number;
  fileSize: number;
  storyVersion?: number;
}

export interface AudioSession {
  // ... existing fields
  podcasts?: PodcastVersion[];
  latestPodcastVersion?: number;
}
```

### Phase 4: Component Updates

**Update Audio Session Component** (`src/app/audio/audio-session.component.ts`):

```typescript
export class AudioSessionComponent {
  // ... existing code

  // Podcast state
  podcasts = signal<PodcastVersion[]>([]);
  isGeneratingPodcast = signal(false);
  podcastGenerationProgress = signal<string>('');

  private readonly podcastScriptService = inject(PodcastScriptService);
  private readonly podcastAudioService = inject(PodcastAudioService);

  async generatePodcast() {
    if (!this.sessionId() || !this.generatedStory()) return;

    this.isGeneratingPodcast.set(true);
    this.podcastGenerationProgress.set('Generating podcast script...');

    try {
      // Step 1: Generate script
      const script = await firstValueFrom(
        this.podcastScriptService.generatePodcastScript(
          this.generatedStory()!,
          this.sessionTitle() || 'Untitled Session',
          this.sessionDate(),
          this.kankaContext() // If Kanka enabled
        )
      );

      this.podcastGenerationProgress.set('Synthesizing audio...');

      // Step 2: Generate audio
      const audio = await this.podcastAudioService.generatePodcastAudio(script, this.sessionId()!);

      this.podcastGenerationProgress.set('Saving podcast...');

      // Step 3: Save to Firestore
      const version = (this.podcasts().length || 0) + 1;
      const podcastVersion: PodcastVersion = {
        version,
        createdAt: new Date(),
        scriptGeneratedAt: new Date(),
        audioGeneratedAt: new Date(),
        audioUrl: audio.audioUrl,
        duration: audio.duration,
        fileSize: audio.fileSize,
        storyVersion: this.storyVersion(),
      };

      const docRef = doc(this.firestore, 'audioSessions', this.sessionId()!);
      await updateDoc(docRef, {
        podcasts: arrayUnion(podcastVersion),
        latestPodcastVersion: version,
      });

      // Update local state
      this.podcasts.update((p) => [...p, podcastVersion]);

      this.podcastGenerationProgress.set('Podcast ready!');
    } catch (error) {
      console.error('Failed to generate podcast:', error);
      this.podcastGenerationProgress.set('Failed to generate podcast');
    } finally {
      setTimeout(() => {
        this.isGeneratingPodcast.set(false);
        this.podcastGenerationProgress.set('');
      }, 2000);
    }
  }

  playPodcast(podcast: PodcastVersion) {
    // Open audio player or navigate to podcast player
  }

  downloadPodcast(podcast: PodcastVersion) {
    // Trigger download of MP3 file
    window.open(podcast.audioUrl, '_blank');
  }
}
```

**Add Podcast UI** (in audio-session.component.ts template):

```html
<!-- Podcast Generation Section (shown after story generation) -->
@if (generatedStory()) {
<div
  class="mt-8 p-6 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg"
>
  <div class="flex items-center justify-between mb-4">
    <div>
      <h3 class="text-lg font-semibold text-purple-900">🎙️ Session Podcast</h3>
      <p class="text-sm text-purple-700">
        Generate an entertaining audio recap with two hosts discussing the session
      </p>
    </div>
    <button
      (click)="generatePodcast()"
      [disabled]="isGeneratingPodcast()"
      class="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
    >
      @if (isGeneratingPodcast()) {
      <span class="flex items-center gap-2">
        <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
            fill="none"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span>{{ podcastGenerationProgress() }}</span>
      </span>
      } @else { Generate Podcast }
    </button>
  </div>

  <!-- Podcast Library -->
  @if (podcasts().length > 0) {
  <div class="mt-4 space-y-3">
    <h4 class="text-sm font-medium text-purple-900">
      Generated Podcasts ({{ podcasts().length }})
    </h4>
    @for (podcast of podcasts(); track podcast.version) {
    <div
      class="flex items-center gap-4 p-4 bg-white rounded-lg border border-purple-100 hover:border-purple-300 transition-colors"
    >
      <!-- Version badge -->
      <div class="flex-shrink-0">
        <span
          class="inline-flex items-center justify-center w-10 h-10 bg-purple-100 text-purple-700 rounded-full font-semibold text-sm"
        >
          v{{ podcast.version }}
        </span>
      </div>

      <!-- Podcast info -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-900">
            {{ sessionTitle() || 'Untitled Session' }} - Podcast v{{ podcast.version }}
          </span>
        </div>
        <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
          <span>{{ formatDuration(podcast.duration) }}</span>
          <span>•</span>
          <span>{{ formatFileSize(podcast.fileSize) }}</span>
          <span>•</span>
          <span>{{ formatDate(podcast.createdAt) }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2">
        <button
          (click)="playPodcast(podcast)"
          class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-sm font-medium"
        >
          ▶️ Play
        </button>
        <button
          (click)="downloadPodcast(podcast)"
          class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm font-medium"
        >
          ⬇️ Download
        </button>
      </div>
    </div>
    }
  </div>
  }
</div>
}
```

### Phase 5: Podcast Overview Page

**New Component: Podcast Library** (`src/app/audio/podcast-library.component.ts`):

Shows all audio sessions (play dates) with their podcast versions.

```typescript
import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { collection, query, where, getDocs, Firestore } from '@angular/fire/firestore';
import { AuthService } from '../auth/auth.service';

interface SessionWithPodcasts {
  sessionId: string; // Audio session ID (one per play date)
  sessionTitle: string;
  sessionDate: string; // The play date
  podcasts: PodcastVersion[]; // All podcast versions for this session
}

@Component({
  selector: 'app-podcast-library',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-7xl mx-auto px-4 py-8">
      <h1 class="text-3xl font-bold mb-8">🎙️ Podcast Library</h1>
      <p class="text-gray-600 mb-6">
        Browse all your session podcasts. Each play date is an audio session with its own story and
        versioned podcasts.
      </p>

      @if (loading()) {
      <div class="text-center py-12">
        <div
          class="animate-spin h-12 w-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"
        ></div>
        <p class="mt-4 text-gray-600">Loading podcasts...</p>
      </div>
      } @if (!loading() && sessions().length === 0) {
      <div class="text-center py-12 bg-gray-50 rounded-lg">
        <p class="text-gray-600">No podcasts generated yet.</p>
        <p class="text-sm text-gray-500 mt-2">
          Generate a podcast from a session story to see it here.
        </p>
      </div>
      } @if (!loading() && sessions().length > 0) {
      <div class="space-y-6">
        @for (session of sessions(); track session.sessionId) {
        <div class="bg-white border rounded-lg p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-xl font-semibold">{{ session.sessionTitle }}</h2>
              <p class="text-sm text-gray-500">Play date: {{ session.sessionDate }}</p>
            </div>
            <span class="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full">
              {{ session.podcasts.length }} version{{ session.podcasts.length > 1 ? 's' : '' }}
            </span>
          </div>

          <div class="space-y-3">
            @for (podcast of session.podcasts; track podcast.version) {
            <!-- Podcast card (similar to above) -->
            }
          </div>
        </div>
        }
      </div>
      }
    </div>
  `,
})
export class PodcastLibraryComponent implements OnInit {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);

  loading = signal(true);
  sessions = signal<SessionWithPodcasts[]>([]);

  async ngOnInit() {
    await this.loadPodcasts();
  }

  private async loadPodcasts() {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) return;

    // Query all audio sessions that have at least one podcast
    const sessionsRef = collection(this.firestore, 'audioSessions');
    const q = query(sessionsRef, where('userId', '==', userId), where('podcasts', '!=', null));

    const snapshot = await getDocs(q);
    const sessions: SessionWithPodcasts[] = [];

    // Each document is one audio session (play date) with potentially multiple podcast versions
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data['podcasts']?.length > 0) {
        sessions.push({
          sessionId: doc.id, // Audio session ID
          sessionTitle: data['title'] || 'Untitled Session',
          sessionDate: data['sessionDate'] || 'Unknown',
          podcasts: data['podcasts'], // All versions for this session
        });
      }
    });

    // Sort by date (most recent first)
    sessions.sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());

    this.sessions.set(sessions);
    this.loading.set(false);
  }
}
```

### Phase 6: Prompt Engineering

**New Prompt: Podcast Script Generator** (`src/app/prompts/podcast-script-generator.prompt.ts`):

```typescript
export const PODCAST_SCRIPT_GENERATOR_PROMPT = `You are a creative podcast script writer.
Your task is to convert a D&D session recap into an engaging podcast script with two hosts.

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

IMPORTANT RULES:
- The hosts KNOW this is from a tabletop RPG session, but DON'T explicitly say "D&D" or "Dungeons & Dragons"
- Use natural terms like "the adventure", "the story", "the campaign", "the party"
- Reference campaign context naturally (characters, locations, quests) without mentioning "Kanka" or "database"
- Keep segments short (1-3 sentences per speaker before switching)
- Make it entertaining and engaging
- Total length: approximately 20 minutes of dialogue (enough to cover all details thoroughly without being too long)

CONTENT FOCUS:
1. Session highlights and epic moments
2. Key decisions and their impact
3. Combat tactics and strategy
4. Character development and roleplay
5. Plot revelations and mysteries
6. Memorable quotes or funny moments
7. Theories about what comes next

FORMAT:
Output the script in this exact format:
HOST1: [dialogue]
HOST2: [dialogue]
HOST1: [dialogue]
...

EXAMPLE:
HOST1: Welcome back everyone! Today we're diving into what might be the most intense session yet.
HOST2: Oh absolutely! The party finally confronted Khuri-Khan, and let me tell you, it did NOT go as expected.
HOST1: Right? I thought for sure they'd try to negotiate, but instead...
HOST2: Instead they kicked down the door and went full combat mode! Classic.

PACING:
- Aim for approximately 20 minutes of dialogue
- This gives enough time to cover all important details thoroughly
- Don't rush through key moments
- Include tactical discussions, character motivations, and story implications
- Balance between entertainment and comprehensive coverage

Write the podcast script now based on the session story provided below.`;
```

## Implementation Steps

### Step 1: Podcast Script Service

- [ ] Create `src/app/audio/podcast-script.service.ts`
- [ ] Implement `generatePodcastScript()` method with Gemini
- [ ] Create `PodcastScript` and `PodcastSegment` interfaces
- [ ] Add script parsing logic (HOST1/HOST2 format)
- [ ] Test script generation with sample stories
- [ ] Handle errors gracefully

### Step 2: Podcast Prompt Engineering

- [ ] Create `src/app/prompts/podcast-script-generator.prompt.ts`
- [ ] Write prompt for conversational two-host format
- [ ] Test prompt with various story types
- [ ] Optimize for natural dialogue
- [ ] Ensure hosts don't explicitly mention "D&D" or "Kanka"
- [ ] Fine-tune length (target 20 minutes for thorough coverage)

### Step 3: TTS Integration

- [ ] Research TTS options (Google Cloud TTS, ElevenLabs, OpenAI)
- [ ] Set up Google Cloud TTS (recommended)
- [ ] Create `src/app/audio/podcast-audio.service.ts`
- [ ] Configure Dutch male/female voices
- [ ] Implement `synthesizeSegment()` for individual segments
- [ ] Implement `combineAudioSegments()` with pauses
- [ ] Test audio quality and naturalness

### Step 4: Audio Processing

- [ ] Set up audio processing library (ffmpeg or similar)
- [ ] Implement segment combining with appropriate pauses
- [ ] Add intro/outro music (optional)
- [ ] Optimize audio file size (compression, bitrate)
- [ ] Test on different devices/browsers

### Step 5: Firebase Storage Integration

- [ ] Update storage rules for podcast uploads
- [ ] Implement `uploadToStorage()` method
- [ ] Set up file naming convention: `/podcasts/{audioSessionId}/v{version}.mp3`
  - Each audio session (play date) gets its own folder
  - Each podcast version is a separate file within that folder
  - Example: `/podcasts/abc123/v1.mp3`, `/podcasts/abc123/v2.mp3`
- [ ] Configure public access URLs
- [ ] Test file upload and retrieval

### Step 6: Data Model Updates

- [ ] Update `AudioSession` interface with podcast fields (podcasts array)
- [ ] Create `PodcastVersion` interface
- [ ] Update Firestore schema (podcasts stored within audio session document)
- [ ] Update Firestore rules (users can add podcasts to their own sessions)
- [ ] Test versioning logic (each generation increments version number)
- [ ] Ensure podcasts are properly linked to their audio session

### Step 7: Component Updates

- [ ] Add podcast generation button to audio-session component
- [ ] Implement `generatePodcast()` method
- [ ] Add loading/progress states
- [ ] Display podcast library in session view
- [ ] Add play/download functionality
- [ ] Handle errors with user-friendly messages

### Step 8: Podcast Library Page

- [ ] Create `podcast-library.component.ts`
- [ ] Query all audio sessions that have podcasts
- [ ] Display sessions grouped by play date
- [ ] Show all podcast versions per session
- [ ] Add filtering by session date
- [ ] Add sorting options (date, session name)
- [ ] Embed audio player for each podcast version
- [ ] Add download functionality

### Step 9: Audio Player

- [ ] Implement inline audio player component
- [ ] Add playback controls (play/pause, seek, speed)
- [ ] Show current time and duration
- [ ] Add volume control
- [ ] Support keyboard shortcuts
- [ ] Remember playback position

### Step 10: Testing

- [ ] Test script generation with various stories
- [ ] Test TTS with different voice settings
- [ ] Test audio file generation and storage
- [ ] Test versioning (multiple podcasts per session)
- [ ] Test playback on different devices
- [ ] Test download functionality
- [ ] Load testing (large sessions, long podcasts)

### Step 11: Documentation

- [ ] Document podcast feature in README
- [ ] Add usage guide for podcast generation
- [ ] Document TTS configuration
- [ ] Document storage costs and considerations
- [ ] Create user guide with examples

## Configuration

### Environment Variables

Add to `src/environments/environment.ts`:

```typescript
export const environment = {
  // ... existing config
  podcast: {
    enabled: true,
    tts: {
      provider: 'google-cloud-tts',
      languageCode: 'nl-NL',
      voices: {
        male: 'nl-NL-Wavenet-B',
        female: 'nl-NL-Wavenet-A',
      },
      audioConfig: {
        encoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0.0,
      },
    },
    storage: {
      bucket: 'questmind-podcasts',
      path: 'podcasts',
    },
    limits: {
      maxDurationMinutes: 30,
      targetDurationMinutes: 20, // Target podcast length
      maxFileSizeMB: 50,
    },
  },
};
```

### Google Cloud TTS Setup

1. **Enable API**:

   - Go to Google Cloud Console
   - Enable Text-to-Speech API
   - Set up billing

2. **Authentication**:

   - Use existing Firebase service account
   - Or create dedicated service account
   - Download credentials JSON

3. **Voice Selection**:
   - Browse available Dutch voices at: https://cloud.google.com/text-to-speech/docs/voices
   - Test voices: https://cloud.google.com/text-to-speech#demo
   - Select WaveNet or Neural2 for best quality

## Benefits

1. **Engaging Format**: Audio is more entertaining than text
2. **Accessibility**: Easier to consume for some users
3. **Multi-tasking**: Can listen while doing other things (commute, chores)
4. **Novelty**: Unique feature that sets QuestMind apart
5. **Shareability**: Easy to share podcasts with party members
6. **Retention**: Audio format helps with campaign continuity
7. **Entertainment Value**: Two hosts add personality and humor
8. **Thorough Coverage**: 20 minutes allows all important details to be discussed without rushing

## Considerations

### Performance & Cost

**AI Costs**:

- Gemini API: ~$0.0001 per 1K characters (script generation)
- Google Cloud TTS: ~$16 per 1M characters (~$0.016 per 1K characters)
- Estimated cost per 20-minute podcast: $0.65-$1.35

**Storage Costs**:

- Firebase Storage: $0.026 per GB/month
- 20-minute MP3 (~20MB): ~$0.0005/month
- 100 podcasts: ~$0.05/month (negligible)

**Bandwidth Costs**:

- Firebase Storage download: $0.12 per GB
- 20MB download: ~$0.0024 per download
- 100 downloads: ~$0.24

**Total Estimated Cost**: $0.65-$1.35 per podcast generation, minimal storage/bandwidth costs

### Generation Time

- Script generation: 15-40 seconds (Gemini, longer for 20-minute scripts)
- TTS synthesis: 40-80 seconds (depends on length)
- Audio processing: 15-40 seconds
- Upload: 10-20 seconds
- **Total: 1.5-3 minutes per podcast**

### Audio Quality

- Use WaveNet or Neural2 voices for best quality
- Test different speaking rates for naturalness
- Add short pauses between speakers (0.3-0.5s)
- Consider background music (light, subtle)

### Storage Management

- Implement cleanup for old versions (optional)
- Monitor storage usage
- Consider compression for longer podcasts

### User Experience

- Show clear progress during generation
- Allow cancellation during generation
- Provide preview before finalizing
- Support regeneration if quality is poor

## Success Criteria

**Data Structure**:

- [ ] Each audio session (play date) can have multiple podcast versions
- [ ] Podcasts are stored within their audio session document
- [ ] Podcast versions never overwrite previous versions
- [ ] File structure follows pattern: `/podcasts/{audioSessionId}/v{version}.mp3`
- [ ] Podcast metadata correctly references its audio session

**Generation & Content**:

- [ ] Users can generate podcasts from session stories with one click
- [ ] Podcasts have two distinct hosts (male/female Dutch voices)
- [ ] Podcast duration is approximately 20 minutes
- [ ] Dialogue is natural and conversational
- [ ] Hosts don't explicitly mention "D&D" or "Kanka"
- [ ] Kanka context is used naturally in discussion
- [ ] All important session details are covered

**Versioning & Management**:

- [ ] Podcasts are versioned correctly (v1, v2, v3, etc.)
- [ ] Regenerating creates a new version, not overwriting
- [ ] Version numbers increment properly per audio session

**User Experience**:

- [ ] Users can play podcasts in the app with inline player
- [ ] Users can download podcasts as MP3 files
- [ ] Podcast library shows all audio sessions with their podcasts
- [ ] Library is organized by play date
- [ ] Version count is visible per session
- [ ] Generation time is acceptable (< 3 minutes)
- [ ] Progress is shown during generation
- [ ] Audio quality is good (clear, natural-sounding)
- [ ] Costs are reasonable (< $1.50 per podcast)

## Future Enhancements

1. **Voice Customization**: Let users choose from multiple voice options
2. **Background Music**: Add subtle background music and sound effects
3. **Intro/Outro**: Custom intros and outros with campaign theme
4. **Transcript**: Provide text transcript alongside audio
5. **Chapters**: Add chapter markers for different sections
6. **Social Sharing**: Share podcasts on social media or podcast platforms
7. **RSS Feed**: Generate RSS feed for podcast clients
8. **Multi-Language**: Support other languages beyond Dutch
9. **Custom Hosts**: Let users name the hosts or customize personalities
10. **Interactive**: Allow users to provide feedback on specific segments
11. **Highlights**: Auto-generate short highlight clips for sharing
12. **Playlist**: Create playlists of multiple session podcasts

## Related Features

- **Ticket 15**: User Corrections - Improved stories lead to better podcasts
- **Ticket 14**: Kanka Integration - Campaign context enriches podcast content
- **Session Story Service**: Source material for podcast generation
- **Audio Transcription Service**: Original transcription feeds the story

## Alternative Approaches Considered

### 1. Single Narrator

**Idea**: One narrator instead of two hosts

**Pros**: Simpler, cheaper, faster

**Cons**: Less engaging, less conversational, less entertaining, harder to maintain interest for 20 minutes

**Decision**: Two hosts provide better entertainment value and make 20-minute duration more engaging

### 2. Automatic Generation

**Idea**: Generate podcast automatically after story

**Pros**: No user action needed

**Cons**: Costs money, user might not want podcast, slower workflow

**Decision**: Manual generation gives users control

### 3. Video Podcast

**Idea**: Video with AI avatars instead of audio-only

**Pros**: More engaging visually

**Cons**: Much more expensive, larger files, more complex

**Decision**: Start with audio, consider video later

### 4. Live TTS

**Idea**: Generate audio on-the-fly during playback

**Pros**: No storage needed

**Cons**: Slower, can't download, internet required

**Decision**: Pre-generate and store for better UX

## Estimated Scope

- **Complexity**: Medium-High
- **Files Modified**:
  - `audio-session.component.ts` (podcast generation UI)
  - `audio-session.models.ts` (data models)
- **New Files**:
  - `podcast-script.service.ts` (script generation)
  - `podcast-audio.service.ts` (TTS and audio processing)
  - `podcast-library.component.ts` (podcast overview)
  - `podcast-script-generator.prompt.ts` (AI prompt)
- **Components**: 2 new services, 1 new component, 1 component update, 1 new prompt
- **Dependencies**: @google-cloud/text-to-speech, audio processing library (ffmpeg)
- **Infrastructure**: Google Cloud TTS API, Firebase Storage configuration
- **Testing**: Unit tests, integration tests, audio quality testing
- **Risk**: Medium (external TTS API dependency, audio processing complexity, costs)

## Implementation Summary

**Recommended Approach**: Generate podcast script with Gemini, synthesize with Google Cloud TTS, store in Firebase Storage

**Data Structure**:

- Each **play date** = one **audio session** document in Firestore
- Each audio session contains:
  - One **story** (can be regenerated with user corrections)
  - Multiple **podcast versions** (array, each generation adds a new version)
- Podcasts are stored as: `/podcasts/{audioSessionId}/v{version}.mp3`
- Podcast metadata lives in the audio session document

**Key Benefits**:

- ✅ Engaging audio format for session recaps
- ✅ Two-host conversational style
- ✅ Natural use of campaign context
- ✅ Versioned for iterative improvement
- ✅ Play and download functionality
- ✅ Podcast library for all sessions
- ✅ Reasonable costs and generation time

**Main Tasks**:

1. Create podcast script service with Gemini
2. Write podcast generation prompt
3. Integrate Google Cloud TTS
4. Implement audio processing and combining
5. Set up Firebase Storage for podcasts
6. Update data models for versioning
7. Add UI for podcast generation
8. Create podcast library page
9. Implement audio player
10. Test and optimize

**Estimated Effort**: Medium-High complexity, ~3-4 development sessions

---

**Status**: Draft  
**Priority**: Medium  
**Created**: 2026-02-02  
**Dependencies**: Ticket 15 (better stories), Ticket 14 (Kanka context)  
**Tech Stack**: Google Gemini (script), Google Cloud TTS (audio), Firebase Storage (hosting)
