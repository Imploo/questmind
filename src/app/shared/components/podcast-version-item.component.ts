import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PodcastVersion } from '../../audio/services/audio-session.models';
import { PodcastShareTarget } from '../../audio/services/podcast-share.service';
import { PodcastShareButtonComponent } from '../../audio/podcast-share-button.component';
import { AudioPlayerComponent } from './audio-player.component';
import { formatDate, formatDuration, formatFileSize } from '../formatting.service';

/**
 * One podcast version: the player with a status badge, date/size, download and share.
 * Used by the session story, the podcast library and the campaign story. Downloading is
 * a plain `<a download>` link, the only download path for podcasts.
 */
@Component({
  selector: 'app-podcast-version-item',
  imports: [AudioPlayerComponent, PodcastShareButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // A block, so the spacing a list puts between its items applies.
  host: { class: 'block' },
  template: `
    <article class="qm-well">
      <app-audio-player [src]="podcast().audioUrl" [label]="'podcast v' + podcast().version" [duration]="podcast().duration ?? 0">
        <!-- In place of the play button while there is nothing to play. -->
        <span playerSeal class="qm-medallion" [class.text-wine]="podcast().status === 'failed'" aria-hidden="true">
          @if (isInProgress()) {
            <span class="qm-spinner"></span>
          } @else {
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          }
        </span>

        <ng-container ngProjectAs="[playerTitle]">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="font-display text-[0.95rem] font-bold leading-tight">Podcast v{{ podcast().version }}</span>
            @switch (podcast().status) {
              @case ('completed') {
                <span class="qm-badge" [class]="podcast().audioUrl ? 'qm-badge-success' : 'qm-badge-quiet'" data-testid="podcast-status">
                  {{ podcast().audioUrl ? 'Klaar' : 'Audio ontbreekt' }}
                </span>
              }
              @case ('failed') {
                <span class="qm-badge qm-badge-danger" data-testid="podcast-status">Mislukt</span>
              }
              @case ('script_complete') {
                <span class="qm-badge qm-badge-info" data-testid="podcast-status">Audio genereren...</span>
              }
              @default {
                <span class="qm-badge qm-badge-info" data-testid="podcast-status">
                  {{ podcast().progressMessage || 'Bezig...' }}
                </span>
              }
            }
          </div>
          @if (details().length) {
            <p class="mt-1 text-xs qm-muted">{{ details().join(' · ') }}</p>
          }
        </ng-container>

        <ng-container ngProjectAs="[playerActions]">
          @if (podcast().audioUrl) {
            <a
              class="qm-btn qm-btn-sm flex-1 @[30rem]:flex-none"
              [href]="podcast().audioUrl"
              [attr.download]="downloadFileName()"
              target="_blank"
              rel="noopener"
              title="Podcast downloaden"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" /></svg>
              Download
            </a>
            @if (shareTarget(); as target) {
              <app-podcast-share-button class="flex-1 @[30rem]:flex-none" [target]="target" [disabled]="!isReady()" />
            }
          }
        </ng-container>

        @if (isInProgress() && podcast().progress) {
          <div class="qm-progress mt-3">
            <div class="qm-progress-bar" [style.width.%]="podcast().progress"></div>
          </div>
        }

        @if (podcast().status === 'failed' && podcast().error) {
          <p class="mt-3 text-xs text-wine">{{ podcast().error }}</p>
        }

        @if (showScript() && podcast().script?.segments?.length) {
          <details class="mt-3 text-sm">
            <summary class="font-semibold text-gold-deep">Script</summary>
            <div class="mt-2 space-y-1">
              @for (segment of podcast().script?.segments; track $index) {
                <p class="text-gray-700">
                  <span class="font-semibold">{{ segment.speaker === 'host1' ? 'Host 1' : 'Host 2' }}:</span>
                  {{ segment.text }}
                </p>
              }
            </div>
          </details>
        }
      </app-audio-player>
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

  readonly isReady = computed(() => this.podcast().status === 'completed' && !!this.podcast().audioUrl);
  readonly isInProgress = computed(() => !['completed', 'failed'].includes(this.podcast().status));
  readonly downloadFileName = computed(() => `${this.downloadName() || 'podcast'}-v${this.podcast().version}.mp3`);

  /** Date and size under the title; the length sits at the end of the seek bar. */
  readonly details = computed(() => {
    const { createdAt, fileSize, audioUrl, duration } = this.podcast();
    return [
      formatDate(createdAt),
      !audioUrl && duration ? formatDuration(duration) : '',
      fileSize ? formatFileSize(fileSize) : '',
    ].filter(Boolean);
  });
}
