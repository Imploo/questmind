import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PodcastVersion } from '../../audio/services/audio-session.models';
import { PodcastShareTarget } from '../../audio/services/podcast-share.service';
import { PodcastShareButtonComponent } from '../../audio/podcast-share-button.component';
import { formatDate, formatDuration, formatFileSize } from '../formatting.service';

/**
 * One podcast version: status badge, duration/size/date, download, share and
 * the audio player. Used by the session story, the podcast library and the
 * campaign story. Downloading is a plain `<a download>` link, the only
 * download path for podcasts.
 */
@Component({
  selector: 'app-podcast-version-item',
  imports: [PodcastShareButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="qm-well space-y-3">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span class="qm-medallion qm-medallion-brand text-sm">
          v{{ podcast().version }}
        </span>

        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold">Podcast v{{ podcast().version }}</span>
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
          <div class="flex flex-wrap items-center gap-x-2 mt-1 text-xs qm-muted">
            <span>{{ duration() }}</span>
            @if (podcast().fileSize) {
              <span aria-hidden="true">•</span>
              <span>{{ fileSize() }}</span>
            }
            @if (createdAt()) {
              <span aria-hidden="true">•</span>
              <span>{{ createdAt() }}</span>
            }
          </div>
        </div>

        <div class="flex items-center gap-2">
          @if (podcast().audioUrl) {
            <a
              class="qm-btn qm-btn-sm"
              [href]="podcast().audioUrl"
              [attr.download]="downloadFileName()"
              target="_blank"
              rel="noopener"
              title="Podcast downloaden"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" /></svg>
              Download
            </a>
          }
          @if (shareTarget(); as target) {
            <app-podcast-share-button [target]="target" [disabled]="!isReady()" />
          }
        </div>
      </div>

      @if (isInProgress() && podcast().progress) {
        <div class="qm-progress">
          <div class="qm-progress-bar" [style.width.%]="podcast().progress"></div>
        </div>
      }

      @if (podcast().status === 'failed' && podcast().error) {
        <p class="text-xs text-wine">{{ podcast().error }}</p>
      }

      @if (podcast().audioUrl) {
        <audio controls preload="metadata" class="w-full" [src]="podcast().audioUrl">
          Je browser ondersteunt het audio element niet.
        </audio>
      }

      @if (showScript() && podcast().script?.segments?.length) {
        <details class="text-sm">
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
    </div>
  `
})
export class PodcastVersionItemComponent {
  readonly podcast = input.required<PodcastVersion>();
  /** Share target; without one the share button is hidden. */
  readonly shareTarget = input<PodcastShareTarget | null>(null);
  /** Base name of the downloaded file; the version and `.mp3` are appended. */
  readonly downloadName = input('podcast');
  readonly showScript = input(false);

  readonly isReady = computed(() => this.podcast().status === 'completed' && !!this.podcast().audioUrl);
  readonly isInProgress = computed(() => !['completed', 'failed'].includes(this.podcast().status));
  readonly downloadFileName = computed(() => `${this.downloadName() || 'podcast'}-v${this.podcast().version}.mp3`);
  readonly duration = computed(() => formatDuration(this.podcast().duration));
  readonly fileSize = computed(() => formatFileSize(this.podcast().fileSize));
  readonly createdAt = computed(() => formatDate(this.podcast().createdAt));
}
