import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** The parts of a campaign as tabs: story, sessions and podcasts, below the address in `base`. */
@Component({
  selector: 'app-campaign-tabs',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav class="campaign-tabs" [attr.aria-label]="'campaign.page.tabsLabel' | translate">
      <a [routerLink]="base().concat('story')" routerLinkActive="is-active" ariaCurrentWhenActive="page" class="campaign-tab">
        {{ 'campaign.page.tabs.story' | translate }}
      </a>
      <a [routerLink]="base().concat('sessions')" routerLinkActive="is-active" ariaCurrentWhenActive="page" class="campaign-tab">
        {{ 'campaign.page.tabs.sessions' | translate }}
        <span class="campaign-tab-count">{{ sessionCount() }}</span>
      </a>
      <a [routerLink]="base().concat('podcasts')" routerLinkActive="is-active" ariaCurrentWhenActive="page" class="campaign-tab">
        {{ 'campaign.page.tabs.podcasts' | translate }}
      </a>
    </nav>
  `,
  styles: [`
    /* The parts of the campaign: the one you are in is a tab of parchment, like the rail's. */
    .campaign-tabs {
      display: flex;
      gap: 4px;
      padding: 4px;
      border-radius: 14px;
      background: rgba(36, 24, 92, 0.32);
      border: 1px solid rgba(255, 255, 255, 0.16);
    }
    .campaign-tab {
      display: inline-flex;
      flex: 1 1 0;
      /* On a phone the three tabs share the bar: they may shrink below their text's width. */
      min-width: 0;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      min-height: 44px;
      padding: 0 0.4rem;
      border-radius: 10px;
      border: 1px solid transparent;
      font-family: var(--font-display);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
      color: #fff;
      text-decoration: none;
      transition: background 0.15s, color 0.15s;
    }
    .campaign-tab:hover:not(.is-active) {
      background: rgba(255, 255, 255, 0.14);
    }
    .campaign-tab.is-active {
      color: var(--ink);
      background: var(--paper);
      border-color: #e5c77f;
      box-shadow: 0 8px 16px -8px rgba(10, 4, 40, 0.8);
    }
    .campaign-tab-count {
      padding: 0 0.45rem;
      border-radius: 999px;
      font-family: system-ui, sans-serif;
      font-size: 0.7rem;
      letter-spacing: 0;
      line-height: 1.6;
      background: rgba(255, 255, 255, 0.18);
    }
    .campaign-tab.is-active .campaign-tab-count {
      color: var(--gold-deep);
      background: var(--gold-soft);
    }
    /* A very narrow screen (or large text) has no room for the count. */
    @media (max-width: 339px) {
      .campaign-tab-count { display: none; }
    }
    @media (min-width: 640px) {
      .campaign-tabs { width: fit-content; }
      .campaign-tab { flex: 0 0 auto; gap: 0.5rem; padding: 0 1rem; font-size: 0.78rem; letter-spacing: 0.12em; }
    }
  `],
})
export class CampaignTabsComponent {
  /** The campaign's own address, e.g. `['/campaign', id]`. */
  readonly base = input.required<string[]>();
  readonly sessionCount = input(0);
}
