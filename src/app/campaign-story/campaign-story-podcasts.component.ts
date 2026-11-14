import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PodcastVersion } from '../audio/services/audio-session.models';
import { PodcastVersionItemComponent } from '../shared/components/podcast-version-item.component';

/** Podcasts of one campaign story version (ticket #69). */
@Component({
  selector: 'app-campaign-story-podcasts',
  imports: [PodcastVersionItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="qm-panel sm:!p-6 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="qm-section-title !mb-1.5">Podcast</h3>
          <p class="text-sm qm-muted">Twee hosts blikken terug op deze versie van het verhaal</p>
        </div>
        @if (canGenerate()) {
          <button
            type="button"
            class="qm-btn qm-btn-primary"
            [disabled]="isGenerating()"
            (click)="generate.emit()"
          >
            {{ isGenerating() ? 'Bezig...' : 'Podcast genereren' }}
          </button>
        }
      </div>

      @if (error()) {
        <div class="qm-alert" role="alert">{{ error() }}</div>
      }

      @for (podcast of podcasts(); track podcast.version) {
        <app-podcast-version-item
          [podcast]="podcast"
          [shareTarget]="campaignId() && storyVersion() ? { campaignId: campaignId(), storyVersion: storyVersion(), podcastVersion: podcast.version } : null"
          [downloadName]="downloadName() + '-podcast'"
        />
      } @empty {
        <p class="font-prose text-base text-gray-600">Nog geen podcast voor deze versie.</p>
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
