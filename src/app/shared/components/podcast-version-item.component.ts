import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { PodcastProgressStep, PodcastVersion } from '../../audio/services/audio-session.models';
import { PodcastShareTarget } from '../../audio/services/podcast-share.service';
import { PodcastShareButtonComponent } from '../../audio/podcast-share-button.component';
import { FormattingService, formatDuration, formatFileSize } from '../formatting.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/**
 * One podcast version: play button, status badge, date/size, the seek bar with
 * playback speed, download and share. Used by the session story, the podcast library and the
 * campaign story. Downloading is a plain `<a download>` link, the only
 * download path for podcasts.
 */
const SPEEDS = [1, 1.25, 1.5, 2];
/** The steps the app has a text for; a document can hold anything. */
const PROGRESS_STEPS: readonly PodcastProgressStep[] = ['starting', 'script', 'audio', 'uploading', 'done', 'failed'];

@Component({
  selector: 'app-podcast-version-item',
  imports: [PodcastShareButtonComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // A block, so the spacing a list puts between its items applies.
  host: { class: 'block' },
  template: `
    <article class="qm-well @container">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
        <!-- Who and what: the play button (or a status seal), title, badge and details. -->
        <div class="flex items-center gap-3 min-w-0 flex-1 basis-full @lg:basis-0">
          @if (podcast().audioUrl) {
            <button
              type="button"
              class="qm-medallion qm-medallion-brand qm-play"
              (click)="togglePlay()"
              [disabled]="loadFailed()"
              [attr.aria-label]="playLabel()"
              [attr.aria-pressed]="isPlaying()"
            >
              @if (isBuffering()) {
                <span class="qm-spinner qm-spinner-light" aria-hidden="true"></span>
              } @else if (isPlaying()) {
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
              } @else {
                <svg class="translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" /></svg>
              }
            </button>
          } @else {
            <span class="qm-medallion" [class.text-wine]="podcast().status === 'failed'" aria-hidden="true">
              @if (isInProgress()) {
                <span class="qm-spinner"></span>
              } @else {
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              }
            </span>
          }

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="font-display text-[0.95rem] font-bold leading-tight">{{ 'podcast.versionTitle' | translate: podcast().version }}</span>
              @switch (podcast().status) {
                @case ('completed') {
                  <span class="qm-badge" [class]="podcast().audioUrl ? 'qm-badge-success' : 'qm-badge-quiet'" data-testid="podcast-status">
                    {{ (podcast().audioUrl ? 'podcast.status.ready' : 'podcast.status.audioMissing') | translate }}
                  </span>
                }
                @case ('failed') {
                  <span class="qm-badge qm-badge-danger" data-testid="podcast-status">{{ 'common.failed' | translate }}</span>
                }
                @default {
                  <span class="qm-badge qm-badge-info" data-testid="podcast-status">{{ progressLabel() }}</span>
                  @if (partLabel(); as part) {
                    <span class="text-xs qm-muted" data-testid="podcast-part">{{ part }}</span>
                  }
                }
              }
            </div>
            @if (details().length) {
              <p class="mt-1 text-xs qm-muted">{{ details().join(' · ') }}</p>
            }
          </div>
        </div>

        <!-- Below the player on a narrow card, beside the title on a wide one. -->
        @if (podcast().audioUrl) {
          <div class="order-3 flex basis-full gap-2 @lg:order-2 @lg:basis-auto">
            <a
              class="qm-btn qm-btn-sm flex-1 @lg:flex-none"
              [href]="podcast().audioUrl"
              [attr.download]="downloadFileName()"
              target="_blank"
              rel="noopener"
              [title]="'podcast.downloadTitle' | translate"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" /></svg>
              {{ 'common.download' | translate }}
            </a>
            @if (shareTarget(); as target) {
              <app-podcast-share-button class="flex-1 @lg:flex-none" [target]="target" [disabled]="!isReady()" />
            }
          </div>
        }

        @if (podcast().audioUrl) {
          <div class="order-2 flex basis-full items-center gap-2 @lg:order-3">
            <audio
              #audio
              preload="metadata"
              [src]="podcast().audioUrl"
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
              [attr.aria-label]="'podcast.player.position' | translate: podcast().version"
              [attr.aria-valuetext]="'podcast.player.positionValue' | translate: elapsed() : total()"
            />
            <span class="min-w-9 shrink-0 text-right text-xs tabular-nums qm-muted">{{ total() }}</span>
            <button
              type="button"
              class="qm-btn qm-btn-ghost qm-btn-sm -mr-1.5 w-12 shrink-0 !px-0 tabular-nums"
              (click)="cycleSpeed()"
              [title]="'podcast.player.speed' | translate"
              [attr.aria-label]="'podcast.player.speedLabel' | translate: speedText()"
            >
              {{ 'podcast.player.speedValue' | translate: speedText() }}
            </button>
          </div>
        }
      </div>

      @if (loadFailed()) {
        <p class="mt-3 text-xs text-wine" role="alert">{{ 'podcast.player.loadFailed' | translate }}</p>
      }

      @if (isInProgress() && podcast().progress) {
        <div class="qm-progress mt-3">
          <div class="qm-progress-bar" [style.width.%]="podcast().progress"></div>
        </div>
      }

      @if (podcast().status === 'failed' && podcast().error) {
        <p class="mt-3 text-xs text-wine">{{ 'podcast.generationFailed' | translate }}</p>
        <!-- The stored error is raw exception text: not translated, so folded away. -->
        <details class="mt-1 text-xs text-wine">
          <summary>{{ 'errors.technicalDetails' | translate }}</summary>
          <p class="mt-1 whitespace-pre-wrap break-words" data-testid="podcast-error">{{ podcast().error }}</p>
        </details>
      }

      @if (showScript() && podcast().script?.segments?.length) {
        <details class="mt-3 text-sm">
          <summary class="font-semibold text-gold-deep">{{ 'podcast.script' | translate }}</summary>
          <div class="mt-2 space-y-1">
            @for (segment of podcast().script?.segments; track $index) {
              <p class="text-gray-700">
                <span class="font-semibold">{{ (segment.speaker === 'host1' ? 'podcast.host1' : 'podcast.host2') | translate }}:</span>
                {{ segment.text }}
              </p>
            }
          </div>
        </details>
      }
    </article>
  `
})
export class PodcastVersionItemComponent {
  readonly podcast = input.required<PodcastVersion>();
  /** Share target; without one, or without audio to share, the share button is hidden. */
  readonly shareTarget = input<PodcastShareTarget | null>(null);
  /** Base name of the downloaded file; the version and `.mp3` are appended. */
  readonly downloadName = input('podcast');
  readonly showScript = input(false);

  private readonly audio = viewChild<ElementRef<HTMLAudioElement>>('audio');

  readonly isPlaying = signal(false);
  readonly isBuffering = signal(false);
  readonly loadFailed = signal(false);
  readonly currentTime = signal(0);
  /** Length as the browser reads it from the file; the stored duration can be missing. */
  private readonly formatting = inject(FormattingService);
  private readonly i18n = inject(I18nService);
  private readonly mediaDuration = signal(0);
  private readonly speed = signal(1);

  readonly isReady = computed(() => this.podcast().status === 'completed' && !!this.podcast().audioUrl);
  readonly isInProgress = computed(() => !['completed', 'failed'].includes(this.podcast().status));
  readonly downloadFileName = computed(() => `${this.downloadName() || 'podcast'}-v${this.podcast().version}.mp3`);

  readonly totalSeconds = computed(() => this.mediaDuration() || this.podcast().duration || 0);
  readonly elapsed = computed(() => formatDuration(this.currentTime()));
  readonly total = computed(() => formatDuration(this.totalSeconds()));
  readonly playedPercent = computed(() => {
    const total = this.totalSeconds();
    return total ? Math.min(100, (this.currentTime() / total) * 100) : 0;
  });
  /** The speed as a number in the active notation (`1,5` / `1.5`); the texts add the rest. */
  readonly speedText = computed(() => this.formatting.formatNumber(this.speed()));
  readonly playLabel = computed(() => {
    const player = this.i18n.t().podcast.player;
    const version = this.podcast().version;
    return this.isPlaying() ? player.pause(version) : player.play(version);
  });

  /**
   * What a podcast in the making is doing. The step the backend reports decides;
   * an entry without one (written before ticket #72) falls back on its status.
   * The stored `progressMessage` is never shown.
   */
  readonly progressLabel = computed(() => {
    const texts = this.i18n.t();
    const { status, progressStep } = this.podcast();
    if (progressStep && PROGRESS_STEPS.includes(progressStep)) return texts.podcast.steps[progressStep];
    return status === 'script_complete' ? texts.podcast.status.generatingAudio : texts.common.busy;
  });

  /** "Part 2 of 5" while the audio is generated in parts; empty otherwise. */
  readonly partLabel = computed(() => {
    const detail = this.podcast().progressDetail;
    return detail && detail.total > 0 ? this.i18n.t().progress.partCount(detail.current, detail.total) : '';
  });

  /** Date and size under the title; the length sits at the end of the seek bar. */
  readonly details = computed(() => {
    const { createdAt, fileSize, audioUrl, duration } = this.podcast();
    return [
      this.formatting.formatDate(createdAt),
      !audioUrl && duration ? formatDuration(duration) : '',
      fileSize ? formatFileSize(fileSize) : '',
    ].filter(Boolean);
  });

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
