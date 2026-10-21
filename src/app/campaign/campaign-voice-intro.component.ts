import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CampaignVoiceIntro } from './campaign.models';

/**
 * Presentational component for the campaign voice intro (ticket #68): shows the
 * current introduction recording and lets the owner upload, replace or remove it.
 */
@Component({
  selector: 'app-campaign-voice-intro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-gray-50 p-4 rounded-lg">
      <h5 class="text-sm font-medium text-gray-700 mb-1">Voice introduction (speaker recognition)</h5>
      <p class="text-xs text-gray-600 mb-3">
        Record everyone at the table introducing themselves, then upload it here. It is sent along with
        every transcription so the AI can tell which voice belongs to which character.
        Let each person talk for about 10–20 seconds, e.g.
        <em>"Hi, I'm Matt and I play Thorin, a dwarven fighter."</em> The DM introduces themselves as the DM.
        Use the same microphone setup as during your sessions and re-record when the party changes.
      </p>

      @if (voiceIntro(); as intro) {
        <div class="mb-3">
          <div class="text-sm text-gray-900">
            {{ intro.fileName }}
            <span class="text-gray-500">· {{ durationLabel() }}</span>
          </div>
          @if (playbackUrl()) {
            <audio class="mt-2 w-full max-w-md" controls preload="none" [src]="playbackUrl()">
              Your browser does not support audio playback.
            </audio>
          }
        </div>
      } @else {
        <p class="text-sm text-gray-500 mb-3">No voice introduction uploaded yet.</p>
      }

      @if (canEdit()) {
        <div class="flex flex-wrap items-center gap-2">
          <label
            class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors focus-within:ring-2 focus-within:ring-blue-500"
            [class.opacity-50]="isBusy()"
            [class.cursor-not-allowed]="isBusy()"
            [class.cursor-pointer]="!isBusy()"
          >
            {{ voiceIntro() ? 'Replace recording' : 'Upload recording' }}
            <input
              type="file"
              accept="audio/*"
              class="sr-only"
              [disabled]="isBusy()"
              (change)="onFileChange($event)"
            />
          </label>
          @if (voiceIntro()) {
            <button
              type="button"
              (click)="removeRequested.emit()"
              [disabled]="isBusy()"
              class="px-4 py-2 text-sm text-red-700 hover:bg-red-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Remove
            </button>
          }
        </div>
      }

      @if (progress() !== null) {
        <div
          class="mt-3 w-full max-w-md h-2 bg-gray-200 rounded"
          role="progressbar"
          aria-label="Voice introduction upload progress"
          [attr.aria-valuenow]="progress()"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="h-2 bg-blue-600 rounded" [style.width.%]="progress()"></div>
        </div>
      }

      <div aria-live="polite">
        @if (errorMessage()) {
          <p class="mt-2 text-sm text-red-700">{{ errorMessage() }}</p>
        }
      </div>
    </div>
  `
})
export class CampaignVoiceIntroComponent {
  readonly voiceIntro = input<CampaignVoiceIntro | undefined>();
  readonly playbackUrl = input<string | null>(null);
  readonly canEdit = input(false);
  readonly isBusy = input(false);
  /** Upload progress 0-100, or null when no upload is running. */
  readonly progress = input<number | null>(null);
  readonly errorMessage = input('');

  readonly fileSelected = output<File>();
  readonly removeRequested = output<void>();

  readonly durationLabel = computed(() => {
    const seconds = this.voiceIntro()?.durationSec ?? 0;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  });

  onFileChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    // Reset so selecting the same file again still triggers a change event.
    inputEl.value = '';
    if (file) {
      this.fileSelected.emit(file);
    }
  }
}
