import { Component, effect, signal, computed, inject, resource, ChangeDetectionStrategy, Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, ActivatedRoute } from '@angular/router';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { AudioBackendOperationsService } from './services/audio-backend-operations.service';
import { PodcastGenerationService } from './services/podcast-generation.service';
import { CorrectionsSaveService } from './services/corrections-save.service';
import { AudioCompleteProcessingService } from './services/audio-complete-processing.service';
import { AudioStorageService } from './services/audio-storage.service';
import { AuthService } from '../auth/auth.service';
import * as logger from '../shared/logger';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { CampaignService } from '../campaign/campaign.service';
import {
  AudioSessionRecord,
  SessionProgress,
  SessionProgressStage
} from './services/audio-session.models';
import { isActiveStage, toDisplayProgress } from './services/session-progress.utils';
import { SessionStoryComponent, SessionMetaUpdate } from './session-story.component';
import { SessionProgressCardComponent } from './session-progress-card.component';
import { SessionRecordingComponent } from './session-recording.component';
import { SessionListSidebarComponent } from './session-list-sidebar.component';
import { CampaignSelectorComponent } from '../campaign/campaign-selector.component';
import { ToastService } from '../shared/services/toast.service';
import { isPermissionDenied, PERMISSION_DENIED_MESSAGE } from '../shared/utils/callable-error';

/** Shown instead of a retry button when a failed session has no stored audio to retry from. */
export const NO_STORED_AUDIO_MESSAGE = 'Geen opgeslagen audio; upload de opname opnieuw.';

const PODCAST_STAGES: SessionProgressStage[] = ['generating-podcast-script', 'generating-podcast-audio'];

