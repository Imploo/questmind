import { Component, EventEmitter, Input, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioUpload } from './services/audio-session.models';

type Stage = 'idle' | 'uploading' | 'transcribing' | 'generating' | 'completed' | 'failed';

// Export for external use
export type UploadRequestEvent = AudioUpload;

@Component({
  selector: 'app-audio-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="border border-gray-200 rounded-xl bg-white shadow-sm p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold m-0">Upload Session Audio</h3>
          <p class="text-sm text-gray-500 m-0">MP3, WAV, M4A, or OGG up to 500MB.</p>
        </div>
        <span class="text-xs px-2 py-1 rounded-full" [class]="badgeClass()">
          {{ stageLabel() }}
        </span>
      </div>

      @if (stage !== 'idle') {
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm text-gray-600 m-0">{{ statusMessage }}</p>
            <span class="text-xs text-gray-500">{{ progress }}%</span>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              class="h-full bg-primary transition-all duration-300"
              [style.width.%]="progress"
            ></div>
          </div>
        </div>
      }

      <div
        class="border-2 border-dashed rounded-lg p-6 text-center transition-colors"
        [class]="dragActive() ? 'border-primary bg-primary/5' : 'border-gray-200'"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
      >
        <input
          type="file"
          class="hidden"
          #fileInput
          accept=".mp3,.wav,.m4a,.ogg,audio/*"
          (change)="onFileSelected($event)"
          [disabled]="isBusy || !canUpload"
        />
        <p class="text-sm text-gray-600 m-0">
          Drag and drop your audio file here, or
          <button
            type="button"
            class="text-primary font-semibold hover:underline"
            (click)="fileInput.click()"
            [disabled]="isBusy || !canUpload"
          >
            browse
          </button>
        </p>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-2">
        <label class="flex flex-col text-sm text-gray-600">
          Session name
          <input
            type="text"
            class="mt-1 px-3 py-2 border border-gray-200 rounded-lg focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
            [(ngModel)]="sessionName"
            [disabled]="isBusy || !canUpload"
            placeholder="The Goblin Warrens"
          />
        </label>
        <label class="flex flex-col text-sm text-gray-600">
          Session date
          <input
            type="date"
            class="mt-1 px-3 py-2 border border-gray-200 rounded-lg focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
            [(ngModel)]="sessionDate"
            [disabled]="isBusy || !canUpload"
          />
        </label>
      </div>

      @if (selectedFile()) {
        <div class="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm">
          <p class="m-0 text-blue-900">
            <strong>{{ selectedFile()!.name }}</strong> ({{ formatFileSize(selectedFile()!.size) }})
          </p>
        </div>
      }

      @if (error()) {
        <div class="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm">
          <p class="m-0 text-red-900">{{ error() }}</p>
        </div>
      }

      <div class="mt-4 flex gap-2 justify-end">
        @if (selectedFile()) {
          <button
            type="button"
            class="px-4 py-2 rounded-lg font-semibold transition-colors"
            [class]="'bg-gray-100 text-gray-900 hover:bg-gray-200'"
            (click)="selectedFile.set(null); sessionName = ''; sessionDate = ''"
            [disabled]="isBusy"
          >
            Clear
          </button>
        }
        <button
          type="button"
          class="px-4 py-2 rounded-lg font-semibold transition-colors"
          [class]="
            selectedFile() && !isBusy
              ? 'bg-primary text-white hover:opacity-90'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          "
          (click)="uploadFile()"
          [disabled]="!selectedFile() || isBusy || !canUpload"
        >
          {{ isBusy ? 'Uploading...' : 'Upload & Process' }}
        </button>
      </div>
    </div>
  `
})
export class AudioUploadComponent {
  @Input() isBusy = false;
  @Input() userId: string | null = null;
  @Input() campaignId: string | null = null;
  @Input() canUpload = false;
  @Input() stage: Stage = 'idle';
  @Input() progress = 0;
  @Input() statusMessage = '';
  @Output() uploadRequested = new EventEmitter<AudioUpload>();

  selectedFile = signal<File | null>(null);
  sessionName = '';
  sessionDate = '';
  dragActive = signal(false);
  error = signal('');

  badgeClass = computed(() => {
    const stageMap: Record<Stage, string> = {
      'idle': 'bg-gray-100 text-gray-700',
      'uploading': 'bg-blue-100 text-blue-700',
      'transcribing': 'bg-purple-100 text-purple-700',
      'generating': 'bg-orange-100 text-orange-700',
      'completed': 'bg-green-100 text-green-700',
      'failed': 'bg-red-100 text-red-700'
    };
    return stageMap[this.stage] || stageMap['idle'];
  });

  stageLabel = computed(() => {
    const labels: Record<Stage, string> = {
      'idle': 'Ready',
      'uploading': 'Uploading',
      'transcribing': 'Transcribing',
      'generating': 'Generating',
      'completed': 'Complete',
      'failed': 'Failed'
    };
    return labels[this.stage] || 'Processing';
  });

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.setFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.setFile(input.files[0]);
    }
  }

  uploadFile(): void {
    const file = this.selectedFile();
    if (!file || !this.userId || !this.campaignId || this.isBusy || !this.canUpload) {
      return;
    }
    this.error.set('');
    this.uploadRequested.emit({
      file,
      sessionName: this.sessionName,
      sessionDate: this.sessionDate,
      userId: this.userId,
      campaignId: this.campaignId
    });
  }

  setFile(file: File): void {
    const errorMessage = this.validateFile(file);
    if (errorMessage) {
      this.error.set(errorMessage);
      this.selectedFile.set(null);
      return;
    }
    this.error.set('');
    this.selectedFile.set(file);
  }

  validateFile(file: File): string | null {
    const validTypes = [
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'audio/x-m4a',
      'audio/ogg'
    ];
    if (!validTypes.includes(file.type)) {
      return 'Unsupported file type. Please use MP3, WAV, M4A, or OGG.';
    }
    if (file.size > 500 * 1024 * 1024) {
      return 'File is too large. Maximum size is 500MB.';
    }
    return null;
  }

  formatFileSize(bytes: number): string {
    if (!bytes) {
      return '0 MB';
    }
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }
}
