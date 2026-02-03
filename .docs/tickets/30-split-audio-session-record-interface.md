# Split AudioSessionRecord into Focused Interfaces

**Priority:** HIGH
**Estimated Effort:** 3 days
**Code Review Issue:** #4 (Interface Segregation Principle)

## Problem

`AudioSessionRecord` is a "fat interface" with 21 properties, many optional and only used in specific contexts:

```typescript
export interface AudioSessionRecord extends SessionStory {
  campaignId: string;
  ownerId: string;
  ownerEmail: string;
  createdBy: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  updatedAt: string;
  transcription?: TranscriptionResult;        // Only after transcription
  storageMetadata?: StorageMetadata;          // Only after upload
  storagePath?: string;                       // Only after upload
  fileSize?: number;                          // Only after upload
  contentType?: string;                       // Only after upload
  activeTranscriptionId?: string;             // Only during transcription
  transcriptions?: TranscriptionRecord[];     // History feature
  userCorrections?: string;                   // Only when user provides
  correctionsUpdatedAt?: string;              // Only when user provides
  storyRegeneratedAt?: string;                // Only after regeneration
  storyRegenerationCount?: number;            // Only after regeneration
  podcasts?: PodcastVersion[];                // Only after podcast generation
  latestPodcastVersion?: number;              // Only after podcast generation
}
```

## Impact

- Components depend on properties they don't use
- No type safety for state transitions
- Hard to reason about what's available when
- Violates Interface Segregation Principle

## Solution

Split into focused interfaces representing state transitions.

### Implementation Steps

#### 1. Create Base Interface

```typescript
// src/app/audio/models/base-audio-session.ts

export type SessionStatus = 'uploading' | 'processing' | 'completed' | 'failed';

/**
 * Base audio session - minimal properties always present
 */
export interface BaseAudioSession {
  id: string;
  campaignId: string;
  ownerId: string;
  ownerEmail: string;
  createdBy: string;
  title: string;
  sessionDate?: string;
  audioFileName: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
}
```

#### 2. Create Upload State Interface

```typescript
// src/app/audio/models/uploaded-session.ts

import { BaseAudioSession } from './base-audio-session';
import { StorageMetadata } from '../audio-session.models';

/**
 * Session after successful upload
 * Guarantees storage metadata is present
 */
export interface UploadedSession extends BaseAudioSession {
  status: 'completed' | 'processing';
  storageMetadata: StorageMetadata;
  storagePath: string;
  storageUrl: string;
  fileSize: number;
  contentType: string;
}

/**
 * Type guard to check if session is uploaded
 */
export function isUploadedSession(session: BaseAudioSession): session is UploadedSession {
  return !!(session as UploadedSession).storageMetadata;
}
```

#### 3. Create Transcription State Interface

```typescript
// src/app/audio/models/transcribed-session.ts

import { UploadedSession } from './uploaded-session';
import { TranscriptionResult, TranscriptionRecord } from '../audio-session.models';

/**
 * Session after successful transcription
 * Guarantees transcription data is present
 */
export interface TranscribedSession extends UploadedSession {
  transcription: TranscriptionResult;
  activeTranscriptionId: string;
  transcriptions?: TranscriptionRecord[]; // History
}

/**
 * Type guard to check if session is transcribed
 */
export function isTranscribedSession(
  session: BaseAudioSession
): session is TranscribedSession {
  return !!(session as TranscribedSession).transcription;
}
```

#### 4. Create Story State Interface

```typescript
// src/app/audio/models/session-with-story.ts

import { TranscribedSession } from './transcribed-session';

/**
 * Session with generated story
 * Guarantees story content is present
 */
export interface SessionWithStory extends TranscribedSession {
  content: string;
  userCorrections?: string;
  correctionsUpdatedAt?: string;
  storyRegenerationCount?: number;
  storyRegeneratedAt?: string;
}

/**
 * Type guard to check if session has story
 */
export function hasStory(session: BaseAudioSession): session is SessionWithStory {
  return !!(session as SessionWithStory).content;
}
```

#### 5. Create Podcast State Interface

