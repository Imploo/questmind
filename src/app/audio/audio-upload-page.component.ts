import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { AudioUploadComponent, UploadRequestEvent } from './audio-upload.component';
import { SessionListSidebarComponent } from './session-list-sidebar.component';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { AudioCompleteProcessingService } from './services/audio-complete-processing.service';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { AudioUpload, AudioSessionRecord, SessionProgress } from './services/audio-session.models';
import * as logger from '../shared/logger';
import { ToastService } from '../shared/services/toast.service';
import { ScreenWakeLockService } from '../shared/services/screen-wake-lock.service';
import { isPermissionDenied, PERMISSION_DENIED_MESSAGE } from '../shared/utils/callable-error';

@Component({
  selector: 'app-audio-upload-page',
  imports: [AudioUploadComponent, SessionListSidebarComponent],
  template: `
    <div class="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <app-session-list-sidebar
        [sessions]="sortedSessions()"
        [userId]="userId()"
        [showNewButton]="false"
        mobileLabel="New Audio Session"
        (sessionSelected)="selectSession($event)"
      />

      <!-- Right panel: Upload form -->
      <main class="flex-1 min-w-0">
        <div class="mb-5">
          <div class="qm-page-eyebrow">New session</div>
          <h1 class="qm-page-title mt-1">Upload New Audio Session</h1>
          <p class="qm-page-sub mt-1">Upload and transcribe your D&D session audio</p>
        </div>

        <app-audio-upload
          [isBusy]="isBusy()"
          [userId]="userId()"
          [campaignId]="campaignId()"
          [canUpload]="canUploadAudio()"
          stage="idle"
          [progress]="0"
          statusMessage=""
          [wakeLockSupported]="wakeLockSupported"
          (uploadRequested)="startCompleteProcessing($event)"
        />
      </main>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AudioUploadPageComponent {
  private router = inject(Router);
  private sessionStateService = inject(AudioSessionStateService);
  private completeProcessingService = inject(AudioCompleteProcessingService);
  private authService = inject(AuthService);
  private campaignContextService = inject(CampaignContextService);
  private toastService = inject(ToastService);
  private wakeLock = inject(ScreenWakeLockService);

  userId = computed(() => this.authService.currentUser()?.uid ?? null);
  campaignId = computed(() => this.campaignContextService.selectedCampaignId());

  isBusy = signal(false);
  readonly wakeLockSupported = this.wakeLock.supported;

  canUploadAudio = computed(() => {
    const userId = this.userId();
    const campaignId = this.campaignId();
    const isBusy = this.isBusy();
    return userId !== null && campaignId !== null && !isBusy;
  });

  // Sessions list
  sessions = this.sessionStateService.sessions;

  sortedSessions = this.sessionStateService.sortedSessions;

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
        message: 'Preparing upload...',
        startedAt: new Date(),
        updatedAt: new Date(),
      } as SessionProgress,
    });

    // Navigate to session page immediately
    this.navigateToSession(sessionDraft.id);

    // The screen stays awake until the processing is done. That outlives this page, which
    // is left for the session page right away.
    const releaseWakeLock = (event.keepAwake ?? true) ? this.wakeLock.hold() : () => undefined;

    // Fire-and-forget processing
    void this.processInBackground(campaignId, sessionDraft.id, event).finally(releaseWakeLock);
  }

  /**
   * Runs compression + upload in the background after navigation.
   * AudioCompleteProcessingService (and the services it uses) are
   * root-level services that survive component destruction.
   */
  private async processInBackground(
    campaignId: string,
    sessionId: string,
    event: UploadRequestEvent,
  ): Promise<void> {
    try {
      // Single and multi-file uploads share one path: multiple files are
      // concatenated into one continuous evening and then segmented (#53 + #67).
      await this.completeProcessingService.startCompleteProcessing(
        campaignId,
        sessionId,
        event.files,
        {
          sessionTitle: event.sessionName || 'Untitled Session',
          sessionDate: event.sessionDate,
        },
      );
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Upload failed';
      if (isPermissionDenied(error)) {
        logger.warn('Audio processing refused: permission denied');
        this.toastService.showCallableError(error);
        errorMessage = PERMISSION_DENIED_MESSAGE;
      } else {
        logger.error('Error in background processing:', error);
      }
      await this.completeProcessingService.writeFailure(campaignId, sessionId, errorMessage);
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
