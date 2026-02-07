# Ticket 17: Podcast MP3 Generation and Storage

## Overview

Verbeter het podcast generatie systeem door bij de "Genereer" knop een complete MP3 te maken en deze op te slaan in Firebase Storage, in plaats van live audio te genereren bij elke afspeel-actie. Dit zorgt voor herbruikbare podcasts die niet de TTS service belasten bij herhaald afspelen.

## Current State

**Huidige Workflow** (Ticket 16 implementatie):

1. **Genereer Podcast** knop → Script wordt gemaakt
2. **Afspeel** knop → Audio wordt live gegenereerd:
   - Voor elk segment wordt Google Cloud TTS API aangeroepen
   - Audio wordt direct in browser afgespeeld
   - Geen opslag van audio
   - Bij elke afspeel-actie opnieuw TTS calls
   - Gebruikt oudere Google Cloud TTS (minder natuurlijk)

**Huidige Bestanden**:

- `podcast-script.service.ts`: Genereert podcast script met Gemini
- `podcast-audio.service.ts`: Speelt live audio af via Google Cloud TTS
- Script wordt opgeslagen in Firestore
- Audio wordt NIET opgeslagen

**Beperkingen**:

1. **TTS Kosten**: Bij elk afspelen worden TTS API calls gemaakt
2. **Langzame Start**: Gebruiker moet wachten op eerste segment synthesis
3. **Internet Vereist**: Kan niet offline afspelen
4. **Geen Download**: Gebruiker kan audio niet downloaden
5. **Inconsistente Playback**: Elke keer potentieel net iets anders
6. **Network Afhankelijk**: Bij slechte verbinding haperende audio

## Problem Statement

De huidige live-TTS aanpak heeft verschillende nadelen:

1. **Kosten**: Elke afspeel-actie kost geld (TTS API calls)
2. **Gebruikerservaring**: Wachten op synthesis per segment
3. **Geen Portabiliteit**: Kan audio niet delen of offline gebruiken
4. **Belasting**: TTS service wordt onnodig vaak aangeroepen
5. **Betrouwbaarheid**: Afhankelijk van real-time API beschikbaarheid

**Gewenste Situatie**:

- Eenmalige audio generatie bij "Genereer" knop
- Complete MP3 opgeslagen in Firebase Storage
- Direct afspelen of downloaden zonder extra TTS calls
- Herbruikbare, consistente audio bestanden

## Proposed Solution

Verander de workflow zodat de "Genereer" knop zowel het script als de audio genereert:

### Nieuwe Workflow

1. **Gebruiker klikt "Genereer Podcast"**:

   - ✅ Script generatie (Gemini API)
   - ✨ **NIEUW**: Complete MP3 generatie (Gemini 2.5 TTS - natuurlijkere stemmen)
   - ✨ **NIEUW**: Upload MP3 naar Firebase Storage
   - ✨ **NIEUW**: Opslaan van audio URL in Firestore

2. **Gebruiker klikt "Afspelen"**:

   - ✅ Speel opgeslagen MP3 af (geen TTS calls)
   - Native HTML5 audio player

3. **Gebruiker klikt "Download"**:
   - ✅ Download MP3 bestand direct

### Voordelen

✅ **Kostenbesparend**: TTS wordt slechts 1x gebruikt per podcast versie  
✅ **Sneller**: Direct afspelen zonder wachten op synthesis  
✅ **Offline**: MP3 kan gedownload worden voor offline gebruik  
✅ **Deelbaar**: MP3 URL kan gedeeld worden met andere spelers  
✅ **Betrouwbaar**: Geen dependency op real-time TTS beschikbaarheid  
✅ **Consistentie**: Dezelfde audio elke keer  
✅ **Natuurlijkere stemmen**: Gemini 2.5 TTS klinkt veel natuurlijker dan Google Cloud TTS  
✅ **Betere prosodie**: Natuurlijke intonatie en spraakritme

## Technical Implementation

### Why Gemini 2.5 TTS?

**Gemini 2.5 TTS vs Google Cloud TTS**:

