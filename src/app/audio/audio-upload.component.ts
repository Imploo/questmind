import { ChangeDetectionStrategy, Component, signal, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isWavFile } from './services/wav-to-mp3';
import { formatFileSize } from '../shared/formatting.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** Uploaded as-is (M4A, MP3, OGG). */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
/** WAV is compressed in the browser first (streaming, so size isn't a memory issue). */
const MAX_WAV_BYTES = 4 * 1024 * 1024 * 1024;

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
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="qm-panel">
      <div class="flex items-start justify-between gap-3 mb-4">
        <div class="min-w-0 flex-1">
          <h3 class="qm-section-title !mb-1.5">{{ 'audio.upload.title' | translate }}</h3>
          <p class="qm-help">{{ 'audio.upload.formats' | translate }}</p>
        </div>
        <span class="qm-badge" [class]="badgeClass()">
          {{ stageLabel() }}
        </span>
      </div>

      @if (stage() !== 'idle') {
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm text-gray-700">{{ statusMessage() }}</p>
            <span class="text-xs qm-muted tabular-nums">{{ progress() }}%</span>
          </div>
          <div class="qm-progress">
            <div class="qm-progress-bar" [style.width.%]="progress()"></div>
          </div>
        </div>
      }

      <div
        class="drop"
        [class.is-active]="dragActive()"
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
        <span class="qm-medallion mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 16V4m0 0l-4 4m4-4l4 4" /></svg>
        </span>
        <p class="text-sm text-gray-700">
          {{ 'audio.upload.dropHint' | translate }}
          <button
            type="button"
            class="qm-link"
            (click)="fileInput.click()"
            [disabled]="isBusy() || !canUpload()"
          >
            {{ 'audio.upload.browse' | translate }}
          </button>
        </p>
      </div>

      @if (selectedFiles().length > 0) {
        <div class="mt-4 space-y-2">
          @for (file of selectedFiles(); track $index; let i = $index) {
            <div class="qm-well !py-2 text-sm flex items-center gap-2">
              @if (selectedFiles().length > 1) {
                <div class="flex flex-col gap-0.5">
                  <button
                    type="button"
                    (click)="moveFile(i, -1)"
                    [disabled]="i === 0 || isBusy()"
                    [attr.aria-label]="'audio.upload.moveUp' | translate"
                    class="text-gold-deep hover:text-ink disabled:opacity-30 text-xs leading-none p-0.5"
                  >&#9650;</button>
                  <button
                    type="button"
                    (click)="moveFile(i, 1)"
                    [disabled]="i === selectedFiles().length - 1 || isBusy()"
                    [attr.aria-label]="'audio.upload.moveDown' | translate"
                    class="text-gold-deep hover:text-ink disabled:opacity-30 text-xs leading-none p-0.5"
                  >&#9660;</button>
                </div>
              }
              <p class="flex-1 truncate">
                <strong class="font-semibold">{{ file.name }}</strong> <span class="qm-muted">({{ formatFileSize(file.size) }})</span>
              </p>
              <button
                type="button"
                (click)="removeFile(i)"
                [disabled]="isBusy()"
                [attr.aria-label]="'audio.upload.removeFile' | translate"
                class="text-gray-500 hover:text-wine disabled:opacity-30 text-lg leading-none px-1"
              >&times;</button>
            </div>
          }
          @if (selectedFiles().length > 1) {
            <p class="qm-help px-1">
              {{ 'audio.upload.mergeSummary' | translate: selectedFiles().length : formatFileSize(totalSize()) }}
            </p>
          }
        </div>
      }

      <div class="mt-4 space-y-4">
        <!-- Session Details -->
        <div class="grid gap-3 md:grid-cols-2">
          <label class="block">
            <span class="qm-label">{{ 'audio.upload.sessionName' | translate }}</span>
            <input
              type="text"
              class="qm-input"
              [(ngModel)]="sessionName"
              [disabled]="isBusy() || !canUpload()"
              [placeholder]="'audio.upload.sessionNamePlaceholder' | translate"
            />
          </label>
          <label class="block">
            <span class="qm-label">{{ 'audio.upload.sessionDate' | translate }}</span>
            <input
              type="date"
              class="qm-input"
              [(ngModel)]="sessionDate"
              [disabled]="isBusy() || !canUpload()"
            />
          </label>
        </div>
      </div>

      @if (error()) {
        <div class="qm-alert mt-4" role="alert">{{ error() }}</div>
      }

      <div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 justify-end border-t border-dashed border-[#e0d2b6] pt-4">
        <label class="flex flex-wrap items-center gap-2 text-sm text-gray-700 mr-auto">
          <input
            type="checkbox"
            class="h-4 w-4"
            [checked]="keepAwake()"
            (change)="keepAwake.set(!keepAwake())"
            [disabled]="isBusy() || !wakeLockSupported()"
          />
          {{ 'audio.upload.keepAwake' | translate }}
          @if (!wakeLockSupported()) {
            <span class="text-xs qm-muted">{{ 'audio.upload.keepAwakeUnsupported' | translate }}</span>
          }
        </label>
        @if (selectedFiles().length > 0) {
          <button type="button" class="qm-btn" (click)="clearAll()" [disabled]="isBusy()">
            {{ 'audio.upload.clear' | translate }}
          </button>
        }
        <button
          type="button"
          class="qm-btn qm-btn-primary"
          (click)="uploadFiles()"
          [disabled]="selectedFiles().length === 0 || isBusy() || !canUpload()"
        >
          {{ submitLabel() }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.75rem 1.5rem;
      border-radius: 12px;
      text-align: center;
      background: var(--paper-2);
      border: 2px dashed #d9c9a6;
      transition: border-color 0.15s, background 0.15s;
    }
    .drop.is-active { border-color: var(--color-primary); background: rgba(102, 126, 234, 0.08); }
  `]
})
export class AudioUploadComponent {
  private readonly i18n = inject(I18nService);

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
      'idle': 'qm-badge-quiet',
      'compressing': '',
      'uploading': 'qm-badge-info',
      'transcribing': 'qm-badge-violet',
      'generating': 'qm-badge-violet',
      'completed': 'qm-badge-success',
      'failed': 'qm-badge-danger'
    };
    return stageMap[this.stage()] || stageMap['idle'];
  });

  stageLabel = computed(() => {
    const texts = this.i18n.t().audio;
    const labels: Record<Stage, string> = texts.uploadStages;
    return labels[this.stage()] || texts.list.statusProcessing;
  });

  /** What the upload button does right now. */
  submitLabel = computed(() => {
    const texts = this.i18n.t().audio.upload;
    if (this.isBusy()) return texts.processing;
    return this.selectedFiles().length > 1 ? texts.mergeAndUpload : texts.uploadAndProcess;
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
        this.error.set(errorMessage);
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

  /** Why a file cannot be uploaded, as a message that names the file; null when it can. */
  validateFile(file: File): string | null {
    const texts = this.i18n.t().audio.uploadErrors;
    const validTypes = [
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'audio/x-m4a',
      'audio/ogg'
    ];
    // Some browsers report no MIME type for M4A/WAV, so accept by extension too.
    const validExtension = /\.(mp3|wav|m4a|ogg)$/i.test(file.name);
    if (!validTypes.includes(file.type) && !validExtension) {
      return texts.unsupportedType(file.name);
    }
    const isWav = isWavFile(file);
    if (isWav && file.size > MAX_WAV_BYTES) {
      return texts.wavTooLarge(file.name);
    }
    if (!isWav && file.size > MAX_UPLOAD_BYTES) {
      return texts.tooLarge(file.name);
    }
    return null;
  }

  readonly formatFileSize = formatFileSize;
}
