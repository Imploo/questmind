import { Component, OnDestroy, effect, signal, computed, inject, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, timer, firstValueFrom, catchError } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { httpsCallable } from 'firebase/functions';
import { AudioStorageService } from './audio-storage.service';
// NOTE: These frontend services are still used for "Regenerate" and "Retranscribe" features
// Initial processing now uses backend (AudioCompleteProcessingService)
// TODO: Migrate regenerate/retranscribe to backend for complete migration
import { AudioTranscriptionService } from './audio-transcription.service';
import { SessionStoryService } from './session-story.service';
import { AudioSessionStateService } from './audio-session-state.service';
import { AudioCompleteProcessingService } from './audio-complete-processing.service';
import { PodcastAudioService, PodcastProgress } from './podcast-audio.service';
import { AuthService } from '../auth/auth.service';
import { FormattingService } from '../shared/formatting.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { CampaignService } from '../campaign/campaign.service';
import { FirebaseService } from '../core/firebase.service';
import {
  AudioSessionRecord,
  AudioUpload,
  StorageMetadata,
  TranscriptionResult,
  PodcastVersion,
  ProcessingProgress
} from './audio-session.models';
import { AudioUploadComponent } from './audio-upload.component';
import { TranscriptionStatusComponent } from './transcription-status.component';
import { SessionStoryComponent } from './session-story.component';
import { KankaService } from '../kanka/kanka.service';
import { KankaSearchResult } from '../kanka/kanka.models';

type Stage = 'idle' | 'uploading' | 'transcribing' | 'generating' | 'completed' | 'failed';

