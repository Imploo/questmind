import { Component, computed, inject, signal, ChangeDetectionStrategy, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AudioUploadComponent, UploadRequestEvent } from './audio-upload.component';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { AudioCompleteProcessingService } from './services/audio-complete-processing.service';
import { BackgroundUploadService } from './services/background-upload.service';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { AudioUpload, AudioSessionRecord } from './services/audio-session.models';

@Component({
  selector: 'app-audio-upload-page',
  imports: [CommonModule, AudioUploadComponent],
  template: `
    <div class="flex flex-col lg:flex-row gap-6">
      <!-- Mobile: Toggle button at top -->
      <div class="lg:hidden mb-4">
        <button
          type="button"
          (click)="mobileDrawerOpen.set(true)"
          class="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div class="flex items-center gap-3">
            <span class="text-lg">📋</span>
            <div class="text-left">
              <p class="m-0 text-sm font-semibold text-gray-700">New Audio Session</p>
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
            <!-- Active indicator for New -->
            <div class="w-full px-4 py-2 bg-primary/10 border border-primary rounded-lg flex items-center justify-center gap-2 text-sm font-medium text-primary">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
              </svg>
              New Session (Active)
            </div>
          </div>
          <div class="flex-1 overflow-y-auto">
            @if (sortedSessions().length === 0) {
              <div class="p-4 text-center">
                <p class="text-sm text-gray-500 m-0">No sessions yet.</p>
                <p class="text-xs text-gray-400 m-0 mt-1">This will be your first!</p>
              </div>
            } @else {
              <nav class="p-2 flex flex-col gap-1">
                @for (session of sortedSessions(); track session.id) {
                  <button
                    type="button"
                    class="text-left w-full rounded-lg p-3 transition-colors hover:bg-gray-50"
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
          [stage]="stage()"
          [progress]="progress()"
          [statusMessage]="statusMessage()"
          [backgroundUploadSupported]="backgroundUploadSupported()"
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
  private backgroundUpload = inject(BackgroundUploadService);
  private authService = inject(AuthService);
  private campaignContextService = inject(CampaignContextService);
  private wakeLockSentinel: WakeLockSentinel | null = null;
  private keepAwakeDuringUpload = false;
  private readonly visibilityHandler = () => {
    if (document.visibilityState === 'visible' && this.keepAwakeDuringUpload) {
      void this.requestWakeLock();
    }
  };

  userId = computed(() => this.authService.currentUser()?.uid ?? null);
  campaignId = computed(() => this.campaignContextService.selectedCampaignId());

  stage = signal<'idle' | 'uploading' | 'transcribing' | 'generating' | 'completed' | 'failed'>('idle');
  progress = signal(0);
  statusMessage = signal('');
  isBusy = computed(() => this.stage() !== 'idle' && this.stage() !== 'completed' && this.stage() !== 'failed');
  backgroundUploadSupported = computed(() => this.backgroundUpload.isSupported());
  wakeLockSupported = computed(() => typeof navigator !== 'undefined' && 'wakeLock' in navigator);

  canUploadAudio = computed(() => {
    const userId = this.userId();
    const campaignId = this.campaignId();
    const isBusy = this.isBusy();
    return userId !== null && campaignId !== null && !isBusy;
  });

  // Sessions list
  sessions = this.sessionStateService.sessions;

  sortedSessions = computed(() => {
    const sessions = this.sessions();
    return [...sessions].sort((a, b) => {
      const dateA = a.sessionDate || '';
      const dateB = b.sessionDate || '';
      return dateB.localeCompare(dateA);
    });
  });

  // Mobile drawer state
  mobileDrawerOpen = signal(false);

  ngOnInit(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    void this.releaseWakeLock();
  }

  async startCompleteProcessing(event: UploadRequestEvent): Promise<void> {
    const userId = this.userId();
    const campaignId = this.campaignId();

    if (!userId || !campaignId) {
      console.error('Missing userId or campaignId');
      return;
    }

    this.keepAwakeDuringUpload = event.keepAwake ?? true;
    if (this.keepAwakeDuringUpload) {
      void this.requestWakeLock();
    }

    try {
      this.stage.set('uploading');
      this.progress.set(0);
      this.statusMessage.set('Preparing upload...');

      const upload: AudioUpload = {
        file: event.file,
        sessionName: event.sessionName,
        sessionDate: event.sessionDate,
        userId,
        campaignId
      };

      const sessionDraft = this.sessionStateService.createSessionDraft(upload);

      // Start upload with progress tracking
      const result = await this.completeProcessingService.startCompleteProcessing(
        campaignId,
        sessionDraft.id,
        event.file,
        {
          sessionTitle: event.sessionName || 'Untitled Session',
          sessionDate: event.sessionDate,
          transcriptionMode: event.transcriptionMode || 'batch'
        },
        (uploadProgress) => {
          // Track upload progress (0-99%)
          this.progress.set(uploadProgress);
          this.statusMessage.set(`Uploading to cloud... ${Math.round(uploadProgress)}%`);
        }
      );

      if (result.isBackground) {
        // Background upload started — show brief message, then navigate
        this.progress.set(0);
        this.statusMessage.set('Upload continues in the background. You can close the app.');
        await new Promise(resolve => setTimeout(resolve, 1500));
        this.stage.set('idle');
        this.selectSession({ id: result.sessionId } as any);
        return;
      }

      // Foreground upload complete, batch job submitted successfully - set to 100%
      this.progress.set(100);
      this.statusMessage.set('Upload complete! Processing audio...');

      // Wait a moment to show 100% completion
      await new Promise(resolve => setTimeout(resolve, 800));

      // Navigate to the new session
      this.selectSession({ id: result.sessionId } as any);
    } catch (error) {
      console.error('Error starting complete processing:', error);
      this.stage.set('failed');
      this.statusMessage.set('Upload failed. Please try again.');
    } finally {
      if (this.keepAwakeDuringUpload) {
        await this.releaseWakeLock();
      }
      this.keepAwakeDuringUpload = false;
    }
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
      console.warn('Failed to acquire wake lock:', message);
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
      console.warn('Failed to release wake lock:', message);
    } finally {
      this.wakeLockSentinel = null;
    }
  }

  selectSession(session: AudioSessionRecord): void {
    const campaignId = this.campaignId();
    const basePath = campaignId ? `/campaign/${campaignId}/audio` : '/audio';
    void this.router.navigate([basePath, session.id]);
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
