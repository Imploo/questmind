import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** Playback + re-transcription controls for a session's stored recording. */
@Component({
  selector: 'app-session-recording',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden mb-6">
      <div class="px-6 py-4 flex flex-col gap-3">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🎧</span>
            <div>
              <h3 class="text-lg font-semibold text-gray-800 m-0">Recording</h3>
              <p class="text-sm text-gray-500 m-0">{{ details() }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            @if (audioUrl()) {
              <a
                [href]="audioUrl()"
                [attr.download]="fileName()"
                target="_blank"
                rel="noopener"
                class="px-4 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors"
              >
                Download
              </a>
            }
            @if (canRetranscribe()) {
              <button
                type="button"
                (click)="retranscribe.emit()"
                [disabled]="busy()"
                title="Transcribe the stored recording again and generate a new story"
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Re-transcribe
              </button>
            }
          </div>
        </div>

        @if (audioUrl()) {
          <audio controls preload="none" [src]="audioUrl()" class="w-full"></audio>
        } @else {
          <p class="text-sm text-gray-400 m-0">Loading recording...</p>
        }
      </div>
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

  details = computed(() => {
    const total = Math.round(this.durationSec());
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const duration = h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
    const mb = (this.sizeBytes() / 1_048_576).toFixed(1);
    return `${duration} · ${mb} MB · compressed & normalized`;
  });
}