@Component({
  selector: 'app-audio-session',
  standalone: true,
  imports: [CommonModule, AudioUploadComponent, TranscriptionStatusComponent, SessionStoryComponent],
  template: `
    <div class="grid gap-6">
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
      } @else {
        @if (!campaignId()) {
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
          <div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <app-audio-upload
              [isBusy]="isBusy()"
              [userId]="userId()"
              [campaignId]="campaignId()"
              [canUpload]="canUploadAudio()"
              (uploadRequested)="startCompleteProcessing($event)"
            ></app-audio-upload>
            <app-transcription-status
              [stage]="stage()"
              [progress]="progress()"
              [statusMessage]="statusMessage()"
              (cancel)="cancelProcessing()"
              (retry)="retryProcessing()"
            ></app-transcription-status>
          </div>

        @if (currentSession()) {
          <div class="border border-gray-200 rounded-xl bg-white shadow-sm p-4">
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="m-0 text-sm font-semibold text-gray-700">Kanka campaign context</p>
                <p class="m-0 text-xs text-gray-500">
                  Use campaign data to improve name accuracy and quest references.
                </p>
                @if (!kankaAvailable()) {
                  <p class="m-0 text-xs text-amber-600">
                    Configure Kanka token and campaign ID in the environment to enable this.
                  </p>
                }
              </div>
              <label class="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  [checked]="kankaEnabled()"
                  [disabled]="!kankaAvailable() || isBusy()"
                  (change)="toggleKankaIntegration()"
                />
                <span>Enable</span>
              </label>
            </div>
          </div>
          <app-session-story
            [title]="currentSession()?.title || 'Session Story'"
            [subtitle]="formatSubtitle(currentSession())"
            [story]="currentSession()?.content || ''"
            [transcript]="currentSession()?.transcription?.rawTranscript || ''"
            [isBusy]="isBusy()"
            [canRetranscribe]="canRetranscribe()"
            [canRegenerate]="canRegenerateStory()"
            [canEditStory]="canEditStory()"
            [canEditCorrections]="canEditCorrections()"
            [corrections]="userCorrections()"
            [correctionsStatus]="correctionsSaveStatus()"
            (storyUpdated)="saveStoryEdits($event)"
            (regenerate)="regenerateStory()"
            (retranscribe)="retranscribeSession()"
            (correctionsChanged)="onCorrectionsInput($event)"
          ></app-session-story>
        }

        @if (currentSession()?.content) {
          <div class="mt-6 p-6 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="text-lg font-semibold text-purple-900 m-0">🎙️ Session Podcast</h3>
                <p class="text-sm text-purple-700 m-0 mt-1">
                  Genereer een boeiende audio recap met twee hosts die de sessie bespreken
                </p>
              </div>
              <button
                (click)="generatePodcast()"
                [disabled]="isGeneratingPodcast() || isBusy() || !canGeneratePodcast()"
                class="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                @if (isGeneratingPodcast()) {
                  <span class="flex items-center gap-2">
                    <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{{ podcastGenerationProgress() }}</span>
                  </span>
                } @else {
                  Genereer Podcast
                }
              </button>
            </div>

            @if (podcastError()) {
              <div class="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p class="text-sm text-red-700 m-0">{{ podcastError() }}</p>
              </div>
            }

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

            @if (podcasts().length > 0) {
              <div class="mt-4 space-y-3">
                <h4 class="text-sm font-medium text-purple-900 m-0">
                  Gegenereerde Podcasts ({{ podcasts().length }})
                </h4>
                @for (podcast of podcasts(); track podcast.version) {
                  <div class="flex items-center gap-4 p-4 bg-white rounded-lg border border-purple-100 hover:border-purple-300 transition-colors">
                    <div class="flex-shrink-0">
                      <span class="inline-flex items-center justify-center w-10 h-10 bg-purple-100 text-purple-700 rounded-full font-semibold text-sm">
                        v{{ podcast.version }}
                      </span>
                    </div>

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-gray-900">
                          {{ currentSession()?.title || 'Untitled Session' }} - Podcast v{{ podcast.version }}
                        </span>
                        @if (podcast.status === 'pending' || podcast.status === 'generating_audio' || podcast.status === 'uploading') {
                          <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{{ podcast.progressMessage || 'Generating...' }}</span>
                        } @else if (podcast.status === 'failed') {
                          <span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Failed</span>
                        } @else if (podcast.status === 'completed') {
                          <span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            {{ podcast.audioUrl ? 'Audio Ready' : 'Audio Pending' }}
                          </span>
                        }
                      </div>
                      <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{{ formatting.formatDuration(podcast.duration) }}</span>
                        @if (podcast.fileSize) {
                          <span>•</span>
                          <span>{{ formatting.formatFileSize(podcast.fileSize) }}</span>
                        }
                        <span>•</span>
                        <span>{{ formatting.formatDate(podcast.createdAt) }}</span>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      @if (isPlayingPodcast() && playingPodcastVersion() === podcast.version) {
                        <button
                          (click)="stopPodcast()"
                          class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium"
                          title="Stop afspelen"
                        >
                          ⏹️ Stop
                        </button>
                      } @else {
                        <button
                          (click)="playPodcast(podcast)"
                          [disabled]="isPlayingPodcast() || !podcast.audioUrl"
                          class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                          title="Podcast afspelen"
                        >
                          ▶️ Afspelen
                        </button>
                      }
                      <button
                        (click)="downloadPodcast(podcast)"
                        [disabled]="!podcast.audioUrl"
                        class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Podcast downloaden"
                      >
                        ⬇️ Download
                      </button>
                    </div>
                  </div>
                }
              </div>
            }

            @if (podcasts().length === 0 && !isGeneratingPodcast()) {
              <div class="mt-4 p-4 bg-white rounded-lg border border-purple-100 text-center">
                <p class="text-sm text-gray-500 m-0">
                  Nog geen podcasts gegenereerd. Klik op "Genereer Podcast" om te beginnen.
                </p>
                <p class="text-xs text-gray-400 m-0 mt-1">
                  Podcasts gebruiken Gemini 2.5 Flash TTS met natuurlijk klinkende Nederlandse stemmen
                </p>
              </div>
            }
          </div>
        }

        <div class="border border-gray-200 rounded-xl bg-white shadow-sm p-6">
          <h3 class="text-lg font-semibold m-0 mb-4">Session History</h3>
          @if (sessions().length === 0) {
            <p class="text-sm text-gray-500 m-0">No sessions yet. Upload audio to begin.</p>
          } @else {
            <div class="grid gap-3 md:grid-cols-2">
              @for (session of sessions(); track session.id) {
                <button
                  type="button"
                  class="text-left border border-gray-200 rounded-lg p-4 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  (click)="selectSession(session)"
                >
                  <p class="m-0 text-sm font-semibold text-gray-700">{{ session.title }}</p>
                  <p class="m-0 text-xs text-gray-500">
                    {{ session.sessionDate ? session.sessionDate : 'No date' }} ·
                    {{ session.status }}
                  </p>
                  <p class="m-0 text-xs text-gray-400">
                    Owner: {{ session.ownerEmail || 'Unknown' }}
                    @if (session.ownerId === userId()) { (You) }
                  </p>
                </button>
              }
            </div>
          }
        </div>
      }
    }
    </div>
  `
})
export class AudioSessionComponent implements OnDestroy {
  private readonly campaignContext = inject(CampaignContextService);
  private readonly campaignService = inject(CampaignService);

