import { Component, effect, signal, computed, inject, ChangeDetectionStrategy, Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, ActivatedRoute } from '@angular/router';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { AudioBackendOperationsService } from './services/audio-backend-operations.service';
import { PodcastGenerationService } from './services/podcast-generation.service';
import { CorrectionsSaveService } from './services/corrections-save.service';
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
import { SessionStoryComponent, SessionMetaUpdate } from './session-story.component';
import { SessionProgressCardComponent } from './session-progress-card.component';
import { SessionListSidebarComponent } from './session-list-sidebar.component';
import { CampaignSelectorComponent } from '../campaign/campaign-selector.component';
import { httpsCallable, Functions } from 'firebase/functions';
import { FirebaseService } from '../core/firebase.service';
import { ToastService } from '../shared/services/toast.service';

@Component({
  selector: 'app-audio-session',
  imports: [SessionStoryComponent, SessionProgressCardComponent, SessionListSidebarComponent, CampaignSelectorComponent],
  providers: [PodcastGenerationService, CorrectionsSaveService],
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
        <app-session-list-sidebar
          [sessions]="sortedSessions()"
          [currentSessionId]="currentSession()?.id ?? null"
          [userId]="userId()"
          [mobileLabel]="currentSession()?.title || 'Select a session'"
          (sessionSelected)="selectSession($event)"
          (newRequested)="navigateToNew()"
        />

        <!-- Right panel: Session details -->
        <main class="flex-1 min-w-0">
          <div class="grid">
            @if (currentSession()) {
              <app-session-progress-card
                [progress]="displayProgress()"
                (cancelled)="cancelCurrentOperation()"
                (retry)="retryFailedOperation()"
              />

              <app-session-story
                [title]="currentSession()?.title || 'Session Story'"
                [subtitle]="formatSubtitle(currentSession())"
                [sessionDate]="currentSession()?.sessionDate || ''"
                [story]="currentSession()?.content || ''"
                [transcript]="currentSession()?.rawStory || currentSession()?.transcription?.rawTranscript || ''"
                [isBusy]="isBusy()"
                [canRegenerate]="canRegenerateStory()"
                [canEditStory]="canEditStory()"
                [canEditCorrections]="canEditCorrections()"
                [corrections]="correctionsSave.corrections()"
                [correctionsStatus]="correctionsSave.saveStatus()"
                [podcasts]="podcasts()"
                [isGeneratingPodcast]="podcastGen.isGenerating()"
                [podcastGenerationProgress]="podcastGen.progressMessage()"
                [podcastGenerationProgressPercent]="podcastGen.progressPercent()"
                [podcastError]="podcastGen.error()"
                [canGeneratePodcast]="canGeneratePodcast()"
                [hasActiveBackgroundJob]="hasActiveBackgroundJob()"
                [backgroundJobMessage]="backgroundJobMessage()"
                (storyUpdated)="saveStoryEdits($event)"
                (regenerate)="regenerateStory()"
                (correctionsChanged)="correctionsSave.onInput($event)"
                (generatePodcast)="generatePodcast()"
                (downloadPodcast)="downloadPodcast($event)"
                (metaUpdated)="saveSessionMeta($event)"
                (deleteSession)="deleteCurrentSession()"
              ></app-session-story>
            }

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
export class AudioSessionComponent {
  private readonly campaignContext = inject(CampaignContextService);
  private readonly campaignService = inject(CampaignService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly sessionStateService = inject(AudioSessionStateService);
  private readonly backendOperations = inject(AudioBackendOperationsService);
  readonly authService = inject(AuthService);
  readonly formatting = inject(FormattingService);
  private readonly firebaseService = inject(FirebaseService);
  private readonly toastService = inject(ToastService);
  readonly podcastGen = inject(PodcastGenerationService);
  readonly correctionsSave = inject(CorrectionsSaveService);
  private functions: Functions;

  userId = computed(() => this.authService.currentUser()?.uid || null);
  campaignId = computed(() => this.campaignContext.selectedCampaignId());

  // Session selection
  private selectedSessionId = signal<string | null>(null);

  currentSession = computed(() => {
    const id = this.selectedSessionId();
    if (!id) return null;
    return this.sessions().find(s => s.id === id) ?? null;
  });

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

  sessions: Signal<AudioSessionRecord[]>;
  sortedSessions: Signal<(AudioSessionRecord & Record<string, unknown>)[]>;

  // Progress display (handles both unified and legacy sessions)
  displayProgress = computed(() => {
    const session = this.currentSession();
    if (!session) return null;

    if (session.progress) {
      const stage = session.progress.stage;
      const isActiveStage = !['idle', 'completed', 'failed'].includes(stage);
      if (isActiveStage && session.progress.updatedAt) {
        const updatedAt = session.progress.updatedAt instanceof Date
          ? session.progress.updatedAt
          : new Date(session.progress.updatedAt);
        const staleThresholdMs = 45 * 60 * 1000;
        if (Date.now() - updatedAt.getTime() > staleThresholdMs) {
          return {
            ...session.progress,
            stage: 'failed' as const,
            progress: 0,
            message: 'Operation timed out. Click retry to try again.',
            error: `Operation stalled at "${stage}" (last update: ${updatedAt.toLocaleString()})`,
          };
        }
      }
      return session.progress;
    }

    // Synthetic progress from legacy status field
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

    return null;
  });

  isBusy = computed(() => {
    const p = this.displayProgress();
    return !!p && !['idle', 'completed', 'failed'].includes(p.stage);
  });

  constructor() {
    this.functions = this.firebaseService.requireFunctions();
    this.sessions = this.sessionStateService.sessions;
    this.sortedSessions = this.sessionStateService.sortedSessions;

    // Route param sync for session selection
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const sessionIdFromRoute = params.get('sessionId');
      const sessions = this.sortedSessions();

      if (sessionIdFromRoute && sessions.length > 0) {
        const sessionToSelect = sessions.find(s => s.id === sessionIdFromRoute);
        if (sessionToSelect && this.selectedSessionId() !== sessionIdFromRoute) {
          this.selectSessionWithoutNavigation(sessionToSelect);
        }
      }
    });

    // Auto-select session based on route or first available
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

      if (sessionIdFromRoute) {
        const sessionToSelect = sessions.find(s => s.id === sessionIdFromRoute);
        if (sessionToSelect && currentId !== sessionIdFromRoute) {
          this.selectSessionWithoutNavigation(sessionToSelect);
        }
        return;
      }

      if (!currentId || !sessions.some(session => session.id === currentId)) {
        this.selectSession(sessions[0]);
      }
    });

    // Sync corrections service to current session
    effect(() => {
      this.correctionsSave.syncToSession(this.currentSession());
    });
  }

  // --- Session selection ---

  selectSession(session: AudioSessionRecord): void {
    this.selectSessionWithoutNavigation(session);
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
  }

  formatSubtitle(session: AudioSessionRecord | null): string {
    if (!session) return '';
    return `${session.audioFileName || 'Unknown'} · ${session.sessionDate || 'No date'}`;
  }

  // --- Story operations ---

  async regenerateStory(): Promise<void> {
    if (!this.canRegenerateStory()) return;
    const session = this.currentSession();
    if (!session?.rawStory && !session?.transcription) return;

    const campaignId = session.campaignId;
    if (!campaignId) {
      this.failSession('No campaign selected.');
      return;
    }

    try {
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

      const kankaEnabled = this.campaignContext.selectedCampaign()?.settings?.kankaEnabled ?? false;
      await this.backendOperations.regenerateStory(
        campaignId,
        session.id,
        {
          enableKankaContext: kankaEnabled,
          userCorrections: this.correctionsSave.corrections()
        }
      );
    } catch (error: unknown) {
      logger.error('Failed to start story regeneration:', error);
      this.failSession((error as Error)?.message || 'Failed to start story regeneration');
    }
  }

  saveStoryEdits(content: string): void {
    if (!this.canEditStory()) return;
    const session = this.currentSession();
    if (!session) return;
    this.sessionStateService.updateSession(session.id, { content, status: 'completed' });
  }

  saveSessionMeta(meta: SessionMetaUpdate): void {
    if (!this.isSessionOwner()) return;
    const session = this.currentSession();
    if (!session) return;
    this.sessionStateService.updateSession(session.id, {
      title: meta.title,
      sessionDate: meta.sessionDate
    });
  }

  async deleteCurrentSession(): Promise<void> {
    if (!this.isSessionOwner()) return;
    const session = this.currentSession();
    if (!session) return;
    try {
      await this.sessionStateService.deleteSession(session.id);
      this.selectedSessionId.set(null);
    } catch (error) {
      logger.error('Failed to delete session:', error);
    }
  }

  // --- Podcast operations ---

  async generatePodcast(): Promise<void> {
    const session = this.currentSession();
    if (!session || !this.canGeneratePodcast()) return;
    await this.podcastGen.generate(session);
  }

  downloadPodcast(podcast: PodcastVersion): void {
    this.podcastGen.download(podcast, this.currentSession()?.title || 'podcast');
  }

  // --- Progress operations ---

  cancelCurrentOperation(): void {
    const session = this.currentSession();
    logger.debug('[Progress] Cancel requested for stage:', session?.progress?.stage);
    this.toastService.show('Operation cancellation is not yet implemented. The operation will complete in the background.', 'warning');
  }

  async retryFailedOperation(): Promise<void> {
    const session = this.currentSession();
    const display = this.displayProgress();
    if (!display || display.stage !== 'failed') {
      logger.warn('[Retry] Cannot retry - session is not in failed state');
      return;
    }

    const originalStage = session?.progress?.stage;
    const podcastStages = ['generating-podcast-script', 'generating-podcast-audio'];

    if (originalStage && podcastStages.includes(originalStage)) {
      logger.debug('[Retry] Clearing stuck podcast progress for session:', session?.id);
      if (session) {
        await this.sessionStateService.persistSessionPatch(session.id, {
          status: 'completed',
          progress: {
            stage: 'completed',
            progress: 100,
            message: 'Ready',
            startedAt: new Date(),
            updatedAt: new Date()
          } as SessionProgress
        });
      }
      return;
    }

    logger.debug('[Retry] Retrying failed transcription for session:', session?.id);

    const storageUrl = session?.storageUrl || null;
    if (!storageUrl) {
      this.toastService.show('Cannot retry: No audio file found for this session.', 'error');
      return;
    }

    if (!session?.campaignId) {
      this.toastService.show('Cannot retry: No campaign selected.', 'error');
      return;
    }

    await this.callTranscribeAudioFast(
      session.campaignId,
      session.id,
      storageUrl,
      session.audioFileName || 'audio.wav',
      this.correctionsSave.corrections() || undefined
    );
  }

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
      } else {
        logger.error('[TranscribeFast] Function returned error:', result.data.message);
        this.failSession(result.data.message);
      }
    } catch (error: unknown) {
      logger.error('[TranscribeFast] Failed to call transcribeAudioFast:', error);
      this.failSession((error as Error)?.message || 'Failed to start transcription');
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
}
