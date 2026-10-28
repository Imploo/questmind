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
    <div class="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-100 space-y-3">
      <div class="flex flex-wrap items-center gap-4">
        <span class="inline-flex flex-shrink-0 items-center justify-center w-10 h-10 bg-purple-600 text-white rounded-full font-semibold text-sm">
          v{{ podcast().version }}
        </span>

        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium text-gray-900">Podcast v{{ podcast().version }}</span>
            @switch (podcast().status) {
              @case ('completed') {
                <span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded" data-testid="podcast-status">
                  {{ podcast().audioUrl ? 'Klaar' : 'Audio ontbreekt' }}
                </span>
              }
              @case ('failed') {
                <span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded" data-testid="podcast-status">Mislukt</span>
              }
              @case ('script_complete') {
                <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded" data-testid="podcast-status">Audio genereren...</span>
              }
              @default {
                <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded" data-testid="podcast-status">
                  {{ podcast().progressMessage || 'Bezig...' }}
                </span>
              }
            }
          </div>
          <div class="flex flex-wrap items-center gap-x-2 mt-1 text-xs text-gray-500">
            <span>{{ duration() }}</span>
            @if (podcast().fileSize) {
              <span>•</span>
              <span>{{ fileSize() }}</span>
            }
            @if (createdAt()) {
              <span>•</span>
              <span>{{ createdAt() }}</span>
            }
          </div>
        </div>

        <div class="flex items-center gap-2">
          @if (podcast().audioUrl) {
            <a
              class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium shadow-sm"
              [href]="podcast().audioUrl"
              [attr.download]="downloadFileName()"
              target="_blank"
              rel="noopener"
              title="Podcast downloaden"
            >
              ⬇️ Download
            </a>
          }
          @if (shareTarget(); as target) {
            <app-podcast-share-button [target]="target" [disabled]="!isReady()" />
          }
        </div>
      </div>

      @if (isInProgress() && podcast().progress) {
        <div class="w-full bg-blue-200 rounded-full h-2">
          <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" [style.width.%]="podcast().progress"></div>
        </div>
      }

      @if (podcast().status === 'failed' && podcast().error) {
        <p class="text-xs text-red-600 m-0">{{ podcast().error }}</p>
      }

      @if (podcast().audioUrl) {
        <audio controls preload="metadata" class="w-full" [src]="podcast().audioUrl">
          Je browser ondersteunt het audio element niet.
        </audio>
      }

      @if (showScript() && podcast().script?.segments?.length) {
        <details class="text-sm">
          <summary class="cursor-pointer font-medium text-purple-900">Script</summary>
          <div class="mt-2 space-y-1">
            @for (segment of podcast().script?.segments; track $index) {
              <p class="m-0 text-gray-700">
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
