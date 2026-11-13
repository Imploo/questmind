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
    <div class="qm-well">
      <h5 class="font-display text-sm font-bold tracking-wide mb-1">Voice introduction (speaker recognition)</h5>
      <p class="qm-help mb-3">
        Record everyone at the table introducing themselves, then upload it here. It is sent along with
        every transcription so the AI can tell which voice belongs to which character.
        Let each person talk for about 10–20 seconds, e.g.
        <em>"Hi, I'm Matt and I play Thorin, a dwarven fighter."</em> The DM introduces themselves as the DM.
        Use the same microphone setup as during your sessions and re-record when the party changes.
        Fill in the speaking order below so the AI knows which name belongs to which voice.
      </p>

      @if (voiceIntro(); as intro) {
        <div class="mb-3">
          <div class="text-sm font-semibold">
            {{ intro.fileName }}
            <span class="font-normal qm-muted">· {{ durationLabel() }}</span>
          </div>
          @if (playbackUrl()) {
            <audio class="mt-2 w-full max-w-md" controls preload="none" [src]="playbackUrl()">
              Your browser does not support audio playback.
            </audio>
          }
        </div>
      } @else {
        <p class="text-sm qm-muted mb-3">No voice introduction uploaded yet.</p>
      }

      @if (canEdit()) {
        <div class="flex flex-wrap items-center gap-2">
          <label
            class="qm-btn qm-btn-gold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
            [class.is-disabled]="isBusy()"
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
              class="qm-btn qm-btn-danger"
            >
              Remove
            </button>
          }
        </div>
      }

      @if (progress() !== null) {
        <div
          class="qm-progress mt-3 max-w-md"
          role="progressbar"
          aria-label="Voice introduction upload progress"
          [attr.aria-valuenow]="progress()"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="qm-progress-bar" [style.width.%]="progress()"></div>
        </div>
      }

      <div aria-live="polite">
        @if (errorMessage()) {
          <p class="mt-2 text-sm text-wine">{{ errorMessage() }}</p>
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
