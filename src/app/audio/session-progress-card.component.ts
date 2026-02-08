import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SessionProgress, SessionProgressStage } from './services/audio-session.models';

@Component({
  selector: 'app-session-progress-card',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shouldShow()) {
      <div class="border rounded-xl bg-white shadow-sm overflow-hidden mb-6"
           [class.border-red-300]="isFailed()"
           [class.border-gray-200]="!isFailed()">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100"
             [class.bg-red-50]="isFailed()"
             [class.bg-blue-50]="!isFailed()">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-2xl">{{ stageIcon() }}</span>
              <div>
                <h3 class="text-lg font-semibold m-0"
                    [class.text-red-700]="isFailed()"
                    [class.text-gray-800]="!isFailed()">
                  {{ stageTitle() }}
                </h3>
                <p class="text-sm m-0"
                   [class.text-red-600]="isFailed()"
                   [class.text-gray-600]="!isFailed()">
                  {{ progress()?.message }}
                </p>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-2">
              @if (isFailed() && canRetry()) {
                <button
                  type="button"
                  (click)="retry.emit()"
                  class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                  Retry
                </button>
              }
              @if (!isFailed() && canCancel()) {
                <button
                  type="button"
                  (click)="cancel.emit()"
                  class="px-4 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors">
                  Cancel
                </button>
              }
            </div>
          </div>
        </div>

        <!-- Progress bar (only show if not failed) -->
        @if (!isFailed()) {
          <div class="px-6 py-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-700">
                {{ progress()?.progress }}% complete
              </span>
              @if (estimatedTimeRemaining()) {
                <span class="text-sm text-gray-500">
                  {{ estimatedTimeRemaining() }}
                </span>
              }
            </div>

            <!-- Progress bar -->
            <div class="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                class="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                [style.width.%]="progress()?.progress || 0">
              </div>
            </div>
          </div>
        }

        <!-- Error details (only show if failed) -->
        @if (isFailed() && progress()?.error) {
          <div class="px-6 py-4 bg-red-50 border-t border-red-100">
            <details class="text-sm">
              <summary class="cursor-pointer font-medium text-red-700 mb-2">
                Error Details
              </summary>
              <pre class="mt-2 p-3 bg-white border border-red-200 rounded text-xs text-red-800 overflow-x-auto whitespace-pre-wrap">{{ progress()?.error }}</pre>
            </details>
          </div>
        }
      </div>
    }
  `,
})
export class SessionProgressCardComponent {
  // Inputs
  progress = input<SessionProgress | null | undefined>();

  // Outputs
  cancel = output<void>();
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

  canRetry = computed(() => {
    // Can retry when failed
    return this.isFailed();
  });

  stageIcon = computed(() => {
    const stage = this.progress()?.stage;
    if (!stage) return '⏳';

    const iconMap: Record<SessionProgressStage, string> = {
      'idle': '⏸️',
      'uploading': '📤',
      'transcribing': '🎙️',
      'batch-submitted': '📋',
      'batch-processing': '⚙️',
      'retranscribing': '🔄',
      'generating-story': '📝',
      'regenerating-story': '🔄',
      'generating-podcast-script': '🎬',
      'generating-podcast-audio': '🎧',
      'completed': '✅',
      'failed': '❌',
    };

    return iconMap[stage] || '⏳';
  });

  stageTitle = computed(() => {
    const stage = this.progress()?.stage;
    if (!stage) return 'Processing';

    const titleMap: Record<SessionProgressStage, string> = {
      'idle': 'Idle',
      'uploading': 'Uploading File',
      'transcribing': 'Transcribing Audio',
      'batch-submitted': 'Transcription Queued',
      'batch-processing': 'Processing Transcription',
      'retranscribing': 'Re-transcribing',
      'generating-story': 'Generating Story',
      'regenerating-story': 'Regenerating Story',
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

    const now = new Date();
    const completion = new Date(p.estimatedCompletionAt);
    const remainingMs = completion.getTime() - now.getTime();

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
