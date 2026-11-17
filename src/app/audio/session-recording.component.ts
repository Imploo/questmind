import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { AudioPlayerComponent, type AudioPlayerLabels } from '../shared/components/audio-player.component';
import { formatDuration, formatFileSize } from '../shared/formatting.service';

/** Playback + re-transcription controls for a session's stored recording. */
@Component({
  selector: 'app-session-recording',
  imports: [AudioPlayerComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="qm-panel mt-4 lg:mt-6">
      <!-- Hours of audio: nothing is fetched until someone presses play. -->
      <app-audio-player [src]="audioUrl()" [labels]="playerLabels()" preload="none" [duration]="durationSec()">
        <span playerSeal class="qm-medallion" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 18v-6a9 9 0 0118 0v6M3 18a2 2 0 002 2h1a1 1 0 001-1v-5a1 1 0 00-1-1H3v5zm18 0a2 2 0 01-2 2h-1a1 1 0 01-1-1v-5a1 1 0 011-1h3v5z" /></svg>
        </span>

        <ng-container ngProjectAs="[playerTitle]">
          <h3 class="font-display text-base font-bold leading-tight">{{ 'audio.recording.title' | translate }}</h3>
          <p class="mt-1 text-xs qm-muted">{{ details() }}</p>
        </ng-container>

        <ng-container ngProjectAs="[playerActions]">
          @if (audioUrl()) {
            <a
              [href]="audioUrl()"
              [attr.download]="fileName()"
              target="_blank"
              rel="noopener"
              class="qm-btn qm-btn-sm flex-1 @[30rem]:flex-none"
              [title]="'audio.recording.downloadTitle' | translate"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" /></svg>
              {{ 'common.download' | translate }}
            </a>
          }
          @if (canRetranscribe()) {
            <button
              type="button"
              (click)="retranscribe.emit()"
              [disabled]="busy()"
              [title]="'audio.recording.retranscribeTitle' | translate"
              class="qm-btn qm-btn-gold qm-btn-sm flex-1 @[30rem]:flex-none"
            >
              {{ 'audio.recording.retranscribe' | translate }}
            </button>
          }
        </ng-container>
      </app-audio-player>
    </div>
  `
})
export class SessionRecordingComponent {
  audioUrl = input<string | null>(null);
  fileName = input('');
  durationSec = input(0);
  sizeBytes = input(0);
  canRetranscribe = input(false);
  busy = input(false);

  retranscribe = output<void>();

  private readonly i18n = inject(I18nService);

  /** What the player's controls are called for the recording, in the active language. */
  playerLabels = computed((): AudioPlayerLabels => {
    const { play, pause, position } = this.i18n.t().audio.recording;
    return { play, pause, position };
  });

  /** Size and treatment under the title; the length sits at the end of the seek bar once there is one. */
  details = computed(() =>
    [
      !this.audioUrl() && this.durationSec() ? formatDuration(this.durationSec()) : '',
      this.sizeBytes() ? formatFileSize(this.sizeBytes()) : '',
      this.i18n.t().audio.recording.treatment,
    ].filter(Boolean).join(' · ')
  );
}
