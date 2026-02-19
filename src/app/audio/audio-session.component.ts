import { Component, OnDestroy, effect, signal, computed, inject, Injector, runInInjectionContext, ChangeDetectionStrategy, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { AudioBackendOperationsService } from './services/audio-backend-operations.service';
import { PodcastAudioService, PodcastProgress } from './services/podcast-audio.service';
import { AuthService } from '../auth/auth.service';
import { FormattingService } from '../shared/formatting.service';
import * as logger from '../shared/logger';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { CampaignService } from '../campaign/campaign.service';
import {
  AudioSessionRecord,
  PodcastVersion,
  SessionProgress
} from './services/audio-session.models';
import { SessionStoryComponent } from './session-story.component';
import { SessionProgressCardComponent } from './session-progress-card.component';
import { CampaignSelectorComponent } from '../campaign/campaign-selector.component';
import { httpsCallable, Functions } from 'firebase/functions';
import { FirebaseService } from '../core/firebase.service';

@Component({
  selector: 'app-audio-session',
  imports: [CommonModule, SessionStoryComponent, SessionProgressCardComponent, CampaignSelectorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (authService.isAuthenticated()) {
      <div class="mb-6 hidden sm:block">
        <app-campaign-selector />
      </div>
    }

    @if (!authService.isAuthenticated()) {
      <div class="border border-gray-200 rounded-xl bg-white shadow-sm p-8 text-center">
        <div class="max-w-md mx-auto">
          <div class="text-6xl mb-4">🎙️</div>
          <h3 class="text-xl font-semibold text-gray-800 mb-2">Audio Transcription</h3>
          <p class="text-gray-600 mb-6">
            Sign in to upload audio sessions and generate AI-powered transcriptions and session stories.
          </p>
          <p class="text-sm text-gray-500">
            Your audio files and transcriptions will be securely stored and accessible only to you.
          </p>
        </div>
      </div>
    } @else if (!campaignId()) {
      <div class="border border-gray-200 rounded-xl bg-white shadow-sm p-8 text-center">
        <div class="max-w-md mx-auto">
          <div class="text-4xl mb-3">🧭</div>
          <h3 class="text-lg font-semibold text-gray-800 mb-2">Select a campaign</h3>
          <p class="text-gray-600 m-0">
            Choose a campaign to upload sessions and collaborate with your group.
          </p>
        </div>
      </div>
    } @else {
      <div class="flex flex-col lg:flex-row gap-6">
        <!-- Mobile: Toggle button at top -->
        <div class="lg:hidden">
          <button
            type="button"
            (click)="mobileDrawerOpen.set(true)"
            class="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div class="flex items-center gap-3">
              <span class="text-lg">📋</span>
              <div class="text-left">
                <p class="m-0 text-sm font-semibold text-gray-700">
                  {{ currentSession()?.title || 'Select a session' }}
                </p>
                <p class="m-0 text-xs text-gray-500">
                  {{ sortedSessions().length }} session(s) available
                </p>
              </div>
            </div>
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </button>
        </div>

        <!-- Mobile backdrop -->
        @if (mobileDrawerOpen()) {
          <div
            class="fixed inset-0 bg-black/50 z-40 lg:hidden"
            (click)="mobileDrawerOpen.set(false)"
          ></div>
        }

        <!-- Left sidebar: Session list (sticky on desktop, drawer on mobile) -->
        <aside
          class="flex-shrink-0 lg:w-72 lg:sticky lg:top-4 lg:self-start lg:h-[calc(100vh-8rem)]"
          [class.fixed]="mobileDrawerOpen()"
          [class.inset-0]="mobileDrawerOpen()"
          [class.flex]="mobileDrawerOpen()"
          [class.items-center]="mobileDrawerOpen()"
          [class.justify-center]="mobileDrawerOpen()"
          [class.z-50]="mobileDrawerOpen()"
          [class.p-4]="mobileDrawerOpen()"
          [class.hidden]="!mobileDrawerOpen()"
          [class.lg:block]="true"
        >
          <div
            class="border border-gray-200 rounded-xl bg-white shadow-sm flex flex-col overflow-hidden h-full"
            [class.w-full]="mobileDrawerOpen()"
            [class.max-w-md]="mobileDrawerOpen()"
            [class.max-h-[85vh]]="mobileDrawerOpen()"
            [class.shadow-2xl]="mobileDrawerOpen()"
          >
            <div class="p-4 border-b border-gray-200">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <h3 class="text-sm font-semibold text-gray-700 m-0">Sessions</h3>
                  <p class="text-xs text-gray-500 m-0 mt-1">{{ sortedSessions().length }} session(s)</p>
                </div>
                <!-- Close button for mobile -->
                <button
                  type="button"
                  (click)="mobileDrawerOpen.set(false)"
                  class="lg:hidden p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              <!-- New button -->
              <button
                type="button"
                (click)="navigateToNew(); mobileDrawerOpen.set(false)"
                class="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                </svg>
                New Session
              </button>
            </div>
            <div class="flex-1 overflow-y-auto">
              @if (sortedSessions().length === 0) {
                <div class="p-4 text-center">
                  <p class="text-sm text-gray-500 m-0">No sessions yet.</p>
                  <p class="text-xs text-gray-400 m-0 mt-1">Upload audio to begin.</p>
                </div>
              } @else {
                <nav class="p-2 flex flex-col gap-1">
                  @for (session of sortedSessions(); track session.id) {
                    <button
                      type="button"
                      class="text-left w-full rounded-lg p-3 transition-colors"
                      [class.bg-primary/10]="currentSession()?.id === session.id"
                      [class.border-primary]="currentSession()?.id === session.id"
                      [class.border]="currentSession()?.id === session.id"
                      [class.hover:bg-gray-50]="currentSession()?.id !== session.id"
                      (click)="selectSession(session); mobileDrawerOpen.set(false)"
                    >
                      <p class="m-0 text-sm font-medium text-gray-800 truncate">{{ session.title }}</p>
                      <p class="m-0 text-xs text-gray-500 mt-0.5">
                        {{ session.sessionDate || 'No date' }}
                      </p>
                      <div class="flex items-center gap-2 mt-1">
                        <span
                          class="inline-block w-2 h-2 rounded-full"
                          [class.bg-green-500]="session.status === 'completed'"
                          [class.bg-yellow-500]="session.status === 'processing' || session.status === 'uploading'"
                          [class.bg-red-500]="session.status === 'failed'"
                        ></span>
                        <span class="text-xs text-gray-400">{{ session.status }}</span>
                        @if (session.ownerId === userId()) {
                          <span class="text-xs text-primary font-medium ml-auto">You</span>
                        }
                      </div>
                    </button>
                  }
                </nav>
              }
            </div>
          </div>
        </aside>

        <!-- Right panel: Session details (scrolls naturally with page) -->
        <main class="flex-1 min-w-0">
          <div class="grid">
            @if (currentSession()) {
              <!-- Progress card (only shown when session is processing) -->
              <app-session-progress-card
                [progress]="displayProgress()"
                (cancelled)="cancelCurrentOperation()"
                (retry)="retryFailedOperation()"
              />

              <!-- Session story with integrated podcasts tab -->
              <app-session-story
                [title]="currentSession()?.title || 'Session Story'"
                [subtitle]="formatSubtitle(currentSession())"
                [story]="currentSession()?.content || ''"
                [transcript]="currentSession()?.rawStory || currentSession()?.transcription?.rawTranscript || ''"
                [isBusy]="isBusy()"
                [canRegenerate]="canRegenerateStory()"
                [canEditStory]="canEditStory()"
                [canEditCorrections]="canEditCorrections()"
                [corrections]="userCorrections()"
                [correctionsStatus]="correctionsSaveStatus()"
                [podcasts]="podcasts()"
                [isGeneratingPodcast]="isGeneratingPodcast()"
                [podcastGenerationProgress]="podcastGenerationProgress()"
                [podcastGenerationProgressPercent]="podcastGenerationProgressPercent()"
                [podcastError]="podcastError()"
                [canGeneratePodcast]="canGeneratePodcast()"
                [hasActiveBackgroundJob]="hasActiveBackgroundJob()"
                [backgroundJobMessage]="backgroundJobMessage()"
                (storyUpdated)="saveStoryEdits($event)"
                (regenerate)="regenerateStory()"
                (correctionsChanged)="onCorrectionsInput($event)"
                (generatePodcast)="generatePodcast()"
                (downloadPodcast)="downloadPodcast($event)"
              ></app-session-story>
            }

            <!-- Empty state when no session selected -->
            @if (!currentSession()) {
              <div class="border border-gray-200 rounded-xl bg-white shadow-sm p-8 text-center">
                <div class="max-w-md mx-auto">
                  @if (sortedSessions().length > 0) {
                    <div class="text-4xl mb-3">👈</div>
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">Select a session</h3>
                    <p class="text-gray-600 m-0">
                      Choose a session from the list to view its details and story.
                    </p>
                  } @else {
                    <div class="text-6xl mb-4">🎙️</div>
                    <h3 class="text-xl font-semibold text-gray-800 mb-2">No sessions yet</h3>
                    <p class="text-gray-600 mb-6">
                      Upload your first audio session to get started with AI-powered transcriptions and session stories.
                    </p>
                    <button
                      type="button"
                      (click)="navigateToNew()"
                      class="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
                    >
                      Upload Audio Session
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        </main>
      </div>
    }
  `
})
export class AudioSessionComponent implements OnDestroy {
  private readonly campaignContext = inject(CampaignContextService);
  private readonly campaignService = inject(CampaignService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  userId = computed(() => this.authService.currentUser()?.uid || null);
  campaignId = computed(() => this.campaignContext.selectedCampaignId());
  userCorrections = signal<string>('');
  correctionsSaveStatus = signal<'idle' | 'saving' | 'saved'>('idle');

  // Session selection: selectedSessionId drives currentSession computed
  private selectedSessionId = signal<string | null>(null);

  // Reactive currentSession: automatically updates when Firestore data changes
  currentSession = computed(() => {
    const id = this.selectedSessionId();
    if (!id) return null;
    return this.sessions().find(s => s.id === id) ?? null;
  });

  // Podcast state
  podcasts = computed(() => this.currentSession()?.podcasts || []);
  isSessionOwner = computed(() => {
    const session = this.currentSession();
    const userId = this.userId();
    return !!session && this.campaignService.isSessionOwner(session, userId);
  });

  // Background job tracking
  hasActiveBackgroundJob = computed(() => {
    const session = this.currentSession();
    const batchStatus = session?.transcriptionBatch?.status;
    return batchStatus === 'submitted' || batchStatus === 'running';
  });

  backgroundJobMessage = computed(() => {
    const session = this.currentSession();
    const batchStatus = session?.transcriptionBatch?.status;
    if (batchStatus === 'submitted') {
      return 'Batch job submitted, waiting to start...';
    }
    if (batchStatus === 'running') {
      return 'Processing audio transcription in background...';
    }
    return '';
  });
  canRegenerateStory = computed(() => this.isSessionOwner());
  canGeneratePodcast = computed(() => this.isSessionOwner());
  canEditStory = computed(() => this.isSessionOwner());
  canEditCorrections = computed(() => !!this.currentSession());
  isGeneratingPodcast = signal(false);
  podcastProgress = signal<PodcastProgress | null>(null);
  podcastGenerationProgress = signal<string>('');
  podcastGenerationProgressPercent = signal<number>(0);
  podcastError = signal<string>('');
  private podcastProgressUnsubscribe?: () => void;
  private correctionsSaveTimer?: ReturnType<typeof setTimeout>;
  private correctionsStatusTimer?: ReturnType<typeof setTimeout>;
  private activeCorrectionsSessionId: string | null = null;
  private routeParamsSub?: Subscription;

  sessions: Signal<AudioSessionRecord[]> = signal<AudioSessionRecord[]>([]);

  // Sorted sessions by date (newest first)
  sortedSessions = computed(() => {
    const sessions = this.sessions();
    return [...sessions].sort((a, b) => {
      const dateA = a.sessionDate || '';
      const dateB = b.sessionDate || '';
      // Sort in descending order (newest first)
      return dateB.localeCompare(dateA);
    });
  });

  // Mobile drawer state
  mobileDrawerOpen = signal(false);

  // Computed progress for display (handles both new and legacy sessions)
  displayProgress = computed(() => {
    const session = this.currentSession();
    if (!session) return null;

    // If session has new unified progress, use it
    if (session.progress) {
      return session.progress;
    }

    // Otherwise, create synthetic progress from legacy status field
    if (session.status === 'failed') {
      return {
        stage: 'failed' as const,
        progress: 0,
        message: 'Transcription failed. Click retry to try again.',
        error: undefined,
        startedAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt || session.createdAt)
      };
    }

    if (session.status === 'processing') {
      return {
        stage: 'transcribing' as const,
        progress: 50,
        message: 'Processing...',
        startedAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt || session.createdAt)
      };
    }

    // Don't show progress card for completed or idle sessions
    return null;
  });

  // Derived from displayProgress — replaces the old stage-based isBusy() method
  isBusy = computed(() => {
    const p = this.displayProgress();
    return !!p && !['idle', 'completed', 'failed'].includes(p.stage);
  });

  private readonly sessionStateService = inject(AudioSessionStateService);
  private readonly backendOperations = inject(AudioBackendOperationsService);
  private readonly podcastAudioService = inject(PodcastAudioService);
  readonly authService = inject(AuthService);
  private readonly injector = inject(Injector);
  readonly formatting = inject(FormattingService);
  private readonly firebaseService = inject(FirebaseService);
  private functions: Functions;

  constructor() {
    this.functions = this.firebaseService.requireFunctions();
    this.sessions = this.sessionStateService.sessions;

    // Subscribe to route params to handle session selection from URL
    this.routeParamsSub = this.route.paramMap.subscribe(params => {
      const sessionIdFromRoute = params.get('sessionId');
      const sessions = this.sortedSessions();

      if (sessionIdFromRoute && sessions.length > 0) {
        const sessionToSelect = sessions.find(s => s.id === sessionIdFromRoute);
        if (sessionToSelect && this.selectedSessionId() !== sessionIdFromRoute) {
          this.selectSessionWithoutNavigation(sessionToSelect);
        }
      }
    });

    effect(() => {
      const sessions = this.sortedSessions();
      const currentId = this.selectedSessionId();
      const sessionIdFromRoute = this.route.snapshot.paramMap.get('sessionId');

      if (sessions.length === 0) {
        if (currentId) {
          this.selectedSessionId.set(null);
        }
        return;
      }

      // If there's a session ID in the route, try to select it
      if (sessionIdFromRoute) {
        const sessionToSelect = sessions.find(s => s.id === sessionIdFromRoute);
        if (sessionToSelect && currentId !== sessionIdFromRoute) {
          this.selectSessionWithoutNavigation(sessionToSelect);
          return;
        }
      }

      // Otherwise, select the first session if none is selected
      if (!currentId || !sessions.some(session => session.id === currentId)) {
        this.selectSession(sessions[0]);
      }
    });

    effect(() => {
      const session = this.currentSession();
      const sessionId = session?.id ?? null;
      if (sessionId !== this.activeCorrectionsSessionId) {
        this.activeCorrectionsSessionId = sessionId;
        this.userCorrections.set(session?.userCorrections ?? '');
        this.correctionsSaveStatus.set('idle');
        this.clearCorrectionsTimers();
        return;
      }
      if (this.correctionsSaveStatus() === 'idle') {
        const corrections = session?.userCorrections ?? '';
        if (corrections !== this.userCorrections()) {
          this.userCorrections.set(corrections);
        }
      }
    });
  }

  async regenerateStory(): Promise<void> {
    if (!this.canRegenerateStory()) {
      return;
    }
    const session = this.currentSession();
    if (!session?.rawStory && !session?.transcription) {
      return;
    }

    const campaignId = session.campaignId;
    if (!campaignId) {
      this.failSession('No campaign selected.');
      return;
    }

    try {
      // Write initial progress to Firestore — displayProgress() picks it up reactively
      await this.sessionStateService.persistSessionPatch(session.id, {
        status: 'processing',
        progress: {
          stage: 'generating-story',
          progress: 0,
          message: 'Starting story regeneration...',
          startedAt: new Date(),
          updatedAt: new Date()
        } as SessionProgress
      });

      // Start processing (fire-and-forget)
      const kankaEnabled = this.campaignContext.selectedCampaign()?.settings?.kankaEnabled ?? false;
      await this.backendOperations.regenerateStory(
        campaignId,
        session.id,
        {
          enableKankaContext: kankaEnabled,
          userCorrections: this.userCorrections()
        }
      );

    } catch (error: unknown) {
      console.error('Failed to start story regeneration:', error);
      this.failSession((error as Error)?.message || 'Failed to start story regeneration');
    }
  }

  saveStoryEdits(content: string): void {
    if (!this.canEditStory()) {
      return;
    }
    const session = this.currentSession();
    if (!session) {
      return;
    }
    this.sessionStateService.updateSession(session.id, { content: content, status: 'completed' });
  }

  selectSession(session: AudioSessionRecord): void {
    this.selectSessionWithoutNavigation(session);

    // Navigate to the session route
    const campaignId = this.campaignId();
    const basePath = campaignId ? `/campaign/${campaignId}/audio` : '/audio';
    void this.router.navigate([basePath, session.id]);
  }

  navigateToNew(): void {
    const campaignId = this.campaignId();
    const basePath = campaignId ? `/campaign/${campaignId}/audio` : '/audio';
    void this.router.navigate([basePath, 'new']);
  }

  private selectSessionWithoutNavigation(session: AudioSessionRecord): void {
    this.selectedSessionId.set(session.id);
    this.userCorrections.set(session.userCorrections ?? '');
    this.correctionsSaveStatus.set('idle');
  }

  formatSubtitle(session: AudioSessionRecord | null): string {
    if (!session) {
      return '';
    }
    return `${session.audioFileName || 'Unknown'} · ${session.sessionDate || 'No date'}`;
  }

  /**
   * Cancel the current operation (if supported)
   * Note: Most operations are fire-and-forget, so cancellation may not be possible
   */
  cancelCurrentOperation(): void {
    const session = this.currentSession();
    const stage = session?.progress?.stage;

    logger.debug('[Progress] Cancel requested for stage:', stage);

    // Most operations don't support cancellation yet
    // This is a placeholder for future implementation
    alert('Operation cancellation is not yet implemented. The operation will complete in the background.');
  }

  /**
   * Retry a failed transcription using fast transcription
   */
  async retryFailedOperation(): Promise<void> {
    const session = this.currentSession();
    if (!session?.progress || session.progress.stage !== 'failed') {
      logger.warn('[Retry] Cannot retry - session is not in failed state');
      return;
    }

    logger.debug('[Retry] Retrying failed transcription for session:', session.id);

    // Check if we have the required data
    const storageUrl = this.resolveAudioStorageUrl(session);
    if (!storageUrl) {
      alert('Cannot retry: No audio file found for this session.');
      return;
    }

    if (!session.campaignId) {
      alert('Cannot retry: No campaign selected.');
      return;
    }

    // Call transcribeAudioFast with session parameters
    await this.callTranscribeAudioFast(
      session.campaignId,
      session.id,
      storageUrl,
      session.audioFileName || 'audio.wav',
      this.userCorrections() || undefined
    );
  }

  /**
   * Call the transcribeAudioFast Cloud Function.
   * Writes initial progress to Firestore; further updates come reactively via sessions().
   */
  private async callTranscribeAudioFast(
    campaignId: string,
    sessionId: string,
    storageUrl: string,
    audioFileName: string,
    userCorrections?: string
  ): Promise<void> {
    try {
      logger.debug('[TranscribeFast] Starting fast transcription', {
        campaignId,
        sessionId,
        audioFileName
      });

      // Write initial progress to Firestore
      await this.sessionStateService.persistSessionPatch(sessionId, {
        status: 'processing',
        progress: {
          stage: 'transcribing',
          progress: 70,
          message: 'Starting fast transcription...',
          startedAt: new Date(),
          updatedAt: new Date()
        } as SessionProgress
      });

      // Call the Cloud Function
      const transcribeAudioFast = httpsCallable<
        {
          campaignId: string;
          sessionId: string;
          storageUrl: string;
          audioFileName: string;
          audioFileSize?: number;
          userCorrections?: string;
        },
        { success: boolean; message: string }
      >(this.functions, 'transcribeAudioFast');

      const result = await transcribeAudioFast({
        campaignId,
        sessionId,
        storageUrl,
        audioFileName,
        userCorrections
      });

      if (result.data.success) {
        logger.info('[TranscribeFast] Function call successful:', result.data.message);
        // Progress updates come reactively via Firestore → sessions() → displayProgress()
      } else {
        logger.error('[TranscribeFast] Function returned error:', result.data.message);
        this.failSession(result.data.message);
      }
    } catch (error: unknown) {
      logger.error('[TranscribeFast] Failed to call transcribeAudioFast:', error);
      this.failSession((error as Error)?.message || 'Failed to start transcription');
    }
  }

  ngOnDestroy(): void {
    this.cleanupPodcastProgressListener();
    this.routeParamsSub?.unsubscribe();
    this.clearCorrectionsTimers();
  }

  private cleanupPodcastProgressListener(): void {
    if (this.podcastProgressUnsubscribe) {
      this.podcastProgressUnsubscribe();
      this.podcastProgressUnsubscribe = undefined;
    }
  }

  private failSession(message: string): void {
    const session = this.currentSession();
    if (session) {
      this.sessionStateService.updateSession(session.id, {
        status: 'failed',
        progress: {
          stage: 'failed',
          progress: 0,
          message: `Failed: ${message}`,
          error: message,
          startedAt: new Date(),
          updatedAt: new Date()
        } as SessionProgress
      });
    }
  }

  onCorrectionsInput(corrections: string): void {
    this.userCorrections.set(corrections);
    this.correctionsSaveStatus.set('saving');
    this.clearCorrectionsSaveTimer();
    this.correctionsSaveTimer = setTimeout(() => {
      void this.saveCorrections(corrections);
    }, 500);
  }

  private async saveCorrections(corrections: string): Promise<void> {
    const session = this.currentSession();
    if (!session) {
      this.correctionsSaveStatus.set('idle');
      return;
    }
    try {
      await this.sessionStateService.persistSessionPatch(session.id, {
        userCorrections: corrections,
        correctionsUpdatedAt: new Date().toISOString()
      });
      this.correctionsSaveStatus.set('saved');
      this.clearCorrectionsStatusTimer();
      this.correctionsStatusTimer = setTimeout(() => {
        this.correctionsSaveStatus.set('idle');
      }, 2000);
    } catch (error) {
      console.error('Failed to save corrections:', error);
      this.correctionsSaveStatus.set('idle');
    }
  }

  private clearCorrectionsTimers(): void {
    this.clearCorrectionsSaveTimer();
    this.clearCorrectionsStatusTimer();
  }

  private clearCorrectionsSaveTimer(): void {
    if (this.correctionsSaveTimer) {
      clearTimeout(this.correctionsSaveTimer);
    }
  }

  private clearCorrectionsStatusTimer(): void {
    if (this.correctionsStatusTimer) {
      clearTimeout(this.correctionsStatusTimer);
    }
  }

  private resolveAudioStorageUrl(session: AudioSessionRecord | null): string | null {
    if (!session) return null;

    // Priority: root-level storageUrl (new), then storageMetadata.downloadUrl (legacy)
    const url = session.storageUrl || null;

    return url;
  }

  async generatePodcast(): Promise<void> {
    const session = this.currentSession();
    if (!session?.content || !session?.id) {
      this.podcastError.set('No session story available.');
      return;
    }
    if (!session.campaignId) {
      this.podcastError.set('No campaign selected.');
      return;
    }
    if (!this.canGeneratePodcast()) {
      this.podcastError.set('Only session owner can generate podcast.');
      return;
    }

    this.isGeneratingPodcast.set(true);
    this.podcastGenerationProgress.set('Starting podcast generation...');
    this.podcastGenerationProgressPercent.set(0);
    this.podcastError.set('');

    try {
      const version = (session.podcasts?.length || 0) + 1;

      // Step 1: Start listening BEFORE generation
      const { progress, unsubscribe } = this.podcastAudioService.listenToPodcastProgress(
        session.campaignId,
        session.id,
        version
      );

      this.podcastProgressUnsubscribe = unsubscribe;

      // Step 2: Create effect to watch progress
      const progressEffect = runInInjectionContext(this.injector, () => effect(() => {
        const currentProgress = progress();
        if (currentProgress) {
          this.podcastProgress.set(currentProgress);
          this.podcastGenerationProgress.set(currentProgress.message);
          this.podcastGenerationProgressPercent.set(currentProgress.progress);

          if (currentProgress.error) {
            this.podcastError.set(currentProgress.error);
          }

          if (currentProgress.status === 'completed' || currentProgress.status === 'failed') {
            setTimeout(() => {
              this.isGeneratingPodcast.set(false);
              this.cleanupPodcastProgressListener();
              progressEffect.destroy();
            }, 3000);
          }
        }
      }));

      // Step 3: Start generation (fire-and-forget) - now includes script
      await this.podcastAudioService.startPodcastGeneration(
        session.campaignId,
        session.id,
        version,
        session.content,                      // Story
        session.title || 'Untitled Session',  // Title
        session.sessionDate                    // Date
      );

    } catch (error: unknown) {
      console.error('Failed to start podcast generation:', error);
      this.podcastError.set((error as Error)?.message || 'Failed to start podcast generation');
      this.podcastGenerationProgress.set('');
      this.podcastGenerationProgressPercent.set(0);
      this.isGeneratingPodcast.set(false);
      this.cleanupPodcastProgressListener();
    }
  }

  downloadPodcast(podcast: PodcastVersion): void {
    if (!podcast.audioUrl) {
      this.podcastError.set('Audio not available for download.');
      return;
    }
    const session = this.currentSession();
    const filename = `${session?.title || 'podcast'}-v${podcast.version}.mp3`;
    this.podcastAudioService.downloadPodcastMP3(podcast.audioUrl, filename);
  }
}
