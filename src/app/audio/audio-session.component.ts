import { Component, OnDestroy, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, timer } from 'rxjs';
import { AudioStorageService } from './audio-storage.service';
import { AudioTranscriptionService } from './audio-transcription.service';
import { SessionStoryService } from './session-story.service';
import { AudioSessionStateService } from './audio-session-state.service';
import { AuthService } from '../auth/auth.service';
import {
  AudioSessionRecord,
  AudioUpload,
  StorageMetadata,
  TranscriptionResult
} from './audio-session.models';
import { AudioUploadComponent } from './audio-upload.component';
import { TranscriptionStatusComponent } from './transcription-status.component';
import { SessionStoryComponent } from './session-story.component';

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
        <div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <app-audio-upload
            [isBusy]="isBusy()"
            [userId]="userId()"
            (uploadRequested)="startProcessing($event)"
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
            [canRetranscribe]="!!currentSession()?.storageMetadata"
            [corrections]="userCorrections()"
            [correctionsStatus]="correctionsSaveStatus()"
            (storyUpdated)="saveStoryEdits($event)"
            (regenerate)="regenerateStory()"
            (retranscribe)="retranscribeSession()"
            (correctionsChanged)="onCorrectionsInput($event)"
          ></app-session-story>
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
                </button>
              }
            </div>
          }
        </div>
      }
    </div>
  `
})
export class AudioSessionComponent implements OnDestroy {
  userId = computed(() => this.authService.currentUser()?.uid || null);
  kankaEnabled = signal(false);
  kankaAvailable = signal(false);
  userCorrections = signal<string>('');
  correctionsSaveStatus = signal<'idle' | 'saving' | 'saved'>('idle');

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
    public readonly authService: AuthService
  ) {
    const kankaAvailable = this.sessionStoryService.isKankaAvailable();
    this.kankaAvailable.set(kankaAvailable);
    this.kankaEnabled.set(kankaAvailable);
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

  startProcessing(upload: AudioUpload): void {
    this.lastUpload.set(upload);
    const validationError = this.audioStorageService.validateFile(upload.file);
    if (validationError) {
      this.statusMessage.set(validationError);
      this.stage.set('failed');
      return;
    }

    this.resetProgress();
    this.stage.set('uploading');
    this.statusMessage.set('Uploading audio file...');

    const session = this.sessionStateService.createSessionDraft(upload);
    this.currentSession.set(session);
    this.userCorrections.set(session.userCorrections ?? '');
    this.correctionsSaveStatus.set('idle');
    this.refreshSessions();

    this.processingSub?.unsubscribe();
    this.processingSub = this.audioStorageService
      .uploadAudioFile(upload.file, upload.userId, session.id)
      .subscribe({
        next: progress => {
          this.progress.set(progress.progress);
        },
        error: () => this.failSession('Upload failed. Please try again.'),
        complete: () => {
          void this.audioStorageService
            .buildStorageMetadata(upload.file, upload.userId, session.id)
            .then(storage => {
              this.sessionStateService.updateSession(session.id, {
                status: 'completed',
                storageMetadata: storage,
                storageUrl: storage.downloadUrl,
                storagePath: storage.storagePath,
                fileSize: storage.fileSize,
                contentType: storage.contentType
              });
              this.refreshSessions();

              this.runTranscription(storage, upload.file);
            })
            .catch(() => {
              this.failSession('Upload completed but storage metadata is unavailable.');
            });
        }
      });
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
    this.startProcessing(lastUpload);
  }

  regenerateStory(): void {
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
    const session = this.currentSession();
    const uid = this.userId();
    if (!session?.storageMetadata) {
      this.failSession('No stored audio file found for this session.');
      return;
    }
    if (!uid) {
      this.failSession('User not authenticated.');
      return;
    }

    // Check for existing incomplete transcription
    const existingTranscriptionId = await this.audioTranscriptionService.findIncompleteTranscription(
      uid,
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
    this.processingSub?.unsubscribe();
    this.stageTimerSub?.unsubscribe();
    this.clearCorrectionsTimers();
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
    const uid = this.userId();
    if (!session || !uid) {
      return;
    }

    // Use existing transcription ID if provided (resuming), otherwise generate new one
    const transcriptionId = existingTranscriptionId || this.generateId();

    this.processingSub = this.audioTranscriptionService.transcribeAudio(storage, file, uid, transcriptionId).subscribe({
      next: transcription => {
        if (!session || !uid) {
          return;
        }

        void this.audioTranscriptionService
          .saveTranscription(uid, session.id, transcription, 'Auto-generated')
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
}