| Feature            | Google Cloud TTS  | Gemini 2.5 TTS                              |
| ------------------ | ----------------- | ------------------------------------------- |
| **Natuurlijkheid** | Goed (WaveNet)    | Uitstekend - veel natuurlijker              |
| **Prosodie**       | Synthetisch       | Menselijk - natuurlijke intonatie           |
| **Emotie**         | Beperkt           | Rijk - betere emotionele expressie          |
| **Context begrip** | Geen              | Ja - begrijpt context voor betere uitspraak |
| **Prijs**          | $16/1M characters | Vergelijkbaar of goedkoper                  |
| **Stemmen**        | Beperkt           | Puck (male NL), Aoede (female NL)           |
| **Kwaliteit**      | Professioneel     | State-of-the-art AI                         |

**Waarom Gemini 2.5 TTS kiezen**:

1. **Veel natuurlijker klinkend**: Gemini 2.5 gebruikt geavanceerde AI voor hyperrealistische stemmen
2. **Betere conversationele flow**: Begrijpt context en past intonatie aan
3. **Emotionele intelligentie**: Kan enthousiasme, nieuwsgierigheid en andere emoties natuurlijk overbrengen
4. **Native Dutch support**: Puck en Aoede zijn native Dutch voices met perfect accent
5. **Toekomstbestendig**: Nieuwste AI technologie van Google

**Voor podcasts is dit cruciaal**: De conversatie tussen twee hosts moet natuurlijk klinken, niet als robots die praten.

**Opmerking**: De exacte Gemini 2.5 TTS API syntax en voice names (zoals 'Puck' en 'Aoede') moeten geverifieerd worden in de actuele Gemini API documentatie. De onderstaande code is gebaseerd op de verwachte API structuur.

### Phase 1: MP3 Generation in Backend/Cloud Function

**Probleem**: Browser kan geen lange MP3 bestanden maken en uploaden  
**Oplossing**: Firebase Cloud Function of backend service

**Optie A: Firebase Cloud Function** (Aanbevolen):

