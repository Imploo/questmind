import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioUpload } from './audio-session.models';

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
        <span
          class="text-xs px-2 py-1 rounded-full"
          [class]="isBusy ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'"
        >
          {{ isBusy ? 'Processing' : 'Ready' }}
        </span>
      </div>

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
        <div class="mt-4 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <div>
            <p class="m-0 text-sm font-semibold text-gray-700">{{ selectedFile()?.name }}</p>
            <p class="m-0 text-xs text-gray-500">{{ formatFileSize(selectedFile()?.size || 0) }}</p>
          </div>
          <button
            type="button"
            class="text-xs text-gray-500 hover:text-gray-700"
            (click)="clearFile()"
            [disabled]="isBusy || !canUpload"
          >
            Remove
          </button>
        </div>
      }

      @if (error()) {
        <div class="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {{ error() }}
        </div>
      }

      <div class="mt-5 flex justify-end gap-3">
        <button
          type="button"
          class="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 text-gray-600 hover:text-gray-800"
          (click)="clearAll()"
            [disabled]="isBusy || !canUpload"
        >
          Reset
        </button>
        <button
          type="button"
          class="px-5 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary-dark disabled:bg-gray-300"
          (click)="submitUpload()"
          [disabled]="isBusy || !selectedFile() || !canUpload"
        >
          Upload & Transcribe
        </button>
      </div>
    </div>
  `
})
export class AudioUploadComponent {
  @Input() isBusy = false;
  @Input() userId: string | null = null;
  @Input() campaignId: string | null = null;
  @Input() canUpload = true;
  @Output() uploadRequested = new EventEmitter<AudioUpload>();

  sessionName = '';
  sessionDate = '';
  selectedFile = signal<File | null>(null);
  error = signal<string>('');
  dragActive = signal<boolean>(false);

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.setFile(file);
    }
    if (input) {
      input.value = '';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.setFile(file);
    }
  }

  clearFile(): void {
    this.selectedFile.set(null);
    this.error.set('');
  }

  clearAll(): void {
    this.sessionName = '';
    this.sessionDate = '';
    this.clearFile();
  }

  submitUpload(): void {
    const file = this.selectedFile();
    if (!file || !this.userId || !this.campaignId || !this.canUpload) {
      if (!this.userId) {
        this.error.set('You must be signed in to upload audio files.');
      } else if (!this.campaignId) {
        this.error.set('Select a campaign before uploading.');
      } else if (!this.canUpload) {
        this.error.set('You do not have permission to upload in this campaign.');
      }
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
