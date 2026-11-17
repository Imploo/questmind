import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PodcastVersion } from '../audio/services/audio-session.models';
import { PodcastVersionItemComponent } from '../shared/components/podcast-version-item.component';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** Podcasts of one campaign story version (ticket #69). */
@Component({
  selector: 'app-campaign-story-podcasts',
  imports: [PodcastVersionItemComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="qm-panel sm:!p-6 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="qm-section-title !mb-1.5">{{ 'campaignStory.podcasts.title' | translate }}</h3>
          <p class="text-sm qm-muted">{{ 'campaignStory.podcasts.intro' | translate }}</p>
        </div>
        @if (canGenerate()) {
          <button
            type="button"
            class="qm-btn qm-btn-primary"
            [disabled]="isGenerating()"
            (click)="generate.emit()"
          >
            {{ (isGenerating() ? 'common.busy' : 'campaignStory.podcasts.generate') | translate }}
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
          [downloadName]="(downloadName() || ('campaignStory.downloadName' | translate)) + '-podcast'"
        />
      } @empty {
        <p class="font-prose text-base text-gray-600">{{ 'campaignStory.podcasts.empty' | translate }}</p>
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
  /** File name for a downloaded podcast; empty means the translated default. */
  readonly downloadName = input('');

  readonly generate = output<void>();
}