  userId = computed(() => this.authService.currentUser()?.uid || null);
  campaignId = computed(() => this.campaignContext.selectedCampaignId());
  selectedCampaign = this.campaignContext.selectedCampaign;
  canUploadAudio = computed(() => this.campaignContext.canCreateSessions(this.userId()));
  kankaEnabled = signal(false);
  kankaAvailable = signal(false);
  userCorrections = signal<string>('');
  correctionsSaveStatus = signal<'idle' | 'saving' | 'saved'>('idle');

  // Podcast state
  podcasts = computed(() => this.currentSession()?.podcasts || []);
  isSessionOwner = computed(() => {
    const session = this.currentSession();
    const userId = this.userId();
    return !!session && this.campaignService.isSessionOwner(session, userId);
  });
  canRegenerateStory = computed(() => this.isSessionOwner());
  canRetranscribe = computed(() => this.isSessionOwner() && !!this.currentSession()?.storageMetadata);
  canGeneratePodcast = computed(() => this.isSessionOwner());
  canEditStory = computed(() => this.isSessionOwner());
  canEditCorrections = computed(() => !!this.currentSession());
  isGeneratingPodcast = signal(false);
  podcastProgress = signal<PodcastProgress | null>(null);
  podcastGenerationProgress = signal<string>('');
  podcastGenerationProgressPercent = signal<number>(0);
  podcastError = signal<string>('');
  isPlayingPodcast = signal(false);
  playingPodcastVersion = signal<number | null>(null);
  private currentPodcastAudio: HTMLAudioElement | null = null;
  private progressUnsubscribe?: () => void;

  private processingSub?: Subscription;
  private stageTimerSub?: Subscription;
  private correctionsSaveTimer?: ReturnType<typeof setTimeout>;
  private correctionsStatusTimer?: ReturnType<typeof setTimeout>;
  private activeCorrectionsSessionId: string | null = null;

  stage = signal<Stage>('idle');
  progress = signal<number>(0);
  statusMessage = signal<string>('Waiting for upload.');
  currentSession = signal<AudioSessionRecord | null>(null);
  lastUpload = signal<AudioUpload | null>(null);

  sessions = signal<AudioSessionRecord[]>([]);

