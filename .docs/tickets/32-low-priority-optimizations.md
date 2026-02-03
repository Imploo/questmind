# Low Priority Performance and Architecture Optimizations

**Priority:** LOW
**Estimated Effort:** 1 week total
**Code Review Issues:** #15, #21

## Overview

This ticket groups low-priority optimizations that can be implemented when time permits.

---

## 1. Add OnPush Change Detection

**Effort:** 1 day
**Issue:** Performance optimization

### Problem

Components use default change detection, causing unnecessary re-renders.

### Solution

Add `OnPush` change detection to components using Signals:

```typescript
import { ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-audio-session',
  changeDetection: ChangeDetectionStrategy.OnPush, // Add this
  // ...
})
export class AudioSessionComponent { }
```

**Benefits with Signals:**
- Signals automatically mark components for check
- OnPush only runs change detection when inputs change or signals update
- Significant performance improvement

**Apply to:**
- `AudioSessionComponent`
- `PodcastLibraryComponent`
- `SessionStoryComponent`
- `AudioUploadComponent`
- `TranscriptionStatusComponent`
- All other presentation components

**Testing:**
- Verify components still update correctly
- Check that signal changes trigger updates
- Test async pipe behavior
- Monitor performance improvements

---

## 2. Lazy Load Audio Module

**Effort:** 2 hours
**Issue:** Bundle size optimization

### Problem

`AudioSessionComponent` (942 lines) is loaded in initial bundle even if user doesn't visit audio page.

### Solution

Lazy load the audio feature module:

```typescript
// src/app/app.routes.ts

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/campaign',
    pathMatch: 'full'
  },
  {
    path: 'campaign',
    loadComponent: () => import('./campaign/campaign-selector.component')
      .then(m => m.CampaignSelectorComponent),
    canActivate: [authGuard]
  },
  {
    path: 'campaign/:campaignId',
    loadComponent: () => import('./app-shell.component')
      .then(m => m.AppShellComponent),
    canActivate: [authGuard, campaignGuard],
    children: [
      {
        path: 'audio',
        loadComponent: () => import('./audio/audio-session.component')
          .then(m => m.AudioSessionComponent)
      },
      {
        path: 'podcast-library',
        loadComponent: () => import('./audio/podcast-library.component')
          .then(m => m.PodcastLibraryComponent)
      },
      {
        path: 'chat',
        loadComponent: () => import('./chat/chat.component')
          .then(m => m.ChatComponent)
      }
    ]
  }
];
```

**Benefits:**
- Smaller initial bundle
- Faster first page load
- Code split by feature
- Better for users who don't use all features

**Testing:**
- Verify routes still work
- Check lazy loading in network tab
- Measure bundle size reduction
- Test navigation between lazy routes

---

## 3. Implement State Machine for Session Workflow

**Effort:** 2 days
**Issue:** #15

### Problem

Session state transitions are implicit and scattered across methods:

```typescript
// Transitions hidden in various methods:
this.stage.set('uploading');      // in startProcessing()
this.stage.set('transcribing');   // in runTranscription()
this.stage.set('generating');     // in runStoryGeneration()
this.stage.set('completed');      // in finishStage()
this.stage.set('failed');         // in multiple places
```

### Solution

Implement explicit state machine using discriminated unions:

```typescript
// src/app/audio/state-machine/session-state.ts

export type SessionState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number; fileName: string }
  | { status: 'transcribing'; progress: number; chunksComplete: number; chunksTotal: number }
  | { status: 'generating-story'; progress: number }
  | { status: 'completed'; sessionId: string }
  | { status: 'failed'; error: string; canRetry: boolean };

export type SessionEvent =
  | { type: 'START_UPLOAD'; file: File }
  | { type: 'UPLOAD_PROGRESS'; progress: number }
  | { type: 'UPLOAD_COMPLETE'; sessionId: string }
  | { type: 'START_TRANSCRIPTION' }
  | { type: 'TRANSCRIPTION_PROGRESS'; chunksComplete: number; chunksTotal: number }
  | { type: 'TRANSCRIPTION_COMPLETE' }
  | { type: 'START_STORY_GENERATION' }
  | { type: 'STORY_GENERATION_COMPLETE' }
  | { type: 'ERROR'; error: string; canRetry: boolean }
  | { type: 'RETRY' };
```

