import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CampaignStoryViewComponent } from '../campaign-story/campaign-story-view.component';
import { CampaignStoryPodcastsComponent } from '../campaign-story/campaign-story-podcasts.component';
import { coveredUntil } from '../campaign-story/campaign-story.utils';
import { FormattingService } from '../shared/formatting.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { SharedCampaignStore } from './shared-campaign.store';
import { toPodcastVersion, toStoryVersion } from './campaign-share.models';

/** The story tab of a shared campaign: the newest version of the story and its podcasts, read-only. */
@Component({
  selector: 'app-shared-campaign-story',
  imports: [CampaignStoryViewComponent, CampaignStoryPodcastsComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4 sm:space-y-5">
      @if (version(); as version) {
        @if (coverText(); as coverText) {
          <div class="qm-panel !py-3.5" data-testid="story-status">
            <p class="text-sm font-semibold">{{ coverText }}</p>
          </div>
        }
        <app-campaign-story-view class="block" [version]="version" />
        @if (podcasts().length > 0) {
          <app-campaign-story-podcasts class="block" [podcasts]="podcasts()" [downloadName]="version.title ?? ''" />
        }
      } @else {
        <div class="qm-panel qm-hero qm-empty" data-testid="story-empty">
          <span class="qm-medallion qm-medallion-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></span>
          <h2 class="qm-empty-title">{{ 'campaignStory.noStory' | translate }}</h2>
        </div>
      }
    </div>
  `,
})
export class SharedCampaignStoryComponent {
  private readonly store = inject(SharedCampaignStore);
  private readonly formatting = inject(FormattingService);
  private readonly i18n = inject(I18nService);

  private readonly story = computed(() => this.store.campaign()?.story ?? null);
  readonly version = computed(() => {
    const story = this.story();
    return story ? toStoryVersion(story) : null;
  });
  readonly podcasts = computed(() => (this.story()?.podcasts ?? []).map(toPodcastVersion));

  /** "The campaign story runs up to and including 20 Oct 2026." */
  readonly coverText = computed(() => {
    const day = coveredUntil(this.version());
    return day ? this.i18n.t().campaignStory.coversUntil(this.formatting.formatDay(day)) : '';
  });
}
