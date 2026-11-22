import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormattingService } from '../shared/formatting.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/**
 * The name of a campaign and its facts (sessions, players, last played), with room
 * for actions beside it. On the campaign page and on a shared campaign.
 */
@Component({
  selector: 'app-campaign-heading',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <h1 class="qm-page-title break-words">{{ name() }}</h1>
        <p class="qm-page-sub mt-1 flex flex-wrap gap-x-2" data-testid="campaign-facts">
          <span>{{ 'campaign.page.sessions' | translate: sessionCount() }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'campaign.page.players' | translate: playerCount() }}</span>
          @if (lastPlayed(); as lastPlayed) {
            <span aria-hidden="true">·</span>
            <span>{{ 'campaign.page.lastPlayed' | translate: formatting.formatDay(lastPlayed) }}</span>
          }
        </p>
      </div>
      <ng-content />
    </header>
  `,
})
export class CampaignHeadingComponent {
  protected readonly formatting = inject(FormattingService);

  readonly name = input('');
  readonly sessionCount = input(0);
  readonly playerCount = input(0);
  /** The latest play day (`2026-10-20`), or null. */
  readonly lastPlayed = input<string | null>(null);
}