```typescript
// src/app/audio/state-machine/session-state-machine.service.ts

import { Injectable, signal } from '@angular/core';
import { SessionState, SessionEvent } from './session-state';

@Injectable({ providedIn: 'root' })
export class SessionStateMachine {
  private state = signal<SessionState>({ status: 'idle' });

  readonly currentState = this.state.asReadonly();

  transition(event: SessionEvent): void {
    const currentState = this.state();
    const newState = this.computeNextState(currentState, event);

    if (this.isValidTransition(currentState, newState)) {
      this.state.set(newState);
    } else {
      console.error(
        `Invalid transition from ${currentState.status} with event ${event.type}`
      );
    }
  }

  private computeNextState(
    current: SessionState,
    event: SessionEvent
  ): SessionState {
    // Pattern match on (state, event) pairs
    if (current.status === 'idle' && event.type === 'START_UPLOAD') {
      return {
        status: 'uploading',
        progress: 0,
        fileName: event.file.name
      };
    }

    if (current.status === 'uploading' && event.type === 'UPLOAD_PROGRESS') {
      return {
        ...current,
        progress: event.progress
      };
    }

    if (current.status === 'uploading' && event.type === 'UPLOAD_COMPLETE') {
      return {
        status: 'transcribing',
        progress: 0,
        chunksComplete: 0,
        chunksTotal: 1
      };
    }

    if (current.status === 'transcribing' && event.type === 'TRANSCRIPTION_PROGRESS') {
      return {
        ...current,
        chunksComplete: event.chunksComplete,
        chunksTotal: event.chunksTotal,
        progress: Math.floor((event.chunksComplete / event.chunksTotal) * 100)
      };
    }

    if (current.status === 'transcribing' && event.type === 'TRANSCRIPTION_COMPLETE') {
      return {
        status: 'generating-story',
        progress: 0
      };
    }

    if (current.status === 'generating-story' && event.type === 'STORY_GENERATION_COMPLETE') {
      return {
        status: 'completed',
        sessionId: '' // TODO: get from context
      };
    }

    if (event.type === 'ERROR') {
      return {
        status: 'failed',
        error: event.error,
        canRetry: event.canRetry
      };
    }

    // Default: no state change
    return current;
  }

  private isValidTransition(from: SessionState, to: SessionState): boolean {
    // Define valid state transitions
    const validTransitions: Record<string, string[]> = {
      idle: ['uploading'],
      uploading: ['transcribing', 'failed'],
      transcribing: ['generating-story', 'failed'],
      'generating-story': ['completed', 'failed'],
      completed: ['idle'], // Can start new session
      failed: ['idle', 'uploading'] // Can retry
    };

    return validTransitions[from.status]?.includes(to.status) ?? false;
  }

  reset(): void {
    this.state.set({ status: 'idle' });
  }
}
```

**Usage in Component:**

```typescript
@Component({ ... })
export class AudioSessionComponent {
  private stateMachine = inject(SessionStateMachine);

  state = this.stateMachine.currentState;

  // Computed properties for template
  isUploading = computed(() => this.state().status === 'uploading');
  progress = computed(() => {
    const state = this.state();
    return 'progress' in state ? state.progress : 0;
  });
  statusMessage = computed(() => this.getStatusMessage(this.state()));

  startProcessing(upload: AudioUpload): void {
    this.stateMachine.transition({
      type: 'START_UPLOAD',
      file: upload.file
    });

    // Rest of processing logic...
  }

  private getStatusMessage(state: SessionState): string {
    switch (state.status) {
      case 'idle': return 'Ready to upload';
      case 'uploading': return `Uploading ${state.fileName}...`;
      case 'transcribing':
        return `Transcribing (${state.chunksComplete}/${state.chunksTotal} chunks)...`;
      case 'generating-story': return 'Generating story...';
      case 'completed': return 'Session complete!';
      case 'failed': return `Error: ${state.error}`;
    }
  }
}
```

**Benefits:**
- Explicit state transitions
- Type-safe state access
- Impossible to have invalid state
- Easy to visualize workflow
- Testable in isolation
- Can generate state diagrams

---

## 4. Remove Dead Code

**Effort:** 1 hour
**Issue:** #21

### Problem

Commented-out code left in place:

```typescript
// audio-transcription.service.ts:466-467
private detectRepetition(text: string): boolean {
  return false;  // Detection disabled
  // Following code is unreachable but still in file
  if (!text || text.length < 50) return false;
  const words = text.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
  // ... 30 more lines of dead code
}
```

### Solution

**Option 1:** Remove entirely (use git history if needed)

```typescript
// Just delete the whole method if unused
```

**Option 2:** Use feature flags if intentionally disabled

```typescript
// src/environments/environment.ts
export const environment = {
  features: {
    repetitionDetection: false,
    advancedAnalytics: false
  }
};

// Service
private detectRepetition(text: string): boolean {
  if (!environment.features.repetitionDetection) {
    return false;
  }

  // Active implementation
  if (!text || text.length < 50) return false;
  // ... actual logic
}
```