```typescript
// src/app/audio/models/session-with-podcasts.ts

import { SessionWithStory } from './session-with-story';
import { PodcastVersion } from '../audio-session.models';

/**
 * Session with generated podcasts
 * Guarantees at least one podcast is present
 */
export interface SessionWithPodcasts extends SessionWithStory {
  podcasts: PodcastVersion[];
  latestPodcastVersion: number;
}

/**
 * Type guard to check if session has podcasts
 */
export function hasPodcasts(session: BaseAudioSession): session is SessionWithPodcasts {
  const podcasts = (session as SessionWithPodcasts).podcasts;
  return !!(podcasts && podcasts.length > 0);
}
```

#### 6. Create Union Type for Backward Compatibility

```typescript
// src/app/audio/models/audio-session.ts

import { BaseAudioSession } from './base-audio-session';
import { UploadedSession } from './uploaded-session';
import { TranscribedSession } from './transcribed-session';
import { SessionWithStory } from './session-with-story';
import { SessionWithPodcasts } from './session-with-podcasts';

/**
 * Union type representing any valid session state
 * Use this for backward compatibility during migration
 */
export type AudioSession =
  | BaseAudioSession
  | UploadedSession
  | TranscribedSession
  | SessionWithStory
  | SessionWithPodcasts;

/**
 * Legacy type alias for gradual migration
 * @deprecated Use specific session types instead
 */
export type AudioSessionRecord = AudioSession & {
  // All optional properties for backward compatibility
  storageMetadata?: any;
  storagePath?: string;
  storageUrl?: string;
  fileSize?: number;
  contentType?: string;
  transcription?: any;
  activeTranscriptionId?: string;
  transcriptions?: any[];
  content?: string;
  userCorrections?: string;
  correctionsUpdatedAt?: string;
  storyRegenerationCount?: number;
  storyRegeneratedAt?: string;
  podcasts?: any[];
  latestPodcastVersion?: number;
};
```

#### 7. Update Components to Use Specific Types

```typescript
// Before: Components accept fat interface
@Component({ ... })
export class PodcastGeneratorComponent {
  @Input() session: AudioSessionRecord | null = null;

  generatePodcast(): void {
    if (!this.session?.content) { // Optional chaining needed
      return;
    }
    // Generate podcast
  }
}

// After: Components require specific type
@Component({ ... })
export class PodcastGeneratorComponent {
  @Input() session: SessionWithStory | null = null;

  generatePodcast(): void {
    if (!this.session) {
      return;
    }
    // session.content is guaranteed to exist - no optional chaining!
    const content = this.session.content;
    // Generate podcast
  }
}
```

#### 8. Update State Transitions

```typescript
// Before: Unsafe state updates
updateSession(sessionId: string, updates: Partial<AudioSessionRecord>): void {
  // No type safety - could add podcasts without content
  this.sessionService.update(sessionId, updates);
}

// After: Type-safe state transitions
transitionToUploaded(
  session: BaseAudioSession,
  storageData: StorageMetadata
): UploadedSession {
  return {
    ...session,
    status: 'completed',
    storageMetadata: storageData,
    storagePath: storageData.storagePath,
    storageUrl: storageData.downloadUrl,
    fileSize: storageData.fileSize,
    contentType: storageData.contentType
  };
}

transitionToTranscribed(
  session: UploadedSession,
  transcription: TranscriptionResult,
  transcriptionId: string
): TranscribedSession {
  return {
    ...session,
    transcription,
    activeTranscriptionId: transcriptionId
  };
}

transitionToStory(
  session: TranscribedSession,
  content: string
): SessionWithStory {
  return {
    ...session,
    content,
    storyRegenerationCount: 0
  };
}
```

#### 9. Create State Transition Service

