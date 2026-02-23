import { ChangeDetectionStrategy, Component, signal, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Stage = 'idle' | 'compressing' | 'uploading' | 'transcribing' | 'generating' | 'completed' | 'failed';

// Export for external use
export interface UploadRequestEvent {
  files: File[];
  sessionName?: string;
  sessionDate?: string;
  userId: string;
  campaignId: string;
  keepAwake?: boolean;
}

@Component({
  selector: 'app-audio-upload',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-gray-200 rounded-xl bg-white shadow-sm p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold m-0">Upload Session Audio</h3>
          <p class="text-sm text-gray-500 m-0">MP3, WAV, M4A, or OGG up to 500MB. Select multiple files to merge.</p>
        </div>
        <span class="text-xs px-2 py-1 rounded-full" [class]="badgeClass()">
          {{ stageLabel() }}
        </span>
      </div>

      @if (stage() !== 'idle') {
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm text-gray-600 m-0">{{ statusMessage() }}</p>
            <span class="text-xs text-gray-500">{{ progress() }}%</span>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              class="h-full bg-primary transition-all duration-300"
              [style.width.%]="progress()"
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
          multiple
          accept=".mp3,.wav,.m4a,.ogg,audio/*"
          (change)="onFileSelected($event)"
          [disabled]="isBusy() || !canUpload()"
        />
        <p class="text-sm text-gray-600 m-0">
          Drag and drop your audio files here, or
          <button
            type="button"
            class="text-primary font-semibold hover:underline"
            (click)="fileInput.click()"
            [disabled]="isBusy() || !canUpload()"
          >
            browse
          </button>
        </p>
      </div>

      <div class="mt-4 space-y-4">
        <label class="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            class="rounded border-gray-300 text-primary focus:ring-primary/30"
            [checked]="keepAwake()"
            (change)="keepAwake.set(!keepAwake())"
            [disabled]="isBusy() || !wakeLockSupported()"
          />
          Keep screen awake during upload
          @if (!wakeLockSupported()) {
            <span class="text-xs text-gray-400">(Not supported on this device)</span>
          }
        </label>

        <!-- Session Details -->
        <div class="grid gap-3 md:grid-cols-2">
          <label class="flex flex-col text-sm text-gray-600">
            Session name
            <input
              type="text"
              class="mt-1 px-3 py-2 border border-gray-200 rounded-lg focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
              [(ngModel)]="sessionName"
              [disabled]="isBusy() || !canUpload()"
              placeholder="The Goblin Warrens"
            />
          </label>
          <label class="flex flex-col text-sm text-gray-600">
            Session date
            <input
              type="date"
              class="mt-1 px-3 py-2 border border-gray-200 rounded-lg focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
              [(ngModel)]="sessionDate"
              [disabled]="isBusy() || !canUpload()"
            />
          </label>
        </div>
      </div>

      @if (selectedFiles().length > 0) {
        <div class="mt-4 space-y-2">
          @for (file of selectedFiles(); track $index; let i = $index) {
            <div class="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm flex items-center gap-2">
              @if (selectedFiles().length > 1) {
                <div class="flex flex-col gap-0.5">
                  <button
                    type="button"
                    (click)="moveFile(i, -1)"
                    [disabled]="i === 0 || isBusy()"
                    class="text-blue-400 hover:text-blue-600 disabled:opacity-30 text-xs leading-none p-0.5"
                  >&#9650;</button>
                  <button
                    type="button"
                    (click)="moveFile(i, 1)"
                    [disabled]="i === selectedFiles().length - 1 || isBusy()"
                    class="text-blue-400 hover:text-blue-600 disabled:opacity-30 text-xs leading-none p-0.5"
                  >&#9660;</button>
                </div>
              }
              <p class="m-0 text-blue-900 flex-1 truncate">
                <strong>{{ file.name }}</strong> ({{ formatFileSize(file.size) }})
              </p>
              <button
                type="button"
                (click)="removeFile(i)"
                [disabled]="isBusy()"
                class="text-blue-400 hover:text-blue-600 disabled:opacity-30 text-lg leading-none px-1"
              >&times;</button>
            </div>
          }
          @if (selectedFiles().length > 1) {
            <p class="text-xs text-gray-500 m-0 px-1">
              {{ selectedFiles().length }} files — {{ formatFileSize(totalSize()) }} total — will be merged into one recording
            </p>
          }
        </div>
      }

      @if (error()) {
        <div class="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm">
          <p class="m-0 text-red-900">{{ error() }}</p>
        </div>
      }

      <div class="mt-4 flex gap-2 justify-end">
        @if (selectedFiles().length > 0) {
          <button
            type="button"
            class="px-4 py-2 rounded-lg font-semibold transition-colors"
            [class]="'bg-gray-100 text-gray-900 hover:bg-gray-200'"
            (click)="clearAll()"
            [disabled]="isBusy()"
          >
            Clear
          </button>
        }
        <button
          type="button"
          class="px-4 py-2 rounded-lg font-semibold transition-colors"
          [class]="
            selectedFiles().length > 0 && !isBusy()
              ? 'bg-primary text-white hover:opacity-90'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          "
          (click)="uploadFiles()"
          [disabled]="selectedFiles().length === 0 || isBusy() || !canUpload()"
        >
          {{ isBusy() ? 'Processing...' : (selectedFiles().length > 1 ? 'Merge & Upload' : 'Upload & Process') }}
        </button>
      </div>
    </div>
  `
})
export class AudioUploadComponent {
  isBusy = input(false);
  userId = input<string | null>(null);
  campaignId = input<string | null>(null);
  canUpload = input(false);
  stage = input<Stage>('idle');
  progress = input(0);
  statusMessage = input('');
  wakeLockSupported = input(true);
  uploadRequested = output<UploadRequestEvent>();

  selectedFiles = signal<File[]>([]);
  sessionName = '';
  sessionDate = '';
  dragActive = signal(false);
  error = signal('');
  keepAwake = signal(true);

  totalSize = computed(() => this.selectedFiles().reduce((sum, f) => sum + f.size, 0));

  badgeClass = computed(() => {
    const stageMap: Record<Stage, string> = {
      'idle': 'bg-gray-100 text-gray-700',
      'compressing': 'bg-yellow-100 text-yellow-700',
      'uploading': 'bg-blue-100 text-blue-700',
      'transcribing': 'bg-purple-100 text-purple-700',
      'generating': 'bg-orange-100 text-orange-700',
      'completed': 'bg-green-100 text-green-700',
      'failed': 'bg-red-100 text-red-700'
    };
    return stageMap[this.stage()] || stageMap['idle'];
  });

  stageLabel = computed(() => {
    const labels: Record<Stage, string> = {
      'idle': 'Ready',
      'compressing': 'Compressing',
      'uploading': 'Uploading',
      'transcribing': 'Transcribing',
      'generating': 'Generating',
      'completed': 'Complete',
      'failed': 'Failed'
    };
    return labels[this.stage()] || 'Processing';
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
      this.addFiles(Array.from(files));
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.addFiles(Array.from(input.files));
    }
  }

  addFiles(files: File[]): void {
    for (const file of files) {
      const errorMessage = this.validateFile(file);
      if (errorMessage) {
        this.error.set(`${file.name}: ${errorMessage}`);
        return;
      }
    }
    this.error.set('');
    const allFiles = [...this.selectedFiles(), ...files]
      .sort((a, b) => a.name.localeCompare(b.name));
    this.selectedFiles.set(allFiles);
  }

  removeFile(index: number): void {
    this.selectedFiles.update(files => files.filter((_, i) => i !== index));
  }

  moveFile(index: number, direction: -1 | 1): void {
    const newIndex = index + direction;
    this.selectedFiles.update(files => {
      if (newIndex < 0 || newIndex >= files.length) return files;
      const updated = [...files];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated;
    });
  }

  clearAll(): void {
    this.selectedFiles.set([]);
    this.sessionName = '';
    this.sessionDate = '';
  }

  uploadFiles(): void {
    const files = this.selectedFiles();
    if (files.length === 0 || !this.userId() || !this.campaignId() || this.isBusy() || !this.canUpload()) {
      return;
    }
    this.error.set('');
    this.uploadRequested.emit({
      files,
      sessionName: this.sessionName,
      sessionDate: this.sessionDate,
      userId: this.userId()!,
      campaignId: this.campaignId()!,
      keepAwake: this.keepAwake()
    });
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
