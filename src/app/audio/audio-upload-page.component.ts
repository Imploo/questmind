import { Component, computed, inject, signal, ChangeDetectionStrategy, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AudioUploadComponent, UploadRequestEvent } from './audio-upload.component';
import { SessionListSidebarComponent } from './session-list-sidebar.component';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { AudioCompleteProcessingService } from './services/audio-complete-processing.service';
import { AudioCompressionService } from './services/audio-compression.service';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { AudioUpload, AudioSessionRecord, SessionProgress } from './services/audio-session.models';
import * as logger from '../shared/logger';

@Component({
  selector: 'app-audio-upload-page',
  imports: [AudioUploadComponent, SessionListSidebarComponent],
  template: `
    <div class="flex flex-col lg:flex-row gap-6">
      <app-session-list-sidebar
        [sessions]="sortedSessions()"
        [userId]="userId()"
        [showNewButton]="false"
        mobileLabel="New Audio Session"
        (sessionSelected)="selectSession($event)"
      />

      <!-- Right panel: Upload form -->
      <main class="flex-1 min-w-0">
        <div class="mb-6">
          <h1 class="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Upload New Audio Session</h1>
          <p class="text-sm text-gray-600">Upload and transcribe your D&D session audio</p>
        </div>

        <app-audio-upload
          [isBusy]="isBusy()"
          [userId]="userId()"
          [campaignId]="campaignId()"
          [canUpload]="canUploadAudio()"
          stage="idle"
          [progress]="0"
          statusMessage=""
          [wakeLockSupported]="wakeLockSupported()"
          (uploadRequested)="startCompleteProcessing($event)"
        />
      </main>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AudioUploadPageComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private sessionStateService = inject(AudioSessionStateService);
  private completeProcessingService = inject(AudioCompleteProcessingService);
  private audioCompression = inject(AudioCompressionService);
  private authService = inject(AuthService);
  private campaignContextService = inject(CampaignContextService);
  private wakeLockSentinel: WakeLockSentinel | null = null;
  private processingInBackground = false;
  private readonly visibilityHandler = () => {
    if (document.visibilityState === 'visible' && this.processingInBackground) {
      void this.requestWakeLock();
    }
  };

  userId = computed(() => this.authService.currentUser()?.uid ?? null);
  campaignId = computed(() => this.campaignContextService.selectedCampaignId());

  isBusy = signal(false);
  wakeLockSupported = computed(() => typeof navigator !== 'undefined' && 'wakeLock' in navigator);

  canUploadAudio = computed(() => {
    const userId = this.userId();
    const campaignId = this.campaignId();
    const isBusy = this.isBusy();
    return userId !== null && campaignId !== null && !isBusy;
  });

  // Sessions list
  sessions = this.sessionStateService.sessions;

  sortedSessions = this.sessionStateService.sortedSessions;

  ngOnInit(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    // Only release wake lock if not processing in background
    if (!this.processingInBackground) {
      void this.releaseWakeLock();
    }
  }

  async startCompleteProcessing(event: UploadRequestEvent): Promise<void> {
    const userId = this.userId();
    const campaignId = this.campaignId();

    if (!userId || !campaignId) {
      logger.error('Missing userId or campaignId');
      return;
    }

    this.isBusy.set(true);

    // Create session draft
    const upload: AudioUpload = {
      file: event.files[0],
      sessionName: event.sessionName,
      sessionDate: event.sessionDate,
      userId,
      campaignId
    };
    const sessionDraft = this.sessionStateService.createSessionDraft(upload);

    // Write initial progress to Firestore
    this.sessionStateService.updateSession(sessionDraft.id, {
      status: 'processing',
      progress: {
        stage: 'compressing',
        progress: 0,
        message: 'Starting compression...',
        startedAt: new Date(),
        updatedAt: new Date(),
      } as SessionProgress,
    });

    // Navigate to session page immediately
    this.navigateToSession(sessionDraft.id);

    // Acquire wake lock for background processing
    this.processingInBackground = event.keepAwake ?? true;
    if (this.processingInBackground) {
      void this.requestWakeLock();
    }

    // Fire-and-forget processing
    void this.processInBackground(campaignId, sessionDraft.id, event).finally(() => {
      if (this.processingInBackground) {
        void this.releaseWakeLock();
        this.processingInBackground = false;
      }
    });
  }

  /**
   * Runs compression + upload in the background after navigation.
   * Both AudioCompressionService and AudioCompleteProcessingService are
   * root-level services that survive component destruction.
   */
  private async processInBackground(
    campaignId: string,
    sessionId: string,
    event: UploadRequestEvent,
  ): Promise<void> {
    try {
      const files = event.files;

      if (files.length === 1) {
        await this.completeProcessingService.startCompleteProcessing(
          campaignId,
          sessionId,
          files[0],
          {
            sessionTitle: event.sessionName || 'Untitled Session',
            sessionDate: event.sessionDate,
          },
        );
      } else {
        await this.processMultipleFiles(campaignId, sessionId, files, event);
      }
    } catch (error) {
      logger.error('Error in background processing:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      await this.completeProcessingService.writeFailure(campaignId, sessionId, errorMessage);
    }
  }

  /**
   * Multi-file path: compress each file, concatenate, then upload.
   * Compression progress is written to Firestore (throttled every 2s).
   */
  private async processMultipleFiles(
    campaignId: string,
    sessionId: string,
    files: File[],
    event: UploadRequestEvent,
  ): Promise<void> {
    const compressedBlobs: Blob[] = [];
    let totalOriginalSize = 0;
    let lastFirestoreWrite = 0;

    // Compress each file sequentially (0–60% of total progress)
    for (let i = 0; i < files.length; i++) {
      const compressionResult = await this.audioCompression.compress(
        files[i],
        (fileProgress: number) => {
          const overallProgress = Math.round(((i + fileProgress / 100) / files.length) * 60);
          // Throttled Firestore write (every 2s)
          const now = Date.now();
          if (now - lastFirestoreWrite >= 2000 || (fileProgress >= 100 && i === files.length - 1)) {
            lastFirestoreWrite = now;
            this.sessionStateService.updateSession(sessionId, {
              progress: {
                stage: 'compressing',
                progress: overallProgress,
                message: `Compressing file ${i + 1} of ${files.length}... ${Math.round(fileProgress)}%`,
                updatedAt: new Date(),
              } as SessionProgress,
            });
          }
        }
      );

      compressedBlobs.push(compressionResult.blob);
      totalOriginalSize += compressionResult.originalSize;
    }

    // Concatenate compressed MP3 blobs
    const concatenatedBlob = new Blob(compressedBlobs, { type: 'audio/mpeg' });
    const fileName = `${(event.sessionName || files[0].name).replace(/\.[^.]+$/, '')}.mp3`;

    // Upload + transcribe (uploadAndTranscribe writes 60–70% progress to Firestore)
    await this.completeProcessingService.uploadAndTranscribe(
      campaignId,
      sessionId,
      concatenatedBlob,
      fileName,
      { originalSize: totalOriginalSize, compressedSize: concatenatedBlob.size },
      {
        sessionTitle: event.sessionName || 'Untitled Session',
        sessionDate: event.sessionDate,
      },
    );
  }

  private async requestWakeLock(): Promise<void> {
    if (!this.wakeLockSupported()) {
      return;
    }
    try {
      this.wakeLockSentinel = await navigator.wakeLock.request('screen');
      this.wakeLockSentinel.addEventListener('release', () => {
        this.wakeLockSentinel = null;
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Failed to acquire wake lock: ' + message);
    }
  }

  private async releaseWakeLock(): Promise<void> {
    if (!this.wakeLockSentinel) {
      return;
    }
    try {
      await this.wakeLockSentinel.release();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Failed to release wake lock: ' + message);
    } finally {
      this.wakeLockSentinel = null;
    }
  }

  selectSession(session: AudioSessionRecord): void {
    this.navigateToSession(session.id);
  }

  private navigateToSession(sessionId: string): void {
    const campaignId = this.campaignId();
    const basePath = campaignId ? `/campaign/${campaignId}/audio` : '/audio';
    void this.router.navigate([basePath, sessionId]);
  }

  goBack(): void {
    const campaignId = this.campaignId();
    if (campaignId) {
      this.router.navigate(['/campaign', campaignId, 'audio']);
    } else {
      this.router.navigate(['/audio']);
    }
  }
}
