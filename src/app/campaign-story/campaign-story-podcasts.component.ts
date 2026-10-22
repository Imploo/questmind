import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormattingService } from '../shared/formatting.service';
import { PodcastVersion } from '../audio/services/audio-session.models';

/** Podcasts of one campaign story version (ticket #69). */
@Component({
  selector: 'app-campaign-story-podcasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="border border-purple-100 rounded-xl bg-white shadow-sm p-6 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold text-purple-900 m-0">Podcast</h3>
          <p class="text-sm text-purple-700 m-0 mt-1">Twee hosts blikken terug op deze versie van het verhaal</p>
        </div>
        @if (canGenerate()) {
          <button
            type="button"
            class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            [disabled]="isGenerating()"
            (click)="generate.emit()"
          >
            {{ isGenerating() ? 'Bezig...' : 'Podcast genereren' }}
          </button>
        }
      </div>

      @if (error()) {
        <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p class="text-sm text-red-700 m-0">{{ error() }}</p>
        </div>
      }

      @for (podcast of podcasts(); track podcast.version) {
        <div class="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-100 space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium text-gray-900">Podcast {{ podcast.version }}</span>
            @switch (podcast.status) {
              @case ('completed') {
                <span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Klaar</span>
              }
              @case ('failed') {
                <span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Mislukt</span>
              }
              @default {
                <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  {{ podcast.progressMessage || 'Bezig...' }}
                </span>
              }
            }
            <span class="text-xs text-gray-500 ml-auto">
              @if (podcast.duration) {
                {{ formatting.formatDuration(podcast.duration) }} ·
              }
              {{ formatting.formatDate(podcast.createdAt) }}
            </span>
          </div>

          @if (podcast.status !== 'completed' && podcast.status !== 'failed') {
            <div class="w-full bg-blue-200 rounded-full h-2">
              <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" [style.width.%]="podcast.progress || 0"></div>
            </div>
          }

          @if (podcast.status === 'failed' && podcast.error) {
            <p class="text-xs text-red-600 m-0">{{ podcast.error }}</p>
          }

          @if (podcast.audioUrl) {
            <audio controls preload="metadata" class="w-full" [src]="podcast.audioUrl">
              Je browser ondersteunt het audio element niet.
            </audio>
            <a
              class="inline-block text-sm font-medium text-purple-700 hover:underline"
              [href]="podcast.audioUrl"
              [attr.download]="downloadName() + '-podcast-' + podcast.version + '.mp3'"
              target="_blank"
              rel="noopener"
            >
              ⬇️ Download
            </a>
          }
        </div>
      } @empty {
        <p class="text-sm text-gray-500 m-0">Nog geen podcast voor deze versie.</p>
      }
    </section>
  `
})
export class CampaignStoryPodcastsComponent {
  readonly formatting = inject(FormattingService);

  readonly podcasts = input<PodcastVersion[]>([]);
  readonly canGenerate = input(false);
  readonly isGenerating = input(false);
  readonly error = input('');
  readonly downloadName = input('campagne-verhaal');

  readonly generate = output<void>();
}