```typescript
// functions/src/generate-podcast-audio.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import * as ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface PodcastGenerationRequest {
  sessionId: string;
  version: number;
  script: {
    segments: Array<{
      speaker: 'host1' | 'host2';
      text: string;
    }>;
    estimatedDuration: number;
  };
}

export const generatePodcastAudio = functions
  .runWith({
    timeoutSeconds: 540, // 9 minutes max
    memory: '2GB',
  })
  .https.onCall(async (data: PodcastGenerationRequest, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { sessionId, version, script } = data;

    try {
      // 1. Generate audio segments using Gemini 2.5 TTS (more natural voices)
      const genAI = new GoogleGenAI({ apiKey: functions.config().google.ai_api_key });
      const tempDir = os.tmpdir();
      const segmentFiles: string[] = [];

      for (let i = 0; i < script.segments.length; i++) {
        const segment = script.segments[i];

        // Gemini 2.5 voice options (natural sounding Dutch voices)
        const voiceConfig =
          segment.speaker === 'host1'
            ? { voice: 'Puck', language: 'nl' } // Male Dutch voice
            : { voice: 'Aoede', language: 'nl' }; // Female Dutch voice

        // Synthesize segment with Gemini 2.5 TTS
        const response = await genAI.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: segment.text,
                  inlineData: {
                    mimeType: 'text/plain',
                    data: segment.text,
                  },
                },
              ],
            },
          ],
          config: {
            audioConfig: {
              voiceConfig: voiceConfig,
              speakingRate: 1.0,
              audioEncoding: 'mp3',
            },
          },
        });

        // Extract audio from response
        const audioContent = response.audioData; // Base64 encoded MP3

        // Save segment to temp file
        const segmentPath = path.join(tempDir, `segment-${i}.mp3`);
        fs.writeFileSync(segmentPath, Buffer.from(audioContent, 'base64'));
        segmentFiles.push(segmentPath);
      }

      // 2. Combine segments with ffmpeg
      const outputPath = path.join(tempDir, `podcast-${sessionId}-v${version}.mp3`);
      await combineAudioSegments(segmentFiles, outputPath);

      // 3. Upload to Firebase Storage
      const storage = new Storage();
      const bucket = storage.bucket('gs://questmind-app.firebasestorage.app');
      const storagePath = `users/${userId}/podcasts/${sessionId}/v${version}.mp3`;

      await bucket.upload(outputPath, {
        destination: storagePath,
        metadata: {
          contentType: 'audio/mpeg',
          metadata: {
            sessionId,
            version: version.toString(),
            userId,
          },
        },
      });

      // Make file publicly readable
      const file = bucket.file(storagePath);
      await file.makePublic();

      // Get public URL
      const audioUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      // Get file stats
      const stats = fs.statSync(outputPath);
      const fileSize = stats.size;

      // 4. Update Firestore with audio URL
      const db = admin.firestore();
      const sessionRef = db.doc(`users/${userId}/audioSessions/${sessionId}`);
      const sessionDoc = await sessionRef.get();

      if (!sessionDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Session not found');
      }

      const podcasts = sessionDoc.data()?.podcasts || [];
      const podcastIndex = podcasts.findIndex((p: any) => p.version === version);

      if (podcastIndex === -1) {
        throw new functions.https.HttpsError('not-found', 'Podcast version not found');
      }

      // Update podcast with audio info
      podcasts[podcastIndex] = {
        ...podcasts[podcastIndex],
        audioUrl,
        fileSize,
        audioGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'completed',
      };

      await sessionRef.update({
        podcasts,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 5. Cleanup temp files
      segmentFiles.forEach((file) => fs.unlinkSync(file));
      fs.unlinkSync(outputPath);

      return {
        success: true,
        audioUrl,
        fileSize,
        duration: script.estimatedDuration,
      };
    } catch (error) {
      console.error('Error generating podcast audio:', error);
      throw new functions.https.HttpsError('internal', 'Failed to generate podcast audio');
    }
  });

/**
 * Combine audio segments with pauses between speakers
 */
async function combineAudioSegments(segmentFiles: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg();

    // Add all segments with small pauses
    segmentFiles.forEach((file) => {
      command.input(file);
    });

    // Create filter for concatenation with crossfades
    const filterComplex =
      segmentFiles.map((_, i) => `[${i}:a]`).join('') +
      `concat=n=${segmentFiles.length}:v=0:a=1[out]`;

    command
      .complexFilter(filterComplex)
      .map('[out]')
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}
```

**Deployment**:

```bash
# Install dependencies
cd functions
npm install @google/genai @google-cloud/storage fluent-ffmpeg

# Deploy function
firebase deploy --only functions:generatePodcastAudio
```

**package.json updates**:

```json
{
  "engines": {
    "node": "18"
  },
  "dependencies": {
    "@google/genai": "^0.21.0",
    "@google-cloud/storage": "^7.0.0",
    "fluent-ffmpeg": "^2.1.2",
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  }
}
```

### Phase 2: Update Frontend Services

**Update `podcast-audio.service.ts`**:

```typescript
import { Injectable, inject } from '@angular/core';
import { getFunctions, httpsCallable } from '@angular/fire/functions';
import { PodcastScript, PodcastVersion } from './audio-session.models';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PodcastAudioService {
  private readonly functions = getFunctions();

  /**
   * Generate complete podcast MP3 file via Cloud Function
   * This replaces the live TTS approach
   */
  async generatePodcastMP3(
    sessionId: string,
    version: number,
    script: PodcastScript,
    onProgress?: (progress: number, message: string) => void
  ): Promise<{ audioUrl: string; fileSize: number; duration: number }> {
    if (onProgress) {
      onProgress(0, 'Starting audio generation...');
    }

    try {
      // Call Cloud Function to generate MP3
      const generateAudio = httpsCallable<any, any>(this.functions, 'generatePodcastAudio');

      if (onProgress) {
        onProgress(20, 'Synthesizing audio segments...');
      }

      const result = await generateAudio({
        sessionId,
        version,
        script: {
          segments: script.segments,
          estimatedDuration: script.estimatedDuration,
        },
      });

      if (onProgress) {
        onProgress(80, 'Uploading to storage...');
      }

      if (!result.data.success) {
        throw new Error('Failed to generate audio');
      }

      if (onProgress) {
        onProgress(100, 'Complete!');
      }

      return {
        audioUrl: result.data.audioUrl,
        fileSize: result.data.fileSize,
        duration: result.data.duration,
      };
    } catch (error) {
      console.error('Error generating podcast MP3:', error);
      throw new Error('Failed to generate podcast audio. Please try again.');
    }
  }

  /**
   * Play an MP3 from URL
   */
  playPodcastMP3(audioUrl: string): HTMLAudioElement {
    const audio = new Audio(audioUrl);
    audio.play();
    return audio;
  }

  /**
   * Download MP3 file
   */
  downloadPodcastMP3(audioUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = filename;
    link.click();
  }
}
```

