# Medium Priority Code Quality Improvements

**Priority:** MEDIUM
**Estimated Effort:** 1 week total
**Code Review Issues:** #13, #15, #16, #17, #18, #19

## Overview

This ticket groups several medium-priority improvements that can be tackled incrementally.

---

## 1. Extract Inline Templates to HTML Files

**Effort:** 1 day
**Issue:** #13

### Problem

Large inline templates make components hard to read:
- `audio-session.component.ts`: 254-line inline template
- `podcast-library.component.ts`: Similar issue
- `campaign-selector.component.ts`: Large inline template

### Solution

Extract templates to separate `.html` files.

**Example:**

```typescript
// Before
@Component({
  selector: 'app-audio-session',
  template: `
    <div class="grid gap-6">
      <!-- 254 lines of template -->
    </div>
  `
})

// After
@Component({
  selector: 'app-audio-session',
  templateUrl: './audio-session.component.html'
})
```

**Benefits:**
- Better IDE support
- Easier to read and edit
- Syntax highlighting
- Can be cached separately

---

## 2. Extract Magic Numbers to Constants

**Effort:** 1 day
**Issue:** #18

### Problem

Magic numbers scattered throughout code:

```typescript
// audio-transcription.service.ts
if (this.conversationHistory.length > 22) {  // Why 22?
  this.conversationHistory = [
    ...this.conversationHistory.slice(0, 2),
    ...this.conversationHistory.slice(-20)   // Why 20?
  ];
}

// audio-session.component.ts:713
const step = Math.max(1, Math.floor(durationMs / 100));  // Why 100?

// audio-transcription.service.ts:576
const bitDepth = 16;  // Should be constant
```

### Solution

Create constants file:

```typescript
// src/app/audio/audio.constants.ts

export const CONVERSATION_HISTORY = {
  MAX_LENGTH: 22,
  SYSTEM_CONTEXT_COUNT: 2,
  MESSAGE_HISTORY_COUNT: 20
} as const;

export const AUDIO_ENCODING = {
  BIT_DEPTH: 16,
  FORMAT: 1,
  SAMPLE_RATE: 44100,
  CHANNELS: 1
} as const;

export const PROGRESS_ANIMATION = {
  UPDATE_INTERVAL_MS: 100,
  MIN_STEP: 1,
  MAX_PROGRESS: 95
} as const;

export const AUDIO_CHUNKING = {
  CHUNK_DURATION_SECONDS: 180, // 3 minutes
  MAX_CHUNK_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  OVERLAP_SECONDS: 1
} as const;

export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 10000,
  BACKOFF_MULTIPLIER: 2
} as const;
```

**Usage:**

```typescript
import { CONVERSATION_HISTORY, AUDIO_ENCODING } from './audio.constants';

if (this.conversationHistory.length > CONVERSATION_HISTORY.MAX_LENGTH) {
  this.conversationHistory = [
    ...this.conversationHistory.slice(0, CONVERSATION_HISTORY.SYSTEM_CONTEXT_COUNT),
    ...this.conversationHistory.slice(-CONVERSATION_HISTORY.MESSAGE_HISTORY_COUNT)
  ];
}
```

---

## 3. Replace Manual Subscription Cleanup with DestroyRef

**Effort:** 2 days
**Issue:** #16

### Problem

Manual subscription management is error-prone:

```typescript
export class AudioSessionComponent implements OnDestroy {
  private processingSub?: Subscription;
  private stageTimerSub?: Subscription;
  private correctionsSaveTimer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    this.processingSub?.unsubscribe();
    this.stageTimerSub?.unsubscribe();
    // Easy to forget subscriptions
  }
}
```

### Solution

Use Angular 16+ `DestroyRef` and `takeUntilDestroyed`:

```typescript
import { Component, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({ ... })
export class AudioSessionComponent {
  private destroyRef = inject(DestroyRef);

  startProcessing(upload: AudioUpload): void {
    this.audioStorageService
      .uploadAudioFile(upload.file, upload.campaignId, session.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: progress => this.progress.set(progress.progress),
        error: () => this.failSession('Upload failed')
      });
  }

  // No ngOnDestroy needed!
}
```

**Update in these components:**
- `AudioSessionComponent`
- `PodcastLibraryComponent`
- `ChatComponent`
- `CampaignSelectorComponent`

---

## 4. Improve Type Safety (Remove `any` Types)

**Effort:** 2 days
**Issue:** #19

