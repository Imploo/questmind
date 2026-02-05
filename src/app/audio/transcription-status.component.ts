import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

type Stage = 'idle' | 'uploading' | 'transcribing' | 'generating' | 'completed' | 'failed';

@Component({
  selector: 'app-transcription-status',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-gray-200 rounded-xl bg-white shadow-sm p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold m-0">Processing Status</h3>
          <p class="text-sm text-gray-500 m-0">{{ statusMessage() }}</p>
        </div>
        <span class="text-xs px-2 py-1 rounded-full" [class]="badgeClass()">
          {{ stageLabel() }}
        </span>
      </div>

      <div class="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          class="h-full bg-primary transition-all duration-300"
          [style.width.%]="effectiveProgress()"
        ></div>
      </div>
      <p class="text-xs text-gray-500 mt-2 mb-0">{{ effectiveProgress() }}% complete</p>

      <div class="mt-4 flex justify-end gap-3">
        <button
          type="button"
          class="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 text-gray-600 hover:text-gray-800"
          (click)="cancel.emit()"
          [disabled]="stage() === 'completed' || stage() === 'failed'"
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary-dark disabled:bg-gray-300"
          (click)="retry.emit()"
          [disabled]="stage() !== 'failed'"
        >
          Retry
        </button>
      </div>
    </div>
  `
})
export class TranscriptionStatusComponent {
  stage = input<Stage>('idle');
  progress = input(0);
  statusMessage = input('Waiting for upload.');
  cancel = output<void>();
  retry = output<void>();

  effectiveProgress = computed(() => Math.round(this.progress()));

  stageLabel = computed(() => {
    switch (this.stage()) {
      case 'uploading':
        return 'Uploading';
      case 'transcribing':
        return 'Transcribing';
      case 'generating':
        return 'Writing Story';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Idle';
    }
  });

  badgeClass = computed(() => {
    switch (this.stage()) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      case 'uploading':
      case 'transcribing':
      case 'generating':
        return 'bg-amber-100 text-amber-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  });
}
