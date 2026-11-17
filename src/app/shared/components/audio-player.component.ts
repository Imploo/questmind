import { ChangeDetectionStrategy, Component, ElementRef, computed, input, signal, viewChild } from '@angular/core';
import { formatDuration } from '../formatting.service';

const SPEEDS = [1, 1.25, 1.5, 2];

/**
 * The player of a recording: a round play button beside a title, a seek bar with
 * playback speed, and room for actions. Used by the podcast card and the session recording.
 *
 * Slots: `[playerTitle]` beside the play button, `[playerSeal]` in its place while there is
 * no audio, `[playerActions]` for buttons (below the player when narrow, beside the title
 * when wide) and the rest below everything. The host is the container the layout responds to.
 */
@Component({
  selector: 'app-audio-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block @container' },
  template: `
    <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div class="flex items-center gap-3 min-w-0 flex-1 basis-full @[30rem]:basis-0">
        @if (src()) {
          <button
            type="button"
            class="qm-medallion qm-medallion-brand qm-play"
            (click)="togglePlay()"
            [disabled]="loadFailed()"
            [attr.aria-label]="(isPlaying() ? 'Pauzeer ' : 'Speel ') + label()"
            [attr.aria-pressed]="isPlaying()"
          >
            @if (isBuffering()) {
              <span class="qm-spinner qm-spinner-light" aria-hidden="true"></span>
            } @else if (isPlaying()) {
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
            } @else {
              <!-- Drawn around its centre of mass, so the triangle sits in the middle of the seal. -->
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M8.67 6v12l10-6z" /></svg>
            }
          </button>
        } @else {
          <ng-content select="[playerSeal]" />
        }
        <div class="min-w-0 flex-1">
          <ng-content select="[playerTitle]" />
        </div>
      </div>

      <div class="order-3 flex basis-full gap-2 empty:hidden @[30rem]:order-2 @[30rem]:basis-auto">
        <ng-content select="[playerActions]" />
      </div>

      @if (src()) {
        <div class="order-2 flex basis-full items-center gap-2 @[30rem]:order-3">
          <audio
            #audio
            [preload]="preload()"
            [src]="src()"
            (loadstart)="loadFailed.set(false)"
            (loadedmetadata)="onDurationChange(audio)"
            (durationchange)="onDurationChange(audio)"
            (timeupdate)="currentTime.set(audio.currentTime)"
            (play)="isPlaying.set(true)"
            (pause)="isPlaying.set(false); isBuffering.set(false)"
            (waiting)="isBuffering.set(true)"
            (playing)="isBuffering.set(false)"
            (error)="onLoadError()"
          ></audio>
          <span class="min-w-9 shrink-0 text-xs tabular-nums qm-muted">{{ elapsed() }}</span>
          <input
            type="range"
            class="qm-seek min-w-0 flex-1"
            min="0"
            step="1"
            [max]="totalSeconds()"
            [value]="currentTime()"
            [disabled]="!totalSeconds() || loadFailed()"
            [style.--qm-seek-fill]="playedPercent() + '%'"
            (input)="seek($event)"
            [attr.aria-label]="'Positie in ' + label()"
            [attr.aria-valuetext]="elapsed() + ' van ' + total()"
          />
          <span class="min-w-9 shrink-0 text-right text-xs tabular-nums qm-muted">{{ total() }}</span>
          <button
            type="button"
            class="qm-btn qm-btn-ghost qm-btn-sm -mr-1.5 w-12 shrink-0 !px-0 tabular-nums"
            (click)="cycleSpeed()"
            title="Afspeelsnelheid"
            [attr.aria-label]="'Afspeelsnelheid: ' + speedLabel()"
          >
            {{ speedLabel() }}
          </button>
        </div>
      }
    </div>

    @if (loadFailed()) {
      <p class="mt-3 text-xs text-wine" role="alert">De audio kon niet worden geladen. Probeer het later opnieuw.</p>
    }

    <ng-content />
  `
})
export class AudioPlayerComponent {
  /** The audio to play; without it the seal is shown and the seek bar is left out. */
  readonly src = input<string | null | undefined>(null);
  /** What is played, for the labels of the controls: "podcast v3", "opname". */
  readonly label = input('audio');
  /** Stored length in seconds, shown until (or instead of) the length the browser reads from the file. */
  readonly duration = input(0);
  /** `none` for a file too large to fetch before anyone asks for it. */
  readonly preload = input<'none' | 'metadata'>('metadata');

  private readonly audio = viewChild<ElementRef<HTMLAudioElement>>('audio');

  readonly isPlaying = signal(false);
  readonly isBuffering = signal(false);
  readonly loadFailed = signal(false);
  readonly currentTime = signal(0);
  private readonly mediaDuration = signal(0);
  private readonly speed = signal(1);

  readonly totalSeconds = computed(() => this.mediaDuration() || this.duration() || 0);
  /** Written like the total, so the position does not change width when it passes the hour. */
  readonly elapsed = computed(() => formatDuration(this.currentTime(), this.totalSeconds() >= 3600));
  readonly total = computed(() => formatDuration(this.totalSeconds()));
  readonly playedPercent = computed(() => {
    const total = this.totalSeconds();
    return total ? Math.min(100, (this.currentTime() / total) * 100) : 0;
  });
  readonly speedLabel = computed(() => `${this.speed().toLocaleString('nl-NL')}×`);

  togglePlay(): void {
    const audio = this.audio()?.nativeElement;
    if (!audio) return;
    if (audio.paused) {
      // A refused or interrupted start leaves the button on "play"; a broken file reports through `error`.
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }

  seek(event: Event): void {
    const seconds = Number((event.target as HTMLInputElement).value);
    const audio = this.audio()?.nativeElement;
    if (audio) audio.currentTime = seconds;
    this.currentTime.set(seconds);
  }

  cycleSpeed(): void {
    const next = SPEEDS[(SPEEDS.indexOf(this.speed()) + 1) % SPEEDS.length];
    this.speed.set(next);
    const audio = this.audio()?.nativeElement;
    if (audio) audio.playbackRate = next;
  }

  onDurationChange(audio: HTMLAudioElement): void {
    this.mediaDuration.set(Number.isFinite(audio.duration) ? audio.duration : 0);
  }

  onLoadError(): void {
    this.loadFailed.set(true);
    this.isPlaying.set(false);
    this.isBuffering.set(false);
  }
}