### Phase 3: Update Component

**Update `audio-session.component.ts`**:

```typescript
async generatePodcast() {
  if (!this.sessionId() || !this.generatedStory()) return;

  this.isGeneratingPodcast.set(true);
  this.podcastGenerationProgress.set('Generating podcast script...');
  this.podcastGenerationProgressPercent.set(0);

  try {
    // Step 1: Generate script (10-30% of time)
    const script = await firstValueFrom(
      this.podcastScriptService.generatePodcastScript(
        this.generatedStory()!,
        this.sessionTitle() || 'Untitled Session',
        this.sessionDate(),
        this.useKankaContext()
      )
    );

    this.podcastGenerationProgress.set('Script generated. Creating audio...');
    this.podcastGenerationProgressPercent.set(30);

    // Step 2: Generate MP3 (30-90% of time)
    const nextVersion = (this.podcasts()?.length || 0) + 1;

    const audioResult = await this.podcastAudioService.generatePodcastMP3(
      this.sessionId()!,
      nextVersion,
      script,
      (progress, message) => {
        // Progress callback from Cloud Function
        const adjustedProgress = 30 + (progress * 0.6); // Map 0-100 to 30-90
        this.podcastGenerationProgressPercent.set(adjustedProgress);
        this.podcastGenerationProgress.set(message);
      }
    );

    this.podcastGenerationProgress.set('Saving podcast metadata...');
    this.podcastGenerationProgressPercent.set(95);

    // Step 3: Podcast is already saved by Cloud Function, just update local state
    // The Cloud Function updates Firestore directly

    // Reload session data to get updated podcast
    await this.loadSessionData();

    this.podcastGenerationProgress.set('Podcast ready!');
    this.podcastGenerationProgressPercent.set(100);

  } catch (error) {
    console.error('Failed to generate podcast:', error);
    this.podcastGenerationProgress.set('Failed to generate podcast');
    this.errorMessage.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    setTimeout(() => {
      this.isGeneratingPodcast.set(false);
      this.podcastGenerationProgress.set('');
      this.podcastGenerationProgressPercent.set(0);
    }, 2000);
  }
}

/**
 * Play podcast from stored MP3
 */
playPodcast(podcast: PodcastVersion) {
  if (!podcast.audioUrl) {
    this.errorMessage.set('Audio not available for this podcast version');
    return;
  }

  // Stop any currently playing audio
  this.stopPodcast();

  // Play the MP3
  this.currentAudio = this.podcastAudioService.playPodcastMP3(podcast.audioUrl);
  this.currentlyPlayingVersion.set(podcast.version);
}

/**
 * Stop podcast playback
 */
stopPodcast() {
  if (this.currentAudio) {
    this.currentAudio.pause();
    this.currentAudio.currentTime = 0;
    this.currentAudio = null;
  }
  this.currentlyPlayingVersion.set(null);
}

/**
 * Download podcast MP3
 */
downloadPodcast(podcast: PodcastVersion) {
  if (!podcast.audioUrl) {
    this.errorMessage.set('Audio not available for download');
    return;
  }

  const filename = `${this.sessionTitle() || 'podcast'}-v${podcast.version}.mp3`;
  this.podcastAudioService.downloadPodcastMP3(podcast.audioUrl, filename);
}
```

