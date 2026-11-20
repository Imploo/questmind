import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AudioUploadComponent, UploadRequestEvent } from './audio-upload.component';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { AudioCompleteProcessingService } from './services/audio-complete-processing.service';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { AudioUpload, SessionProgress } from './services/audio-session.models';
import * as logger from '../shared/logger';
import { ToastService } from '../shared/services/toast.service';
import { ScreenWakeLockService } from '../shared/services/screen-wake-lock.service';
import { callableErrorMessage, isPermissionDenied } from '../shared/utils/callable-error';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

@Component({
  selector: 'app-audio-upload-page',
  imports: [AudioUploadComponent, RouterLink, TranslatePipe],
  template: `
    <div class="max-w-3xl mx-auto">
      <a [routerLink]="['/campaign', campaignId(), 'sessions']" class="qm-backlink mb-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 12H5m7 7l-7-7 7-7" />
        </svg>
        {{ campaignName() }}
      </a>

      <div>
        <div class="mb-5">
          <h1 class="qm-page-title">{{ 'audio.upload.pageTitle' | translate }}</h1>
          <p class="qm-page-sub mt-1">{{ 'audio.upload.pageSubtitle' | translate }}</p>
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
      </div>
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
  private i18n = inject(I18nService);

  userId = computed(() => this.authService.currentUser()?.uid ?? null);
  campaignId = computed(() => this.campaignContextService.selectedCampaignId());
  campaignName = computed(() => this.campaignContextService.selectedCampaign()?.name ?? '');

  isBusy = signal(false);
  readonly wakeLockSupported = this.wakeLock.supported;

  canUploadAudio = computed(() => {
    const userId = this.userId();
    const campaignId = this.campaignId();
    const isBusy = this.isBusy();
    return userId !== null && campaignId !== null && !isBusy;
  });

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
          // A default name is stored in the language of whoever uploads.
          sessionTitle: event.sessionName || this.i18n.t().audio.untitledSession,
          sessionDate: event.sessionDate,
        },
      );
    } catch (error) {
      if (isPermissionDenied(error)) {
        logger.warn('Audio processing refused: permission denied');
      } else {
        logger.error('Error in background processing:', error);
      }
      // What the user reads is translated; the raw error (a parser or network
      // message) is stored as it is and shown as technical details only.
      const texts = this.i18n.t();
      this.toastService.show(callableErrorMessage(error, texts.errors, texts.audio.upload.failed), 'error', 6000);
      const rawError = error instanceof Error ? error.message : 'Upload failed';
      await this.completeProcessingService.writeFailure(campaignId, sessionId, rawError);
    }
  }

  private navigateToSession(sessionId: string): void {
    void this.router.navigate(['/campaign', this.campaignId(), 'sessions', sessionId]);
  }
}
