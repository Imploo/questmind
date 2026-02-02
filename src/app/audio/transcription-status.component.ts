import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

type Stage = 'idle' | 'uploading' | 'transcribing' | 'generating' | 'completed' | 'failed';

@Component({
  selector: 'app-transcription-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="border border-gray-200 rounded-xl bg-white shadow-sm p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold m-0">Processing Status</h3>
          <p class="text-sm text-gray-500 m-0">{{ statusMessage }}</p>
        </div>
        <span class="text-xs px-2 py-1 rounded-full" [class]="badgeClass">
          {{ stageLabel }}
        </span>
      </div>

      <div class="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          class="h-full bg-primary transition-all duration-300"
          [style.width.%]="effectiveProgress"
        ></div>
      </div>
      <p class="text-xs text-gray-500 mt-2 mb-0">{{ effectiveProgress }}% complete</p>

      @if (totalChunks > 0 && stage === 'transcribing') {
        <div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p class="text-sm text-blue-800 m-0 mb-1">
            {{ currentChunkMessage }}
          </p>
          <p class="text-xs text-blue-600 m-0">
            {{ completedChunks }} of {{ totalChunks }} chunks complete
          </p>
        </div>
      }

      @if (failedChunks > 0) {
        <div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p class="text-sm text-amber-800 m-0">
            ⚠️ {{ failedChunks }} chunk(s) failed and will be retried
          </p>
        </div>
      }

      @if (isResume) {
        <div class="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p class="text-sm text-emerald-800 m-0">
            📋 Resuming from previous transcription
          </p>
        </div>
      }

      <div class="mt-4 flex justify-end gap-3">
        <button
          type="button"
          class="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 text-gray-600 hover:text-gray-800"
          (click)="cancel.emit()"
          [disabled]="stage === 'completed' || stage === 'failed'"
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary-dark disabled:bg-gray-300"
          (click)="retry.emit()"
          [disabled]="stage !== 'failed'"
        >
          Retry
        </button>
      </div>
    </div>
  `
})
export class TranscriptionStatusComponent {
  @Input() stage: Stage = 'idle';
  @Input() progress = 0;
  @Input() statusMessage = 'Waiting for upload.';
  @Input() completedChunks = 0;
  @Input() totalChunks = 0;
  @Input() currentChunkIndex = 0;
  @Input() failedChunks = 0;
  @Input() isResume = false;
  @Output() cancel = new EventEmitter<void>();
  @Output() retry = new EventEmitter<void>();

  get effectiveProgress(): number {
    if (this.totalChunks > 0 && this.stage === 'transcribing') {
      return Math.round((this.completedChunks / this.totalChunks) * 100);
    }
    return this.progress;
  }

  get currentChunkMessage(): string {
    if (this.currentChunkIndex >= this.totalChunks) {
      return 'All chunks processed!';
    }
    return `Processing chunk ${this.currentChunkIndex + 1} of ${this.totalChunks}`;
  }

  get stageLabel(): string {
    switch (this.stage) {
      case 'uploading':
        return 'Uploading';
      case 'transcribing':
        return this.isResume ? 'Resuming' : 'Transcribing';
      case 'generating':
        return 'Writing Story';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Idle';
    }
  }

  get badgeClass(): string {
    switch (this.stage) {
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
  }
}