### Phase 4: Update Data Model

**Update `audio-session.models.ts`**:

```typescript
export interface PodcastVersion {
  version: number;
  createdAt: Date;
  scriptGeneratedAt: Date;
  audioGeneratedAt?: Date; // Now populated when MP3 is created
  audioUrl?: string; // Firebase Storage URL to MP3
  duration: number; // seconds
  fileSize?: number; // bytes
  storyVersion?: number;
  script?: PodcastScript;
  status: 'generating_script' | 'generating_audio' | 'completed' | 'failed';
}
```

### Phase 5: Firebase Storage Rules

**Update `storage.rules`**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Podcast files
    match /users/{userId}/podcasts/{sessionId}/{filename} {
      // Users can read their own podcasts
      allow read: if request.auth != null && request.auth.uid == userId;

      // Cloud Functions can write
      allow write: if request.auth != null;

      // Public read access for sharing (optional)
      allow read: if true; // Remove if podcasts should be private
    }
  }
}
```

### Phase 6: Update UI

**Progress Bar tijdens generatie**:

```html
<!-- In audio-session.component.ts template -->
@if (isGeneratingPodcast()) {
<div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
  <div class="flex items-center justify-between mb-2">
    <span class="text-sm font-medium text-blue-900">{{ podcastGenerationProgress() }}</span>
    <span class="text-sm text-blue-700">{{ podcastGenerationProgressPercent() }}%</span>
  </div>
  <div class="w-full bg-blue-200 rounded-full h-2">
    <div
      class="bg-blue-600 h-2 rounded-full transition-all duration-300"
      [style.width.%]="podcastGenerationProgressPercent()"
    ></div>
  </div>
  <p class="text-xs text-blue-600 mt-2">
    Dit kan 2-3 minuten duren. De complete MP3 wordt gegenereerd en opgeslagen.
  </p>
</div>
}
```

**Audio Player met Controls**:

```html
<!-- Podcast list item -->
<div class="flex items-center gap-4 p-4 bg-white rounded-lg border">
  <!-- Version badge -->
  <span
    class="w-10 h-10 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center font-semibold"
  >
    v{{ podcast.version }}
  </span>

  <!-- Podcast info -->
  <div class="flex-1">
    <div class="font-medium">{{ sessionTitle() }} - v{{ podcast.version }}</div>
    <div class="text-xs text-gray-500">
      {{ formatDuration(podcast.duration) }} • {{ formatFileSize(podcast.fileSize) }} • {{
      formatDate(podcast.createdAt) }}
    </div>
  </div>

  <!-- Actions -->
  <div class="flex items-center gap-2">
    @if (currentlyPlayingVersion() === podcast.version) {
    <button
      (click)="stopPodcast()"
      class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
    >
      ⏹️ Stop
    </button>
    } @else {
    <button
      (click)="playPodcast(podcast)"
      class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
      [disabled]="!podcast.audioUrl"
    >
      ▶️ Afspelen
    </button>
    }

    <button
      (click)="downloadPodcast(podcast)"
      class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
      [disabled]="!podcast.audioUrl"
    >
      ⬇️ Download
    </button>
  </div>
