import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CampaignContextService } from './campaign-context.service';
import { AudioSessionStateService } from '../audio/services/audio-session-state.service';
import { FormattingService } from '../shared/formatting.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/**
 * A campaign: its name and facts, the way to a new session, and its parts as tabs
 * (story, sessions, podcasts). The tab pages render in the outlet below.
 */
@Component({
  selector: 'app-campaign-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-5xl mx-auto space-y-4 sm:space-y-5">
      <a routerLink="/campaigns" class="qm-backlink">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 12H5m7 7l-7-7 7-7" />
        </svg>
        {{ 'campaign.page.back' | translate }}
      </a>

      <header class="flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <h1 class="qm-page-title break-words">{{ campaign()?.name }}</h1>
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
        <div class="flex w-full items-center gap-2.5 sm:w-auto">
          <a
            [routerLink]="base().concat('sessions', 'new')"
            class="qm-btn qm-btn-gold qm-btn-lg flex-1 sm:flex-none"
            data-testid="new-session"
          >
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            {{ 'campaign.page.newSession' | translate }}
          </a>
          <a
            [routerLink]="base().concat('settings')"
            class="qm-btn qm-btn-lg qm-btn-icon !w-[46px]"
            [attr.aria-label]="'campaign.page.settings' | translate"
            [title]="'campaign.page.settings' | translate"
          >
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-width="2" d="M4 6h8m6 0h2M4 12h2m6 0h8M4 18h10m6 0h0" />
              <circle cx="15" cy="6" r="2.5" stroke-width="2" />
              <circle cx="9" cy="12" r="2.5" stroke-width="2" />
              <circle cx="17" cy="18" r="2.5" stroke-width="2" />
            </svg>
          </a>
        </div>
      </header>

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

      <router-outlet />
    </div>
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
      .campaign-tabs { align-self: flex-start; width: fit-content; }
      .campaign-tab { flex: 0 0 auto; gap: 0.5rem; padding: 0 1rem; font-size: 0.78rem; letter-spacing: 0.12em; }
    }
  `],
})
export class CampaignPageComponent {
  private readonly campaignContext = inject(CampaignContextService);
  private readonly sessionState = inject(AudioSessionStateService);
  protected readonly formatting = inject(FormattingService);

  readonly campaign = this.campaignContext.selectedCampaign;
  /** The campaign's own address, for the links of its parts. */
  readonly base = computed(() => ['/campaign', this.campaignContext.selectedCampaignId() ?? '']);

  readonly sessionCount = computed(() => this.sessionState.sessions().length);
  readonly playerCount = computed(() => Object.keys(this.campaign()?.members ?? {}).length);

  /** The latest play day of the campaign's sessions. */
  readonly lastPlayed = computed(() => this.sessionState.sortedSessions().find(session => !!session.sessionDate)?.sessionDate ?? null);
}
