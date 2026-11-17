import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CampaignVoiceIntro } from './campaign.models';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/**
 * Presentational component for the campaign voice intro (ticket #68): shows the
 * current introduction recording and lets the owner upload, replace or remove it.
 */
@Component({
  selector: 'app-campaign-voice-intro',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="qm-well">
      <h5 class="font-display text-sm font-bold tracking-wide mb-1">{{ 'campaign.voiceIntro.title' | translate }}</h5>
      <p class="qm-help mb-3">
        {{ 'campaign.voiceIntro.helpBefore' | translate }}
        <em>{{ 'campaign.voiceIntro.helpExample' | translate }}</em>
        {{ 'campaign.voiceIntro.helpAfter' | translate }}
      </p>

      @if (voiceIntro(); as intro) {
        <div class="mb-3">
          <div class="text-sm font-semibold">
            {{ intro.fileName }}
            <span class="font-normal qm-muted">· {{ durationLabel() }}</span>
          </div>
          @if (playbackUrl()) {
            <audio class="mt-2 w-full max-w-md" controls preload="none" [src]="playbackUrl()">
              {{ 'campaign.voiceIntro.audioUnsupported' | translate }}
            </audio>
          }
        </div>
      } @else {
        <p class="text-sm qm-muted mb-3">{{ 'campaign.voiceIntro.empty' | translate }}</p>
      }

      @if (canEdit()) {
        <div class="flex flex-wrap items-center gap-2">
          <label
            class="qm-btn qm-btn-gold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
            [class.is-disabled]="isBusy()"
            [class.cursor-pointer]="!isBusy()"
          >
            {{ (voiceIntro() ? 'campaign.voiceIntro.replace' : 'campaign.voiceIntro.upload') | translate }}
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
              {{ 'common.remove' | translate }}
            </button>
          }
        </div>
      }

      @if (progress() !== null) {
        <div
          class="qm-progress mt-3 max-w-md"
          role="progressbar"
          [attr.aria-label]="'campaign.voiceIntro.uploadProgress' | translate"
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