</div>
```

## Implementation Steps

### Step 1: Cloud Function Setup

- [ ] Create `functions` directory if not exists
- [ ] Initialize Firebase Functions project
- [ ] Install dependencies (@google/genai for Gemini 2.5 TTS, Storage, ffmpeg)
- [ ] Configure Gemini API key in Firebase Functions config
- [ ] Implement `generatePodcastAudio` Cloud Function with Gemini 2.5 TTS
- [ ] Test Gemini 2.5 TTS voice quality (Puck and Aoede)
- [ ] Test locally with Firebase Emulator
- [ ] Deploy to Firebase

### Step 2: Update Frontend Services

- [ ] Update `podcast-audio.service.ts` to call Cloud Function
- [ ] Remove live TTS synthesis code
- [ ] Add MP3 playback methods
- [ ] Add download functionality
- [ ] Test Cloud Function integration

### Step 3: Update Component

- [ ] Update `generatePodcast()` method to use new service
- [ ] Add progress tracking for Cloud Function
- [ ] Update `playPodcast()` to use MP3 URL
- [ ] Update `downloadPodcast()` method
- [ ] Add audio player controls

### Step 4: Update Data Model

- [ ] Add `audioUrl` field to `PodcastVersion`
- [ ] Add `status` field for tracking generation state
- [ ] Update Firestore schema
- [ ] Update TypeScript interfaces

### Step 5: Firebase Configuration

- [ ] Update Storage rules for podcast files
- [ ] Configure Cloud Function permissions
- [ ] Set up Storage bucket CORS if needed
- [ ] Test file access permissions

### Step 6: UI Improvements

- [ ] Add progress bar during generation
- [ ] Show audio player controls
- [ ] Display file size and duration
- [ ] Add error handling UI
- [ ] Test responsive design

### Step 7: Testing

- [ ] Test complete generation workflow with Gemini 2.5 TTS
- [ ] Verify Gemini 2.5 TTS API availability and voice quality
- [ ] Compare audio quality: Gemini 2.5 vs Google Cloud TTS (if needed)
- [ ] Test Dutch voice quality (Puck and Aoede)
- [ ] Test conversational naturalness between hosts
- [ ] Test MP3 playback
- [ ] Test download functionality
- [ ] Test error scenarios
- [ ] Test on different devices/browsers
- [ ] Load test with multiple generations

### Step 8: Migration

- [ ] Migrate existing podcasts (if any)
- [ ] Update documentation
- [ ] Notify users of new functionality

## Configuration

### Environment Variables

**Frontend** (`environment.ts`):

```typescript
export const environment = {
  // ... existing config
  podcast: {
    cloudFunctionUrl: 'https://europe-west1-questmind-app.cloudfunctions.net/generatePodcastAudio',
  },
};
```

**Cloud Function** (environment variables in Firebase Console):

```
GOOGLE_CLOUD_PROJECT=questmind-app
GCLOUD_PROJECT=questmind-app
```

### Firebase Functions Configuration

```bash
# Set region
firebase functions:config:set region.default=europe-west1

