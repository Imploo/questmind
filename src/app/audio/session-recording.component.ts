import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** Playback + re-transcription controls for a session's stored recording. */
@Component({
  selector: 'app-session-recording',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="qm-panel mt-4 lg:mt-6">
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-3">
            <span class="qm-medallion">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 18v-6a9 9 0 0118 0v6M3 18a2 2 0 002 2h1a1 1 0 001-1v-5a1 1 0 00-1-1H3v5zm18 0a2 2 0 01-2 2h-1a1 1 0 01-1-1v-5a1 1 0 011-1h3v5z" /></svg>
            </span>
            <div>
              <h3 class="font-display text-base font-bold">{{ 'audio.recording.title' | translate }}</h3>
              <p class="text-sm qm-muted">{{ details() }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            @if (audioUrl()) {
              <a
                [href]="audioUrl()"
                [attr.download]="fileName()"
                target="_blank"
                rel="noopener"
                class="qm-btn"
              >
                {{ 'common.download' | translate }}
              </a>
            }
            @if (canRetranscribe()) {
              <button
                type="button"
                (click)="retranscribe.emit()"
                [disabled]="busy()"
                [title]="'audio.recording.retranscribeTitle' | translate"
                class="qm-btn qm-btn-gold"
              >
                {{ 'audio.recording.retranscribe' | translate }}
              </button>
            }
          </div>
        </div>

        @if (audioUrl()) {
          <audio controls preload="none" [src]="audioUrl()" class="w-full"></audio>
        } @else {
          <p class="text-sm qm-muted">{{ 'audio.recording.loading' | translate }}</p>
        }
      </div>
    </div>
  `
})
export class SessionRecordingComponent {
  private readonly i18n = inject(I18nService);

  audioUrl = input<string | null>(null);
  fileName = input('');
  durationSec = input(0);
  sizeBytes = input(0);
  canRetranscribe = input(false);
  busy = input(false);

  retranscribe = output<void>();

  details = computed(() => {
    const total = Math.round(this.durationSec());
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const duration = h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
    const mb = (this.sizeBytes() / 1_048_576).toFixed(1);
    return this.i18n.t().audio.recording.details(duration, `${mb} MB`);
  });
}
