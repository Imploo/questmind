# Split AudioSessionComponent into Focused Components

**Priority:** CRITICAL
**Estimated Effort:** 1 week
**Code Review Issue:** #1, #13, #14

## Problem

`AudioSessionComponent` is a "god component" with 942 lines and at least **8 distinct responsibilities**:

1. Upload orchestration
2. Transcription management
3. Story generation coordination
4. Podcast generation
5. Podcast playback control
6. User corrections handling with debouncing
7. Session history management
8. Kanka integration toggle

**Evidence:**
- 17 different signal/state properties
- 6+ service dependencies injected
- 254-line inline template
- Complex business logic in component methods

## Impact

- Extremely difficult to test in isolation
- Changes in one area risk breaking others
- Poor cohesion
- Violates Single Responsibility Principle

## Solution

Split into **5 focused components** with clear responsibilities.

### New Component Architecture

```
AudioSessionContainerComponent (Smart Component)
├── AudioUploadComponent (Existing - already extracted)
├── TranscriptionStatusComponent (Existing - already extracted)
├── SessionStoryComponent (Existing - already extracted)
├── PodcastGeneratorComponent (NEW)
└── SessionHistoryComponent (NEW)
```

### Implementation Steps

#### Phase 1: Extract Podcast Generator Component

**File:** `src/app/audio/podcast-generator.component.ts`

**Responsibilities:**
- Podcast script generation
- Audio generation progress tracking
- Podcast version management
- Display podcast list

**Inputs:**
- `@Input() session: AudioSessionRecord | null`
- `@Input() canGenerate: boolean`
- `@Input() kankaEnabled: boolean`
- `@Input() kankaAvailable: boolean`

**Outputs:**
- `@Output() podcastGenerated = new EventEmitter<void>()`

**State:**
- `isGenerating = signal(false)`
- `progress = signal<string>('')`
- `progressPercent = signal<number>(0)`
- `error = signal<string>('')`
- `podcasts = computed(() => this.session()?.podcasts || [])`

#### Phase 2: Extract Session History Component

**File:** `src/app/audio/session-history.component.ts`

**Responsibilities:**
- Display list of sessions
- Handle session selection
- Show session metadata

**Inputs:**
- `@Input() sessions: AudioSessionRecord[]`
- `@Input() currentSessionId: string | null`
- `@Input() userId: string | null`

**Outputs:**
- `@Output() sessionSelected = new EventEmitter<AudioSessionRecord>()`

#### Phase 3: Extract Podcast Player Component

**File:** `src/app/audio/podcast-player.component.ts`

**Responsibilities:**
- Play/pause/stop controls
- Download functionality
- Playback state management

**Inputs:**
- `@Input() podcasts: PodcastVersion[]`
- `@Input() sessionTitle: string`

**State:**
- `isPlaying = signal(false)`
- `playingVersion = signal<number | null>(null)`
- `currentAudio: HTMLAudioElement | null = null`

#### Phase 4: Create Container Component

**File:** Refactor `audio-session.component.ts` into orchestrator

**Responsibilities:**
- Coordinate child components
- Handle high-level state
- Manage campaign context
- Handle authentication checks

**Template Structure:**
```html
@if (!authService.isAuthenticated()) {
  <!-- Auth prompt -->
} @else if (!campaignId()) {
  <!-- Campaign selection prompt -->
} @else {
  <div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
    <app-audio-upload
      [isBusy]="isBusy()"
      [userId]="userId()"
      [campaignId]="campaignId()"
      [canUpload]="canUploadAudio()"
      (uploadRequested)="startProcessing($event)"
    />

    <app-transcription-status
      [stage]="stage()"
      [progress]="progress()"
      [statusMessage]="statusMessage()"
      (cancel)="cancelProcessing()"
      (retry)="retryProcessing()"
    />
  </div>

  @if (currentSession()) {
    <app-session-story
      [session]="currentSession()"
      [isBusy]="isBusy()"
      [canEdit]="canEditStory()"
      [kankaEnabled]="kankaEnabled()"
      [kankaAvailable]="kankaAvailable()"
      (storyUpdated)="saveStoryEdits($event)"
      (regenerate)="regenerateStory()"
      (retranscribe)="retranscribeSession()"
      (correctionsChanged)="onCorrectionsInput($event)"
      (kankaToggled)="toggleKankaIntegration()"
    />

    @if (currentSession()?.content) {
      <app-podcast-generator
        [session]="currentSession()"
        [canGenerate]="canGeneratePodcast()"
        [kankaEnabled]="kankaEnabled()"
        [kankaAvailable]="kankaAvailable()"
        (podcastGenerated)="refreshSessions()"
      />
    }
  }

  <app-session-history
    [sessions]="sessions()"
    [currentSessionId]="currentSession()?.id"
    [userId]="userId()"
    (sessionSelected)="selectSession($event)"
  />
}
```

### Extract Template to Separate File

Move inline template to `audio-session.component.html`:

```typescript
@Component({
  selector: 'app-audio-session',
  standalone: true,
  templateUrl: './audio-session.component.html',
  styleUrls: ['./audio-session.component.css']
})
```

### Expected Metrics After Refactoring

| Component | Lines | Responsibilities |
|-----------|-------|------------------|
| AudioSessionComponent | ~200 | Orchestration only |
| PodcastGeneratorComponent | ~150 | Podcast generation |
| SessionHistoryComponent | ~80 | Session list |
| PodcastPlayerComponent | ~100 | Playback control |

**Total reduction:** 942 → ~530 lines (43% reduction)

## Testing Strategy

- Test each component in isolation
- Mock child component interactions
- Test container orchestration
- Verify all existing functionality works

## Benefits

- Each component has single responsibility
- Easier to test
- Better code organization
- Can reuse components (e.g., podcast player in library)
- Improved maintainability

## Migration Notes

- Keep old component working during migration
- Test each extracted component thoroughly
- Update routes/imports after migration
- Remove old component only when all features work
