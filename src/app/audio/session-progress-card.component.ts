import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { SessionProgress, SessionProgressStage } from './services/audio-session.models';
import { toDate } from '../shared/utils/date.utils';

@Component({
  selector: 'app-session-progress-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shouldShow()) {
      <div class="qm-panel !p-0 overflow-hidden mb-4 lg:mb-6" [class.is-failed]="isFailed()">
        <!-- Header -->
        <div class="px-5 py-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              @if (isFailed()) {
                <span class="qm-medallion seal-failed">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                </span>
              } @else {
                <span class="qm-medallion"><span class="qm-spinner" aria-hidden="true"></span></span>
              }
              <div class="min-w-0">
                <h3 class="font-display text-base font-bold" [class.text-wine]="isFailed()">
                  {{ stageTitle() }}
                </h3>
                <p class="text-sm" [class]="isFailed() ? 'text-[#7c2630]' : 'qm-muted'">
                  {{ progress()?.message }}
                </p>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-2">
              @if (isFailed() && canRetry()) {
                <button type="button" (click)="retry.emit()" class="qm-btn qm-btn-primary">
                  Retry
                </button>
              }
              @if (!isFailed() && canCancel()) {
                <button type="button" (click)="cancelled.emit()" class="qm-btn">
                  Cancel
                </button>
              }
            </div>
          </div>
        </div>

        <!-- Progress bar (only show if not failed) -->
        @if (!isFailed()) {
          <div class="px-5 pb-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-semibold">
                @if (isBackgroundUpload()) {
                  Uploading in the background...
                } @else {
                  {{ progress()?.progress }}% complete
                }
              </span>
              @if (estimatedTimeRemaining()) {
                <span class="text-sm qm-muted">
                  {{ estimatedTimeRemaining() }}
                </span>
              }
            </div>

            <!-- Progress bar -->
            <div class="qm-progress" [class.is-pulsing]="isBackgroundUpload()">
              <div class="qm-progress-bar" [style.width.%]="isBackgroundUpload() ? 100 : (progress()?.progress || 0)"></div>
            </div>

            @if (isBackgroundUpload()) {
              <p class="qm-help mt-2">
                Upload continues in the background. You can close the app.
              </p>
            }
          </div>
        }

        @if (isFailed() && retryUnavailableMessage()) {
          <div class="px-5 py-3 border-t border-[#e6bfc0] text-sm text-[#7c2630]" data-testid="retry-unavailable">
            {{ retryUnavailableMessage() }}
          </div>
        }

        <!-- Error details (only show if failed) -->
        @if (isFailed() && progress()?.error) {
          <div class="px-5 py-4 bg-[#fbefed] border-t border-[#e6bfc0]">
            <details class="text-sm">
              <summary class="font-semibold text-[#7c2630]">
                Error Details
              </summary>
              <pre class="mt-2 p-3 bg-paper border border-[#e6bfc0] rounded-lg text-xs text-[#7c2630] overflow-x-auto whitespace-pre-wrap">{{ progress()?.error }}</pre>
            </details>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .is-failed { border-color: #e0b3b5; }
    .seal-failed {
      color: var(--wine);
      background: radial-gradient(circle at 35% 30%, #fff5f3, #f3d9d8);
      border-color: var(--wine);
    }
  `]
})
export class SessionProgressCardComponent {
  // Inputs
  progress = input<SessionProgress | null | undefined>();
  /** When set, a failed operation cannot be retried; this message replaces the retry button. */
  retryUnavailableMessage = input<string | null>(null);

  // Outputs
  cancelled = output<void>();
  retry = output<void>();

  // Computed values
  shouldShow = computed(() => {
    const p = this.progress();
    if (!p) return false;

    // Hide if idle or completed
    if (p.stage === 'idle' || p.stage === 'completed') return false;

    return true;
  });

  isFailed = computed(() => {
    const p = this.progress();
    return p?.stage === 'failed';
  });

  canCancel = computed(() => {
    const stage = this.progress()?.stage;
    // Most stages can be cancelled, except completed/failed/idle
    return stage && !['idle', 'completed', 'failed'].includes(stage);
  });

  canRetry = computed(() => this.isFailed() && !this.retryUnavailableMessage());

  isBackgroundUpload = computed(() => {
    const p = this.progress();
    // Background upload: stage is uploading but progress is 0 or stale
    return p?.stage === 'uploading' && (p.progress === 0 || p.progress === undefined);
  });

  stageTitle = computed(() => {
    const stage = this.progress()?.stage;
    if (!stage) return 'Processing';

    const titleMap: Record<SessionProgressStage, string> = {
      'idle': 'Idle',
      'compressing': 'Compressing Audio',
      'uploading': 'Uploading File',
      'processing-audio': 'Processing Audio',
      'transcribing': 'Transcribing Audio',
      'generating-story': 'Generating Story',
      'generating-podcast-script': 'Generating Podcast Script',
      'generating-podcast-audio': 'Generating Podcast Audio',
      'completed': 'Completed',
      'failed': 'Failed',
    };

    return titleMap[stage] || 'Processing';
  });

  estimatedTimeRemaining = computed(() => {
    const p = this.progress();
    if (!p?.estimatedCompletionAt) return null;

    const completion = toDate(p.estimatedCompletionAt);
    if (!completion) return null;
    const remainingMs = completion.getTime() - Date.now();

    if (remainingMs <= 0) return 'Almost done...';

    const seconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `~${hours}h ${minutes % 60}m remaining`;
    } else if (minutes > 0) {
      return `~${minutes}m remaining`;
    } else {
      return `~${seconds}s remaining`;
    }
  });
}