  constructor(
    private readonly audioStorageService: AudioStorageService,
    private readonly audioTranscriptionService: AudioTranscriptionService,
    private readonly sessionStoryService: SessionStoryService,
    private readonly sessionStateService: AudioSessionStateService,
    private readonly completeProcessingService: AudioCompleteProcessingService,
    private readonly podcastAudioService: PodcastAudioService,
    public readonly authService: AuthService,
    private readonly injector: Injector,
    public readonly formatting: FormattingService,
    private readonly firebase: FirebaseService,
    private readonly kankaService: KankaService
  ) {
    effect(() => {
      this.selectedCampaign();
      const kankaAvailable = this.sessionStoryService.isKankaAvailable();
      this.kankaAvailable.set(kankaAvailable);
      if (!kankaAvailable) {
        this.kankaEnabled.set(false);
      }
    });
    this.sessions = this.sessionStateService.sessions;

    effect(() => {
      const sessions = this.sessions();
      const current = this.currentSession();
      if (sessions.length === 0) {
        if (current) {
          this.currentSession.set(null);
          this.resetProgress();
        }
        return;
      }
      if (!current || !sessions.some(session => session.id === current.id)) {
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

  /**
   * NEW: Complete processing using backend Cloud Function (Ticket 35)
   * This replaces the old multi-step process with a unified backend pipeline
   */
  async startCompleteProcessing(upload: AudioUpload): Promise<void> {
    if (!this.canUploadAudio()) {
      this.statusMessage.set('You do not have permission to upload in this campaign.');
      this.stage.set('failed');
      return;
    }
    this.lastUpload.set(upload);
    const validationError = this.audioStorageService.validateFile(upload.file);
    if (validationError) {
      this.statusMessage.set(validationError);
      this.stage.set('failed');
      return;
    }

    this.resetProgress();
    this.stage.set('uploading');
    this.statusMessage.set('Starting complete audio processing...');

    const session = this.sessionStateService.createSessionDraft(upload);
    this.currentSession.set(session);
    this.userCorrections.set(session.userCorrections ?? '');
    this.correctionsSaveStatus.set('idle');
    this.refreshSessions();

    try {
      // Start listening to progress BEFORE starting processing
      this.cleanupProgressListener();
      this.progressUnsubscribe = this.completeProcessingService.listenToProgress(
        upload.campaignId,
        session.id,
        (progress: ProcessingProgress) => {
          console.log('Complete processing progress:', progress);

          // Update UI based on status
          this.progress.set(progress.progress);
          this.statusMessage.set(progress.message);

          if (progress.error) {
            this.failSession(progress.error);
            this.cleanupProgressListener();
            return;
          }

          // Map backend status to frontend stage
          switch (progress.status) {
            case 'loading_context':
              this.stage.set('uploading');
              break;
            case 'transcribing':
            case 'transcription_complete':
              this.stage.set('transcribing');
              break;
            case 'generating_story':
            case 'story_complete':
              this.stage.set('generating');
              break;
            case 'generating_script':
            case 'script_complete':
            case 'generating_audio':
            case 'uploading':
              this.stage.set('generating'); // Keep as generating for podcast
              break;
            case 'completed':
              this.stage.set('completed');
              this.cleanupProgressListener();
              this.refreshSessions();
              break;
            case 'failed':
              this.failSession(progress.error || 'Processing failed');
              this.cleanupProgressListener();
              break;
          }
        }
      );

      // Start processing (fire-and-forget)
      await this.completeProcessingService.startCompleteProcessing(
        upload.campaignId,
        session.id,
        upload.file,
        {
          sessionTitle: upload.sessionName || 'Untitled Session',
          sessionDate: upload.sessionDate,
          enableKankaContext: this.kankaEnabled() && this.kankaAvailable(),
          userCorrections: this.userCorrections()
        }
      );

      console.log('Complete processing started, listening for updates...');

    } catch (error: any) {
      console.error('Failed to start complete processing:', error);
      this.failSession(error?.message || 'Failed to start audio processing');
      this.cleanupProgressListener();
    }
  }


  cancelProcessing(): void {
    this.processingSub?.unsubscribe();
    this.stageTimerSub?.unsubscribe();
    this.statusMessage.set('Processing cancelled.');
    this.stage.set('failed');
  }

  retryProcessing(): void {
    const lastUpload = this.lastUpload();
    if (!lastUpload) {
      this.statusMessage.set('No upload available to retry.');
      return;
    }
    void this.startCompleteProcessing(lastUpload);
  }

  regenerateStory(): void {
    if (!this.canRegenerateStory()) {
      return;
    }
    const session = this.currentSession();
    if (!session?.transcription) {
      return;
    }
    this.stage.set('generating');
    this.statusMessage.set('Regenerating story...');
    this.animateStageProgress(1500, 20);

    this.processingSub?.unsubscribe();
    this.processingSub = this.sessionStoryService
      .generateStoryFromTranscript(
        session.transcription.rawTranscript,
        session.title,
        session.sessionDate,
        this.userCorrections(),
        this.kankaEnabled() && this.kankaAvailable()
      )
      .subscribe({
        next: content => {
          const storyRegenerationCount = (session.storyRegenerationCount ?? 0) + 1;
          this.sessionStateService.updateSession(session.id, {
            content,
            status: 'completed',
            storyRegeneratedAt: new Date().toISOString(),
            storyRegenerationCount
          });
          this.finishStage('completed', 'Story updated.');
        },
        error: err => this.failSession(err.message || 'Story generation failed.')
      });
  }

  async retranscribeSession(): Promise<void> {
    if (!this.canRetranscribe()) {
      return;
    }
    const session = this.currentSession();
    const uid = this.userId();
    const campaignId = session?.campaignId;
    if (!session?.storageMetadata) {
      this.failSession('No stored audio file found for this session.');
      return;
    }
    if (!uid) {
      this.failSession('User not authenticated.');
      return;
    }
    if (!campaignId) {
      this.failSession('No campaign selected.');
      return;
    }

    // Check for existing incomplete transcription
    const existingTranscriptionId = await this.audioTranscriptionService.findIncompleteTranscription(
      campaignId,
      session.id
    );

    if (existingTranscriptionId) {
      console.log('Found incomplete transcription, resuming:', existingTranscriptionId);
      this.statusMessage.set('Resuming incomplete transcription...');
    }

    // No need to download the file - Gemini can access Firebase Storage URLs directly
    this.runTranscription(session.storageMetadata, undefined, existingTranscriptionId || undefined);
  }

  saveStoryEdits(content: string): void {
    if (!this.canEditStory()) {
      return;
    }
    const session = this.currentSession();
    if (!session) {
      return;
    }
    this.sessionStateService.updateSession(session.id, { content, status: 'completed' });
    this.refreshSessions();
  }

  selectSession(session: AudioSessionRecord): void {
    this.currentSession.set(session);
    this.userCorrections.set(session.userCorrections ?? '');
    this.correctionsSaveStatus.set('idle');
    switch (session.status) {
      case 'completed':
        this.stage.set('completed');
        this.progress.set(100);
        this.statusMessage.set('Story ready.');
        break;
      case 'failed':
        this.stage.set('failed');
        this.progress.set(0);
        this.statusMessage.set('Session failed. You can retry.');
        break;
      default:
        this.stage.set('idle');
        this.progress.set(0);
        this.statusMessage.set('Loaded session from history.');
        break;
    }
  }

  formatSubtitle(session: AudioSessionRecord | null): string {
    if (!session) {
      return '';
    }
    return `${session.audioFileName} · ${session.sessionDate || 'No date'}`;
  }

  ngOnDestroy(): void {
    this.stopPodcast();
    this.cleanupProgressListener();
    this.processingSub?.unsubscribe();
    this.stageTimerSub?.unsubscribe();
    this.clearCorrectionsTimers();
  }

  private cleanupProgressListener(): void {
    if (this.progressUnsubscribe) {
      this.progressUnsubscribe();
      this.progressUnsubscribe = undefined;
    }
  }

  toggleKankaIntegration(): void {
    this.kankaEnabled.update(value => !value);
  }

  private runTranscription(storage: StorageMetadata, file?: File, existingTranscriptionId?: string): void {
    this.stage.set('transcribing');
    this.statusMessage.set('Transcribing audio...');
    this.animateStageProgress(2200, 35);
    this.processingSub?.unsubscribe();

    const session = this.currentSession();
    const campaignId = session?.campaignId;
    if (!session || !campaignId) {
      return;
    }

    // Use existing transcription ID if provided (resuming), otherwise generate new one
    const transcriptionId = existingTranscriptionId || this.generateId();

    // Check if Kanka context should be fetched
    const shouldFetchKanka = this.kankaEnabled() && this.kankaAvailable() && this.kankaService.isConfigured();

    if (shouldFetchKanka) {
      // Fetch Kanka context and then transcribe
      this.processingSub = this.kankaService.getAllEntities().pipe(
        switchMap((kankaContext: KankaSearchResult) => {
          console.log('Transcribing with Kanka context:', {
            characters: kankaContext.characters.length,
            locations: kankaContext.locations.length,
            quests: kankaContext.quests.length,
            organisations: kankaContext.organisations.length
          });
          return this.audioTranscriptionService.transcribeAudio(storage, file, campaignId, transcriptionId, kankaContext);
        }),
        catchError(() => {
          // If Kanka fetch fails, continue without context
          console.warn('Failed to fetch Kanka context, continuing transcription without it');
          return this.audioTranscriptionService.transcribeAudio(storage, file, campaignId, transcriptionId);
        })
      ).subscribe({
        next: transcription => {
        if (!session || !campaignId) {
          return;
        }

        void this.audioTranscriptionService
          .saveTranscription(campaignId, session.id, transcription, 'Auto-generated')
          .then(savedTranscriptionId => {
            this.sessionStateService.updateSession(session.id, {
              transcription,
              status: 'completed',
              activeTranscriptionId: savedTranscriptionId
            });
            this.refreshSessions();
            this.runStoryGeneration(transcription);
          })
          .catch(error => {
            console.error('Failed to save transcription, continuing anyway:', error);
            this.sessionStateService.updateSession(session.id, {
              transcription,
              status: 'completed'
            });
            this.refreshSessions();
            this.runStoryGeneration(transcription);
          });
      },
      error: err => {
        if (session) {
          this.sessionStateService.updateSession(session.id, {
            status: 'completed' // Keep as completed since upload succeeded
          });
        }
        this.stageTimerSub?.unsubscribe();
        this.stage.set('failed');
        this.statusMessage.set(err.message || 'Transcription failed. File saved - you can retry transcription later.');
        this.refreshSessions();
      }
    });
    } else {
      // Transcribe without Kanka context
      this.processingSub = this.audioTranscriptionService
        .transcribeAudio(storage, file, campaignId, transcriptionId)
        .subscribe({
          next: transcription => {
            if (!session || !campaignId) {
              return;
            }

            void this.audioTranscriptionService
              .saveTranscription(campaignId, session.id, transcription, 'Auto-generated')
              .then(savedTranscriptionId => {
                this.sessionStateService.updateSession(session.id, {
                  transcription,
                  status: 'completed',
                  activeTranscriptionId: savedTranscriptionId
                });
                this.refreshSessions();
                this.runStoryGeneration(transcription);
              })
              .catch(error => {
                console.error('Failed to save transcription, continuing anyway:', error);
                this.sessionStateService.updateSession(session.id, {
                  transcription,
                  status: 'completed'
                });
                this.refreshSessions();
                this.runStoryGeneration(transcription);
              });
          },
          error: err => {
            if (session) {
              this.sessionStateService.updateSession(session.id, {
                status: 'completed' // Keep as completed since upload succeeded
              });
            }
            this.stageTimerSub?.unsubscribe();
            this.stage.set('failed');
            this.statusMessage.set(err.message || 'Transcription failed. File saved - you can retry transcription later.');
            this.refreshSessions();
          }
        });
    }
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private runStoryGeneration(transcription: TranscriptionResult): void {
    const session = this.currentSession();
    if (!session) {
      return;
    }

    this.stage.set('generating');
    this.statusMessage.set('Generating story...');
    this.animateStageProgress(3000, 60);

    this.processingSub?.unsubscribe();
    this.processingSub = this.sessionStoryService
      .generateStoryFromTranscript(
        transcription.rawTranscript,
        session.title,
        session.sessionDate,
        this.userCorrections(),
        this.kankaEnabled() && this.kankaAvailable()
      )
      .subscribe({
        next: content => {
          this.sessionStateService.updateSession(session.id, {
            content,
            status: 'completed'
          });
          this.finishStage('completed', 'Story ready.');
        },
        error: err => {
          this.stageTimerSub?.unsubscribe();
          this.stage.set('failed');
          this.statusMessage.set(
            err.message || 'Story generation failed. Transcription saved - you can regenerate the story later.'
          );
          this.refreshSessions();
        }
      });
  }

  private finishStage(stage: Stage, message: string): void {
    this.stageTimerSub?.unsubscribe();
    this.progress.set(100);
    this.stage.set(stage);
    this.statusMessage.set(message);
    this.refreshSessions();
  }

  private failSession(message: string): void {
    const session = this.currentSession();
    if (session) {
      this.sessionStateService.updateSession(session.id, { status: 'failed' });
    }
    this.stageTimerSub?.unsubscribe();
    this.stage.set('failed');
    this.statusMessage.set(message);
    this.refreshSessions();
  }

  private animateStageProgress(durationMs: number, startValue: number): void {
    this.stageTimerSub?.unsubscribe();
    this.progress.set(startValue);
    const step = Math.max(1, Math.floor(durationMs / 100));
    let current = startValue;

    this.stageTimerSub = timer(0, step).subscribe(() => {
      if (current >= 95) {
        return;
      }
      current += 1;
      this.progress.set(current);
    });
  }

  private resetProgress(): void {
    this.progress.set(0);
    this.stage.set('idle');
    this.statusMessage.set('Waiting for upload.');
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

  private refreshSessions(): void {
    const current = this.currentSession();
    if (current) {
      const updated = this.sessionStateService.getSession(current.id);
      if (updated) {
        this.currentSession.set(updated);
      }
    }
  }

  isBusy(): boolean {
    return ['uploading', 'transcribing', 'generating'].includes(this.stage());
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

      this.progressUnsubscribe = unsubscribe;

      // Step 2: Create effect to watch progress
      const progressEffect = runInInjectionContext(this.injector, () => effect(() => {
        const currentProgress = progress();
        if (currentProgress) {
          console.log('Podcast progress:', currentProgress);

          this.podcastProgress.set(currentProgress);
          this.podcastGenerationProgress.set(currentProgress.message);
          this.podcastGenerationProgressPercent.set(currentProgress.progress);

          if (currentProgress.error) {
            this.podcastError.set(currentProgress.error);
          }

          if (currentProgress.status === 'completed' || currentProgress.status === 'failed') {
            setTimeout(() => {
              this.isGeneratingPodcast.set(false);
              this.cleanupProgressListener();
              progressEffect.destroy();
              this.refreshSessions();
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

      console.log('Podcast generation started (script + audio)');

    } catch (error: any) {
      console.error('Failed to start podcast generation:', error);
      this.podcastError.set(error?.message || 'Failed to start podcast generation');
      this.podcastGenerationProgress.set('');
      this.podcastGenerationProgressPercent.set(0);
      this.isGeneratingPodcast.set(false);
      this.cleanupProgressListener();
    }
  }

  async playPodcast(podcast: PodcastVersion): Promise<void> {
    if (!podcast.audioUrl || this.isPlayingPodcast()) {
      return;
    }

    this.isPlayingPodcast.set(true);
    this.playingPodcastVersion.set(podcast.version);
    this.podcastError.set('');

    try {
      this.currentPodcastAudio = this.podcastAudioService.playPodcastMP3(podcast.audioUrl);
      this.currentPodcastAudio.onended = () => {
        this.isPlayingPodcast.set(false);
        this.playingPodcastVersion.set(null);
        this.currentPodcastAudio = null;
      };
      this.currentPodcastAudio.onerror = () => {
        this.podcastError.set('Afspelen mislukt');
        this.stopPodcast();
      };
    } catch (error: any) {
      console.error('Failed to play podcast:', error);
      this.podcastError.set(error?.message || 'Afspelen mislukt');
    } finally {
      this.podcastGenerationProgress.set('');
    }
  }

  stopPodcast(): void {
    this.podcastAudioService.stopPlayback();
    this.currentPodcastAudio = null;
    this.isPlayingPodcast.set(false);
    this.playingPodcastVersion.set(null);
    this.podcastGenerationProgress.set('');
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
