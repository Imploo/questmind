import { Component, effect, computed, inject, resource, ChangeDetectionStrategy, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
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
import { CampaignStoryService } from '../campaign-story/campaign-story.service';
import { isInStory, isUsableSession, latestCompletedVersion } from '../campaign-story/campaign-story.utils';
import { FormattingService } from '../shared/formatting.service';
import { ToastService } from '../shared/services/toast.service';
import { callableErrorMessage, isPermissionDenied } from '../shared/utils/callable-error';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

const PODCAST_STAGES: SessionProgressStage[] = ['generating-podcast-script', 'generating-podcast-audio'];

@Component({
  selector: 'app-audio-session',
  imports: [RouterLink, SessionStoryComponent, SessionProgressCardComponent, SessionRecordingComponent, TranslatePipe],
  providers: [PodcastGenerationService, CorrectionsSaveService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-4xl mx-auto space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <nav class="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-white" [attr.aria-label]="'audio.page.breadcrumb' | translate">
          <a routerLink="/campaigns" class="crumb">{{ 'campaign.page.back' | translate }}</a>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 6l6 6-6 6" /></svg>
          <a [routerLink]="['/campaign', campaignId()]" class="crumb">{{ campaignName() }}</a>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 6l6 6-6 6" /></svg>
          <a [routerLink]="['/campaign', campaignId(), 'sessions']" class="crumb">{{ 'campaign.page.tabs.sessions' | translate }}</a>
        </nav>

        @if (currentSession()) {
          <div class="flex gap-2">
            @if (previousSession(); as previous) {
              <a
                [routerLink]="['/campaign', campaignId(), 'sessions', previous.id]"
                class="qm-btn"
                [attr.aria-label]="'audio.page.previousLabel' | translate: previous.title"
                data-testid="previous-session"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 6l-6 6 6 6" /></svg>
                {{ 'audio.page.previous' | translate }}
              </a>
            }
            @if (nextSession(); as next) {
              <a
                [routerLink]="['/campaign', campaignId(), 'sessions', next.id]"
                class="qm-btn"
                [attr.aria-label]="'audio.page.nextLabel' | translate: next.title"
                data-testid="next-session"
              >
                {{ 'audio.page.next' | translate }}
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 6l6 6-6 6" /></svg>
              </a>
            }
          </div>
        }
      </div>

      @if (showStoryNote()) {
        <div class="story-note flex flex-wrap items-center gap-x-4 gap-y-3" data-testid="story-note">
          <span class="qm-medallion qm-medallion-sm" aria-hidden="true">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 7v14M3 18a1 1 0 01-1-1V4a1 1 0 011-1h5a4 4 0 014 4 4 4 0 014-4h5a1 1 0 011 1v13a1 1 0 01-1 1h-6a3 3 0 00-3 3 3 3 0 00-3-3z" /></svg>
          </span>
          <div class="min-w-0 flex-[1_1_16rem]">
            <p class="text-sm font-bold">{{ 'campaignStory.sessionNotIncluded' | translate }}</p>
            <p class="text-[13px] text-gray-700 mt-0.5">{{ 'campaignStory.sessionNotIncludedHelp' | translate }}</p>
          </div>
          <a [routerLink]="['/campaign', campaignId(), 'story']" class="qm-btn qm-btn-ink">
            {{ 'campaignStory.updateCampaignStory' | translate }}
          </a>
        </div>
      }

      <!-- The session itself -->
      <div class="grid">
        @if (currentSession()) {
          <app-session-progress-card
            [progress]="displayProgress()"
            [retryUnavailableMessage]="retryUnavailableMessage()"
            (cancelled)="cancelCurrentOperation()"
            (retry)="retryFailedOperation()"
          />

          <app-session-story
            [title]="currentSession()?.title || ('audio.defaultStoryTitle' | translate)"
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
        }

        @if (!currentSession()) {
          @if (sessionStateService.isLoaded()) {
            <div class="qm-panel qm-hero qm-empty">
              <h2 class="qm-empty-title !mt-0">{{ 'audio.page.notFoundTitle' | translate }}</h2>
              <p class="qm-empty-text">{{ 'audio.page.notFoundText' | translate }}</p>
              <a [routerLink]="['/campaign', campaignId(), 'sessions']" class="qm-btn qm-btn-lg mt-6">
                {{ 'campaignStory.toSessions' | translate }}
              </a>
            </div>
          } @else {
            <div class="text-center py-12" role="status">
              <span class="qm-spinner qm-spinner-lg qm-spinner-light"></span>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .crumb {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      color: #fff;
      text-decoration: none;
      text-shadow: 0 1px 6px rgba(34, 16, 80, 0.4);
    }
    .crumb:hover { text-decoration: underline; }

    /* The session is missing from the campaign story: a gold note, the thing to do next. */
    .story-note {
      padding: 0.85rem 1rem;
      border-radius: 14px;
      color: var(--ink);
      background: var(--gold-soft);
      border: 1px solid var(--gold);
      box-shadow: var(--panel-shadow);
    }
  `]
})
export class AudioSessionComponent {
  private readonly campaignContext = inject(CampaignContextService);
  private readonly campaignService = inject(CampaignService);
  private readonly router = inject(Router);
  private readonly formatting = inject(FormattingService);
  private readonly route = inject(ActivatedRoute);
  protected readonly sessionStateService = inject(AudioSessionStateService);
  private readonly backendOperations = inject(AudioBackendOperationsService);
  readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly completeProcessing = inject(AudioCompleteProcessingService);
  private readonly audioStorage = inject(AudioStorageService);
  readonly podcastGen = inject(PodcastGenerationService);
  readonly correctionsSave = inject(CorrectionsSaveService);
  private readonly i18n = inject(I18nService);

  private readonly storyService = inject(CampaignStoryService);

  userId = computed(() => this.authService.currentUser()?.uid || null);
  campaignId = computed(() => this.campaignContext.selectedCampaignId());
  campaignName = computed(() => this.campaignContext.selectedCampaign()?.name ?? '');

  /** The session in the address; the page shows whichever session it names. */
  private readonly sessionId = toSignal(this.route.paramMap.pipe(map(params => params.get('sessionId'))), {
    initialValue: this.route.snapshot.paramMap.get('sessionId'),
  });

  currentSession = computed(() => {
    const id = this.sessionId();
    if (!id) return null;
    return this.sessions().find(s => s.id === id) ?? null;
  });

  /** The session played before this one (older), and the one played after it (newer). */
  previousSession = computed(() => this.neighbour(1));
  nextSession = computed(() => this.neighbour(-1));

  /** For the owner of the campaign: this finished session is missing from the campaign story. */
  showStoryNote = computed(() => {
    const session = this.currentSession();
    const campaign = this.campaignContext.selectedCampaign();
    if (!session || !campaign || campaign.ownerId !== this.userId()) return false;
    if (this.storyService.isLoading() || !isUsableSession(session)) return false;
    return !isInStory(latestCompletedVersion(this.storyService.versions()), session);
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
    return this.i18n.t().audio.session.noStoredAudio;
  });

  isBusy = computed(() => isActiveStage(this.displayProgress()?.stage));

  constructor() {
    this.sessions = this.sessionStateService.sessions;
    this.sortedSessions = this.sessionStateService.sortedSessions;

    // Sync corrections service to current session
    effect(() => {
      this.correctionsSave.syncToSession(this.currentSession());
    });
  }

  // --- Session navigation ---

  private neighbour(offset: number): (AudioSessionRecord & Record<string, unknown>) | null {
    const sessions = this.sortedSessions();
    const index = sessions.findIndex(session => session.id === this.sessionId());
    if (index < 0) return null;
    return sessions[index + offset] ?? null;
  }

  formatSubtitle(session: AudioSessionRecord | null): string {
    if (!session) return '';
    const texts = this.i18n.t();
    return `${this.formatting.formatDay(session.sessionDate) || texts.audio.noDate} · ${session.audioFileName || texts.common.unknown}`;
  }

  // --- Story operations ---

  async regenerateStory(): Promise<void> {
    if (!this.canRegenerateStory()) return;
    const session = this.currentSession();
    if (!session?.rawStory && !session?.transcription) return;

    const campaignId = session.campaignId;
    if (!campaignId) {
      this.toastService.show(this.i18n.t().audio.noCampaignSelected, 'error');
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
      this.failSession(
        this.reportCallableFailure(error, 'Failed to start story regeneration', this.i18n.t().audio.session.regenerateFailed)
      );
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
      void this.router.navigate(['/campaign', session.campaignId, 'sessions']);
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
    this.toastService.show(this.i18n.t().audio.session.cancelNotImplemented, 'warning');
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
      this.toastService.show(this.i18n.t().audio.session.retryNoCampaign, 'error');
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
    this.toastService.show(this.i18n.t().audio.session.noStoredAudio, 'error');
  }

  /** Re-transcribe the stored recording and generate a new story from it. */
  async retranscribe(): Promise<void> {
    const session = this.currentSession();
    const recording = session?.audioRecording;
    if (!session || !recording || !this.isSessionOwner() || this.isBusy()) return;

    const confirmed = await this.toastService.confirm(this.i18n.t().audio.session.retranscribeConfirm);
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
        // The server's message is not shown: it is stored as the raw error only.
        this.toastService.show(this.i18n.t().audio.session.processingStartFailed, 'error', 6000);
        this.failSession(result.message);
      }
    } catch (error: unknown) {
      this.failSession(
        this.reportCallableFailure(error, 'Failed to start processing', this.i18n.t().audio.session.processingStartFailed)
      );
    }
  }

  /**
   * Tell the user, in the active language, why a callable failed, and return the
   * raw error text for the progress document (shown as technical details only).
   */
  private reportCallableFailure(error: unknown, logLabel: string, fallback: string): string {
    if (isPermissionDenied(error)) {
      logger.warn('[BackendJob] Permission denied by the backend');
    } else {
      logger.error(`[BackendJob] ${logLabel}:`, error);
    }
    this.toastService.show(callableErrorMessage(error, this.i18n.t().errors, fallback), 'error', 6000);
    return (error as Error)?.message || logLabel;
  }

  /** Store a failure. `message` is raw, untranslated text: the progress card shows its own. */
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