# Deploy
firebase deploy --only functions
```

## Cost Analysis

### Before (Live TTS per playback):

- **TTS Cost per play**: $0.80 (assuming 20 min podcast, ~4000 words)
- **10 plays**: $8.00
- **100 plays**: $80.00
- **Storage**: $0
- **Bandwidth**: $0

### After (Single MP3 generation):

- **TTS Cost (one time)**: $0.80
- **10 plays**: $0.80 (no additional cost)
- **100 plays**: $0.80 (no additional cost)
- **Storage (20 MB)**: ~$0.0005/month (negligible)
- **Bandwidth (100 downloads)**: ~$0.24

**Savings**: $79.20 over 100 plays (99% cost reduction)

### Generation Time Estimate

- Script generation: 20-40 seconds
- Audio synthesis: 60-120 seconds (all segments)
- Audio combining: 10-20 seconds
- Upload: 5-15 seconds
- **Total: 2-3 minutes**

## Benefits

1. ✅ **Massive Cost Savings**: 99% reduction in TTS costs
2. ✅ **Better UX**: Instant playback, no waiting
3. ✅ **Offline Support**: Can download and listen offline
4. ✅ **Shareable**: Can share MP3 URL with others
5. ✅ **Reliable**: No dependency on real-time API
6. ✅ **Consistent**: Same audio every time
7. ✅ **Professional**: Complete audio file like real podcasts
8. ✅ **Superior Audio Quality**: Gemini 2.5 TTS voices are state-of-the-art natural
9. ✅ **Natural Conversations**: Hosts sound like real people having a conversation
10. ✅ **Emotional Expression**: Better enthusiasm, curiosity, and natural intonation

## Considerations

### Storage Costs

- 20-minute MP3 ≈ 20 MB
- 100 podcasts = 2 GB
- Storage cost: ~$0.05/month (negligible)

### Generation Time

- 2-3 minutes per podcast
- Users must wait, but only once
- Show clear progress indication

### Error Handling

- Cloud Function timeout: 9 minutes max
- Retry logic for failed generations
- Clean up temp files
- Handle partial uploads

### Scalability

- Cloud Functions auto-scale
- Storage bandwidth auto-scales
- Monitor costs with usage alerts

## Success Criteria

- [ ] "Genereer" knop maakt complete MP3 met Gemini 2.5 TTS
- [ ] MP3 wordt opgeslagen in Firebase Storage
- [ ] "Afspelen" knop gebruikt opgeslagen MP3
- [ ] "Download" knop werkt correct
- [ ] Geen TTS calls bij herhaald afspelen
- [ ] Generatie duurt < 4 minuten
- [ ] Kosten per podcast < $1
- [ ] Audio kwaliteit is uitstekend (natuurlijke stemmen)
- [ ] Hosts klinken als échte mensen in conversatie
- [ ] Nederlandse uitspraak is perfect (Puck en Aoede voices)
- [ ] Emotionele expressie is natuurlijk en passend
- [ ] Geen errors bij normale usage

## Alternative Approaches Considered

### Option 1: Client-side MP3 Generation

**Pros**: No server needed  
**Cons**: Browser can't handle long MP3 generation, memory issues, no upload capability

**Decision**: Not feasible for 20-minute podcasts

### Option 2: Third-party Audio Service

**Pros**: Specialized service, less code  
**Cons**: Extra dependency, vendor lock-in, higher costs

**Decision**: Cloud Functions give us full control

### Option 3: Keep Live TTS

**Pros**: No storage needed  
**Cons**: High costs, poor UX, not shareable

**Decision**: Storage-based approach is much better

## Related Features

- **Ticket 16**: Session Podcast Recap Generator (basis implementatie)
- **Audio Session Component**: Hosts podcast generation UI
- **Firebase Storage**: Hosts MP3 files
- **Cloud Functions**: Server-side audio generation

## Future Enhancements

1. **Background Music**: Add subtle background music to MP3
2. **Intro/Outro**: Add campaign-specific intro and outro
3. **Chapters**: Add chapter markers in MP3
4. **Transcripts**: Generate text transcript from script
5. **RSS Feed**: Create podcast RSS feed for podcast apps
6. **Social Sharing**: Share podcast on social media
7. **Quality Options**: Let users choose audio quality (128k/256k)
8. **Progress Tracking**: Remember playback position
9. **Voice Customization**: Let users choose from different Gemini 2.5 voices
10. **Emotional Control**: Fine-tune emotional expression per segment
11. **Voice Cloning**: Use custom voice clones for personalized hosts

## Estimated Scope

- **Complexity**: Medium
- **New Files**:
  - `functions/src/generate-podcast-audio.ts` (Cloud Function)
  - `functions/package.json` (dependencies)
- **Modified Files**:
  - `podcast-audio.service.ts` (use Cloud Function instead of live TTS)
  - `audio-session.component.ts` (update UI and workflow)
  - `audio-session.models.ts` (add audioUrl field)
  - `storage.rules` (add podcast storage rules)
- **Dependencies**:
  - @google/genai (for Gemini 2.5 TTS)
  - @google-cloud/storage
  - fluent-ffmpeg
- **Infrastructure**: Firebase Cloud Functions, Firebase Storage, Gemini 2.5 TTS API
- **Testing**: Integration testing, audio quality testing, cost testing, performance testing
- **Risk**: Medium (Cloud Function complexity, ffmpeg setup, Gemini TTS API availability)

## Implementation Priority

**Priority**: High

**Rationale**:

- Current live-TTS approach is expensive
- Poor user experience with delays
- Storage-based approach is industry standard
- Will save significant costs with scale

## Status

**Status**: Draft  
**Priority**: High  
**Created**: 2026-02-02  
**Dependencies**: Ticket 16 (basis implementatie)  
**Tech Stack**: Firebase Cloud Functions, Gemini 2.5 TTS API, Firebase Storage, ffmpeg
