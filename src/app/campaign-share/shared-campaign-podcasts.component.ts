import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SessionPodcastListComponent, SessionWithPodcasts } from '../audio/session-podcast-list.component';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { SharedCampaignStore } from './shared-campaign.store';
import { toPodcastVersion } from './campaign-share.models';

/** The podcasts tab of a shared campaign: to play and download, newest play day first. */
@Component({
  selector: 'app-shared-campaign-podcasts',
  imports: [SessionPodcastListComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sessions().length > 0) {
      <p class="mb-4 text-sm text-white/85">{{ 'podcast.library.intro' | translate }}</p>
      <app-session-podcast-list [sessions]="sessions()" />
    } @else {
      <div class="qm-panel qm-hero qm-empty">
        <span class="qm-medallion qm-medallion-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></span>
        <h2 class="qm-empty-title">{{ 'campaign.sharePage.noPodcasts' | translate }}</h2>
      </div>
    }
  `,
})
export class SharedCampaignPodcastsComponent {
  private readonly store = inject(SharedCampaignStore);
  private readonly i18n = inject(I18nService);

  /** The sessions are already newest first; those without podcasts are left out. */
  readonly sessions = computed<SessionWithPodcasts[]>(() => {
    const untitled = this.i18n.t().audio.untitledSession;
    return (this.store.campaign()?.sessions ?? [])
      .filter(session => session.podcasts.length > 0)
      .map(session => ({
        sessionId: session.id,
        sessionTitle: session.title || untitled,
        sessionDate: session.sessionDate ?? '',
        podcasts: session.podcasts.map(toPodcastVersion),
      }));
  });
}
