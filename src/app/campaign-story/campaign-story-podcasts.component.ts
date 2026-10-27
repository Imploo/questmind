import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PodcastVersion } from '../audio/services/audio-session.models';
import { PodcastVersionItemComponent } from '../shared/components/podcast-version-item.component';

/** Podcasts of one campaign story version (ticket #69). */
@Component({
  selector: 'app-campaign-story-podcasts',
  imports: [PodcastVersionItemComponent],
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
        <app-podcast-version-item
          [podcast]="podcast"
          [shareTarget]="campaignId() && storyVersion() ? { campaignId: campaignId(), storyVersion: storyVersion(), podcastVersion: podcast.version } : null"
          [downloadName]="downloadName() + '-podcast'"
        />
      } @empty {
        <p class="text-sm text-gray-500 m-0">Nog geen podcast voor deze versie.</p>
      }
    </section>
  `
})
export class CampaignStoryPodcastsComponent {
  readonly campaignId = input('');
  readonly storyVersion = input(0);
  readonly podcasts = input<PodcastVersion[]>([]);
  readonly canGenerate = input(false);
  readonly isGenerating = input(false);
  readonly error = input('');
  readonly downloadName = input('campagne-verhaal');

  readonly generate = output<void>();
}