**Search for and remove:**
- Commented-out code blocks
- Unused imports
- Unreachable code after `return false`
- TODO comments that are no longer relevant

---

## 5. Add Feature Flags System

**Effort:** 1 day

### Problem

No systematic way to enable/disable features.

### Solution

Create feature flags service:

```typescript
// src/app/core/feature-flags.service.ts

export interface FeatureFlags {
  repetitionDetection: boolean;
  kankaIntegration: boolean;
  podcastGeneration: boolean;
  advancedTranscription: boolean;
  experimentalUI: boolean;
}

@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
  private flags = signal<FeatureFlags>({
    repetitionDetection: environment.features.repetitionDetection ?? false,
    kankaIntegration: environment.features.kankaIntegration ?? true,
    podcastGeneration: environment.features.podcastGeneration ?? true,
    advancedTranscription: environment.features.advancedTranscription ?? false,
    experimentalUI: environment.features.experimentalUI ?? false
  });

  isEnabled(feature: keyof FeatureFlags): boolean {
    return this.flags()[feature];
  }

  enable(feature: keyof FeatureFlags): void {
    this.flags.update(flags => ({ ...flags, [feature]: true }));
  }

  disable(feature: keyof FeatureFlags): void {
    this.flags.update(flags => ({ ...flags, [feature]: false }));
  }

  // For development/testing
  toggleAll(enabled: boolean): void {
    this.flags.update(flags =>
      Object.keys(flags).reduce(
        (acc, key) => ({ ...acc, [key]: enabled }),
        {} as FeatureFlags
      )
    );
  }
}
```

**Usage:**

```typescript
@Component({ ... })
export class AudioSessionComponent {
  private features = inject(FeatureFlagsService);

  showPodcastSection = computed(() =>
    this.features.isEnabled('podcastGeneration') && this.hasStory()
  );
}
```

**Benefits:**
- Easy A/B testing
- Gradual rollouts
- Quick feature disabling in production
- Development toggles

---

## 6. Add Comprehensive Unit Tests

**Effort:** 2 weeks (ongoing)

### Current State

Limited test coverage for business logic.

### Solution

Add tests for critical services and components.

**Priority Test Targets:**

1. **FormattingService** (once extracted)
   - Test all formatters
   - Edge cases (null, undefined, invalid dates)

2. **ErrorHandlerService** (once created)
   - Test all error types
   - Test handler priority
   - Test custom handlers

3. **SessionStateMachine** (if implemented)
   - Test all state transitions
   - Test invalid transitions rejected
   - Test edge cases

4. **AudioChunkingService** (if extracted)
   - Test chunking logic
   - Test WAV encoding
   - Test edge cases (very short/long files)

**Example Test:**

```typescript
describe('FormattingService', () => {
  let service: FormattingService;

  beforeEach(() => {
    service = new FormattingService();
  });

  describe('formatDuration', () => {
    it('should format zero seconds', () => {
      expect(service.formatDuration(0)).toBe('0:00');
    });

    it('should format seconds only', () => {
      expect(service.formatDuration(45)).toBe('0:45');
    });

    it('should format minutes and seconds', () => {
      expect(service.formatDuration(125)).toBe('2:05');
    });

    it('should handle undefined', () => {
      expect(service.formatDuration(undefined)).toBe('0:00');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes as KB', () => {
      expect(service.formatFileSize(1024)).toBe('1.0 KB');
    });

    it('should format bytes as MB', () => {
      expect(service.formatFileSize(1024 * 1024)).toBe('1.0 MB');
    });

    it('should handle undefined', () => {
      expect(service.formatFileSize(undefined)).toBe('N/A');
    });
  });
});
```

---

## Implementation Order

1. **Week 1:** OnPush change detection + lazy loading (quick wins)
2. **Week 2:** Remove dead code + feature flags
3. **Week 3:** State machine implementation
4. **Ongoing:** Add unit tests as time permits

## Benefits Summary

| Optimization | Bundle Size | Performance | Maintainability |
|--------------|-------------|-------------|-----------------|
| OnPush | 0 | ⭐⭐⭐ | ⭐ |
| Lazy loading | ⭐⭐⭐ | ⭐⭐ | ⭐ |
| State machine | 0 | ⭐ | ⭐⭐⭐ |
| Remove dead code | ⭐ | 0 | ⭐⭐ |
| Feature flags | 0 | 0 | ⭐⭐⭐ |
| Unit tests | 0 | 0 | ⭐⭐⭐ |

## Notes

- These optimizations are "nice to have" but not critical
- Implement after completing critical and high-priority tickets
- Can be done incrementally during maintenance sprints
- Good learning opportunities for team members