### Problem

Loose `any` types reduce type safety:

```typescript
// Weak typing
private handleError(error: any): Observable<never> { }

async playPodcast(podcast: PodcastVersion): Promise<void> {
  } catch (error: any) {
    console.error('Failed to play podcast:', error);
  }
}

// Firestore data casting
snapshot.forEach((doc: any) => {
  const data = doc.data();
});
```

### Solution

Define proper error types:

```typescript
// src/app/shared/types/errors.ts

export interface ApiError {
  status: number;
  message: string;
  code?: string;
}

export interface NetworkError {
  type: 'network';
  message: string;
}

export type AppError = ApiError | NetworkError | Error;

// Usage
private handleError(error: unknown): Observable<never> {
  const appError = this.toAppError(error);
  return throwError(() => appError);
}

private toAppError(error: unknown): AppError {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return error as ApiError;
  }
  return new Error('Unknown error');
}
```

Define Firestore document types:

```typescript
// src/app/shared/types/firestore.ts

import { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore';

export interface TypedDocumentSnapshot<T> {
  id: string;
  data(): T | undefined;
  exists(): boolean;
}

export function typedDoc<T>(snapshot: DocumentSnapshot): TypedDocumentSnapshot<T> {
  return {
    id: snapshot.id,
    data: () => snapshot.data() as T | undefined,
    exists: () => snapshot.exists()
  };
}

// Usage
const snapshot = await getDoc(docRef);
const typed = typedDoc<AudioSessionRecord>(snapshot);
if (typed.exists()) {
  const data = typed.data(); // Properly typed!
}
```

---

## 5. Standardize Signal/Observable Usage

**Effort:** 1 day
**Issue:** #17

### Problem

Inconsistent mixing of Signals and RxJS:

```typescript
// Signals for local state
podcasts = computed(() => this.currentSession()?.podcasts || []);

// But RxJS for server operations
generateStoryFromTranscript(): Observable<string> { }

// And manual subscription handling
this.processingSub = this.sessionStoryService
  .generateStoryFromTranscript(...)
  .subscribe({ ... });
```

### Solution

Establish clear patterns:

**Guidelines:**
1. **Signals for:** Component local state, derived state, synchronous operations
2. **RxJS for:** Async operations, HTTP requests, complex streams
3. **Bridge with:** `toObservable()` and `toSignal()` utilities

```typescript
import { toSignal, toObservable } from '@angular/core/rxjs-interop';

@Component({ ... })
export class AudioSessionComponent {
  // Local state - Signals
  currentSession = signal<AudioSessionRecord | null>(null);
  podcasts = computed(() => this.currentSession()?.podcasts || []);

  // Server operations - RxJS
  private storyService = inject(SessionStoryService);

  // Bridge: Convert Observable to Signal
  storyResult = toSignal(
    this.storyService.generateStoryFromTranscript(this.transcript()),
    { initialValue: '' }
  );

  // Or: Use effects to react to signal changes
  constructor() {
    effect(() => {
      const transcript = this.transcript();
      if (transcript) {
        this.generateStory(transcript);
      }
    });
  }
}
```

**Document pattern in:**
- `CONTRIBUTING.md` or architecture docs
- Code comments in key examples
- Team knowledge base

---

## Implementation Order

1. **Day 1-2:** Extract inline templates (quickest win)
2. **Day 3:** Extract magic numbers to constants
3. **Day 4-5:** Replace subscription cleanup with DestroyRef
4. **Day 6-7:** Improve type safety
5. **Day 8:** Standardize Signal/Observable patterns

## Testing Checklist

For each change:
- [ ] Functionality unchanged
- [ ] No console errors
- [ ] TypeScript compilation succeeds
- [ ] Existing tests pass
- [ ] Code is more maintainable

## Benefits Summary

| Improvement | Lines Saved | Maintainability | Type Safety |
|-------------|-------------|-----------------|-------------|
| Extract templates | 0 | ⭐⭐⭐ | N/A |
| Constants | ~30 | ⭐⭐⭐ | ⭐⭐ |
| DestroyRef | ~20 | ⭐⭐⭐ | N/A |
| Type safety | 0 | ⭐⭐ | ⭐⭐⭐ |
| Signal patterns | 0 | ⭐⭐⭐ | ⭐⭐ |

**Total Estimated Impact:**
- ~50 lines reduced
- Significantly improved maintainability
- Better type safety
- Clearer patterns
