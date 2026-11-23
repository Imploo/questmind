import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SessionRow, SessionRowsComponent } from '../audio/session-rows.component';
import { dayParts, storyExcerpt } from '../audio/session-row.utils';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { SharedCampaignStore } from './shared-campaign.store';

/** The sessions tab of a shared campaign: every written session, newest first. */
@Component({
  selector: 'app-shared-campaign-sessions',
  imports: [SessionRowsComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="qm-panel !p-3 sm:!p-5">
      @if (rows().length > 0) {
        <app-session-rows [rows]="rows()" />
      } @else {
        <p class="qm-empty-text py-8 text-center">{{ 'campaign.sharePage.noSessions' | translate }}</p>
      }
    </section>
  `,
})
export class SharedCampaignSessionsComponent {
  private readonly store = inject(SharedCampaignStore);
  private readonly i18n = inject(I18nService);

  readonly rows = computed<SessionRow[]>(() => {
    const untitled = this.i18n.t().audio.untitledSession;
    const locale = this.i18n.locale();
    const base = this.store.base();
    return (this.store.campaign()?.sessions ?? []).map(session => ({
      id: session.id,
      link: [...base, 'sessions', session.id],
      title: session.title || untitled,
      ...dayParts(session.sessionDate, locale),
      excerpt: storyExcerpt(session.content),
      hasPodcast: session.podcasts.length > 0,
      isMine: false,
      failed: false,
      busy: null,
    }));
  });
}