@Component({
  selector: 'app-audio-session',
  imports: [SessionStoryComponent, SessionProgressCardComponent, SessionRecordingComponent, SessionListSidebarComponent, CampaignSelectorComponent],
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
                [retryUnavailableMessage]="retryUnavailableMessage()"
                (cancelled)="cancelCurrentOperation()"
                (retry)="retryFailedOperation()"
              />

              @if (currentSession()?.audioRecording; as recording) {
                <app-session-recording
                  [audioUrl]="recordingUrl.value() ?? null"
                  [fileName]="recording.fileName"
                  [durationSec]="recording.durationSec"
                  [sizeBytes]="recording.sizeBytes"
                  [canRetranscribe]="isSessionOwner()"
                  [busy]="isBusy()"
                  (retranscribe)="retranscribe()"
                />
              }

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
                [campaignId]="campaignId() || ''"
                [sessionId]="currentSession()?.id || ''"
                [podcasts]="podcasts()"
                [isGeneratingPodcast]="podcastStatus().isGenerating"
                [podcastGenerationProgress]="podcastStatus().message"
                [podcastGenerationProgressPercent]="podcastStatus().percent"
                [podcastError]="podcastGen.error()"
                [canGeneratePodcast]="canGeneratePodcast()"
                (storyUpdated)="saveStoryEdits($event)"
                (regenerate)="regenerateStory()"
                (correctionsChanged)="correctionsSave.onInput($event)"
                (generatePodcast)="generatePodcast()"
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
  private readonly toastService = inject(ToastService);
  private readonly completeProcessing = inject(AudioCompleteProcessingService);
  private readonly audioStorage = inject(AudioStorageService);
  readonly podcastGen = inject(PodcastGenerationService);
  readonly correctionsSave = inject(CorrectionsSaveService);

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
  podcastStatus = computed(() => this.podcastGen.statusFor(this.currentSession()));

  /** Download URL of the stored recording, for playback. */
  readonly recordingUrl = resource({
    params: () => this.currentSession()?.audioRecording?.storagePath,
    loader: ({ params }) => this.audioStorage.getDownloadUrl(params),
  });
  isSessionOwner = computed(() => {
    const session = this.currentSession();
    const userId = this.userId();
    return !!session && this.campaignService.isSessionOwner(session, userId);
  });

  canRegenerateStory = computed(() => this.isSessionOwner());
  canGeneratePodcast = computed(() => this.isSessionOwner());
  canEditStory = computed(() => this.isSessionOwner());
  canEditCorrections = computed(() => !!this.currentSession());

  sessions: Signal<AudioSessionRecord[]>;
  sortedSessions: Signal<(AudioSessionRecord & Record<string, unknown>)[]>;

  // Progress display (handles both unified and legacy sessions, and stale progress)
  displayProgress = computed(() => {
    const session = this.currentSession();
    return session ? toDisplayProgress(session) : null;
  });

  /**
   * Reason a failed operation cannot be retried: a failed transcription or story
   * needs the stored recording (or the uploaded sources) to start again.
   */
  retryUnavailableMessage = computed(() => {
    const session = this.currentSession();
    const progress = this.displayProgress();
    if (!session || progress?.stage !== 'failed') return null;
    const failedStage = session.progress?.stage;
    if (failedStage && PODCAST_STAGES.includes(failedStage)) return null;
    if (session.audioRecording || session.audioSources?.length) return null;
    return NO_STORED_AUDIO_MESSAGE;
  });

  isBusy = computed(() => isActiveStage(this.displayProgress()?.stage));

  constructor() {
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
      this.failSession(this.callableFailureMessage(error, 'Failed to start story regeneration'));
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
      if (session.audioRecording || session.audioSources?.length) {
        await this.audioStorage.deleteSessionAudio(session.campaignId, session.id).catch((error: unknown) =>
          logger.warn('Failed to delete stored audio, deleting session anyway:', error)
        );
      }
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

    if (originalStage && PODCAST_STAGES.includes(originalStage)) {
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

    if (!session?.campaignId) {
      this.toastService.show('Cannot retry: No campaign selected.', 'error');
      return;
    }

    const recording = session.audioRecording;
    if (recording) {
      await this.startTranscription(session.id, () =>
        this.completeProcessing.transcribeStoredRecording(
          session.campaignId,
          session.id,
          recording,
          this.correctionsSave.corrections() || undefined
        )
      );
      return;
    }

    // Processing failed before the recording was stored: the uploaded sources
    // are kept until it succeeds, so run the processing step again.
    if (session.audioSources?.length) {
      await this.startProcessing(session.id, () =>
        this.completeProcessing.processUploadedSources(
          session.campaignId,
          session.id,
          this.correctionsSave.corrections() || undefined
        )
      );
      return;
    }

    // Sessions without stored audio (e.g. from before recordings were stored)
    // cannot be transcribed again.
    this.toastService.show(NO_STORED_AUDIO_MESSAGE, 'error');
  }

  /** Re-transcribe the stored recording and generate a new story from it. */
  async retranscribe(): Promise<void> {
    const session = this.currentSession();
    const recording = session?.audioRecording;
    if (!session || !recording || !this.isSessionOwner() || this.isBusy()) return;

    const confirmed = await this.toastService.confirm(
      'Transcribe the recording again? The current transcript and story will be replaced by new ones. Your corrections are kept and applied.'
    );
    if (!confirmed) return;

    await this.startTranscription(session.id, () =>
      this.completeProcessing.transcribeStoredRecording(
        session.campaignId,
        session.id,
        recording,
        this.correctionsSave.corrections() || undefined
      )
    );
  }

  /** Mark the session as transcribing, start the backend job and surface failures. */
  private startTranscription(
    sessionId: string,
    start: () => Promise<{ success: boolean; message: string }>
  ): Promise<void> {
    return this.startBackendJob(sessionId, 'transcribing', 70, 'Starting fast transcription...', start);
  }

  /** Mark the session as processing audio, start the backend job and surface failures. */
  private startProcessing(
    sessionId: string,
    start: () => Promise<{ success: boolean; message: string }>
  ): Promise<void> {
    return this.startBackendJob(sessionId, 'processing-audio', 50, 'Starting audio processing...', start);
  }

  private async startBackendJob(
    sessionId: string,
    stage: SessionProgress['stage'],
    progress: number,
    message: string,
    start: () => Promise<{ success: boolean; message: string }>
  ): Promise<void> {
    try {
      logger.debug(`[BackendJob] Starting ${stage}`, { sessionId });

      await this.sessionStateService.persistSessionPatch(sessionId, {
        status: 'processing',
        progress: {
          stage,
          progress,
          message,
          startedAt: new Date(),
          updatedAt: new Date()
        } as SessionProgress
      });

      const result = await start();

      if (result.success) {
        logger.info('[BackendJob] Function call successful:', result.message);
      } else {
        logger.error('[BackendJob] Function returned error:', result.message);
        this.failSession(result.message);
      }
    } catch (error: unknown) {
      this.failSession(this.callableFailureMessage(error, 'Failed to start processing'));
    }
  }

  /** Message for a failed callable; permission errors also get a toast. */
  private callableFailureMessage(error: unknown, fallback: string): string {
    if (isPermissionDenied(error)) {
      logger.warn('[BackendJob] Permission denied by the backend');
      this.toastService.showCallableError(error);
      return PERMISSION_DENIED_MESSAGE;
    }
    logger.error(`[BackendJob] ${fallback}:`, error);
    return (error as Error)?.message || fallback;
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