```typescript
// src/app/audio/session-state-transitions.service.ts

import { Injectable } from '@angular/core';
import { BaseAudioSession } from './models/base-audio-session';
import { UploadedSession } from './models/uploaded-session';
import { TranscribedSession } from './models/transcribed-session';
import { SessionWithStory } from './models/session-with-story';
import { SessionWithPodcasts } from './models/session-with-podcasts';
import { StorageMetadata, TranscriptionResult, PodcastVersion } from './audio-session.models';

@Injectable({ providedIn: 'root' })
export class SessionStateTransitionsService {
  /**
   * Transition from base session to uploaded
   */
  markAsUploaded(
    session: BaseAudioSession,
    storage: StorageMetadata
  ): UploadedSession {
    return {
      ...session,
      status: 'completed',
      storageMetadata: storage,
      storagePath: storage.storagePath,
      storageUrl: storage.downloadUrl,
      fileSize: storage.fileSize,
      contentType: storage.contentType
    };
  }

  /**
   * Transition from uploaded to transcribed
   */
  markAsTranscribed(
    session: UploadedSession,
    transcription: TranscriptionResult,
    transcriptionId: string
  ): TranscribedSession {
    return {
      ...session,
      transcription,
      activeTranscriptionId: transcriptionId
    };
  }

  /**
   * Transition from transcribed to story
   */
  addStory(session: TranscribedSession, content: string): SessionWithStory {
    return {
      ...session,
      content,
      storyRegenerationCount: 0
    };
  }

  /**
   * Transition from story to podcasts
   */
  addPodcast(
    session: SessionWithStory,
    podcast: PodcastVersion
  ): SessionWithPodcasts {
    const existingPodcasts = 'podcasts' in session ? session.podcasts : [];

    return {
      ...session,
      podcasts: [...existingPodcasts, podcast],
      latestPodcastVersion: podcast.version
    };
  }

  /**
   * Update user corrections (doesn't change type)
   */
  updateCorrections(
    session: SessionWithStory,
    corrections: string
  ): SessionWithStory {
    return {
      ...session,
      userCorrections: corrections,
      correctionsUpdatedAt: new Date().toISOString()
    };
  }

  /**
   * Regenerate story (doesn't change type)
   */
  regenerateStory(session: SessionWithStory, content: string): SessionWithStory {
    return {
      ...session,
      content,
      storyRegenerationCount: (session.storyRegenerationCount || 0) + 1,
      storyRegeneratedAt: new Date().toISOString()
    };
  }
}
```

### Migration Plan

1. **Phase 1:** Create new interface files (backward compatible)
2. **Phase 2:** Add type guards and transition service
3. **Phase 3:** Update components one at a time to use specific types
4. **Phase 4:** Update services to use state transitions
5. **Phase 5:** Remove `AudioSessionRecord` alias when all code migrated

### Testing

```typescript
describe('Session State Transitions', () => {
  it('should transition to uploaded state', () => {
    const base: BaseAudioSession = {
      id: '123',
      campaignId: 'c1',
      ownerId: 'u1',
      ownerEmail: 'user@example.com',
      createdBy: 'u1',
      title: 'Test Session',
      audioFileName: 'test.mp3',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'uploading'
    };

    const storage: StorageMetadata = {
      storagePath: 'path/to/file',
      downloadUrl: 'https://...',
      fileSize: 1024,
      contentType: 'audio/mp3'
    };

    const uploaded = transitions.markAsUploaded(base, storage);

    expect(isUploadedSession(uploaded)).toBe(true);
    expect(uploaded.storageMetadata).toBeDefined();
    expect(uploaded.fileSize).toBe(1024);
  });
});
```

## Benefits

- Type safety for state transitions
- Components only depend on properties they use
- Clear documentation of what's available when
- Compiler catches missing properties
- Easier to reason about session lifecycle
- Follows Interface Segregation Principle

## Example Usage

```typescript
// Component only needs story
@Component({ ... })
export class StoryEditorComponent {
  @Input() session!: SessionWithStory; // Guaranteed to have content

  save(): void {
    // No optional chaining needed - content always exists
    const content = this.session.content;
    this.service.save(content);
  }
}

// Component works with any session
@Component({ ... })
export class SessionListComponent {
  @Input() sessions!: BaseAudioSession[];

  canGeneratePodcast(session: BaseAudioSession): boolean {
    return hasStory(session); // Type guard
  }

  showPodcasts(session: BaseAudioSession): void {
    if (hasPodcasts(session)) {
      // TypeScript knows session.podcasts exists here
      console.log(session.podcasts);
    }
  }
}
```
