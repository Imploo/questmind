import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CampaignContextService } from './campaign-context.service';
import { AudioSessionStateService } from '../audio/services/audio-session-state.service';
import { CampaignHeadingComponent } from './campaign-heading.component';
import { CampaignTabsComponent } from './campaign-tabs.component';
import { CampaignShareButtonComponent } from '../campaign-share/campaign-share-button.component';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/**
 * A campaign: its name and facts, the way to a new session, sharing, and its parts
 * as tabs (story, sessions, podcasts). The tab pages render in the outlet below.
 */
@Component({
  selector: 'app-campaign-page',
  imports: [RouterLink, RouterOutlet, CampaignHeadingComponent, CampaignTabsComponent, CampaignShareButtonComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-5xl mx-auto space-y-4 sm:space-y-5">
      <a routerLink="/campaigns" class="qm-backlink">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 12H5m7 7l-7-7 7-7" />
        </svg>
        {{ 'campaign.page.back' | translate }}
      </a>

      <app-campaign-heading
        [name]="campaign()?.name ?? ''"
        [sessionCount]="sessionCount()"
        [playerCount]="playerCount()"
        [lastPlayed]="lastPlayed()"
      >
        <!-- Equal heights: the share and settings buttons stretch to the new-session button. -->
        <div class="flex w-full items-stretch gap-2.5 sm:w-auto">
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
          @if (campaignId(); as campaignId) {
            <app-campaign-share-button [campaignId]="campaignId" />
          }
          <a
            [routerLink]="base().concat('settings')"
            class="qm-btn qm-btn-lg qm-btn-icon"
            [attr.aria-label]="'campaign.page.settings' | translate"
            [title]="'campaign.page.settings' | translate"
            data-testid="campaign-settings"
          >
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-width="2" d="M4 6h8m6 0h2M4 12h2m6 0h8M4 18h10m6 0h0" />
              <circle cx="15" cy="6" r="2.5" stroke-width="2" />
              <circle cx="9" cy="12" r="2.5" stroke-width="2" />
              <circle cx="17" cy="18" r="2.5" stroke-width="2" />
            </svg>
          </a>
        </div>
      </app-campaign-heading>

      <app-campaign-tabs [base]="base()" [sessionCount]="sessionCount()" />

      <router-outlet />
    </div>
  `,
})
export class CampaignPageComponent {
  private readonly campaignContext = inject(CampaignContextService);
  private readonly sessionState = inject(AudioSessionStateService);

  readonly campaign = this.campaignContext.selectedCampaign;
  readonly campaignId = this.campaignContext.selectedCampaignId;
  /** The campaign's own address, for the links of its parts. */
  readonly base = computed(() => ['/campaign', this.campaignContext.selectedCampaignId() ?? '']);

  readonly sessionCount = computed(() => this.sessionState.sessions().length);
  readonly playerCount = computed(() => Object.keys(this.campaign()?.members ?? {}).length);

  /** The latest play day of the campaign's sessions. */
  readonly lastPlayed = computed(() => this.sessionState.sortedSessions().find(session => !!session.sessionDate)?.sessionDate ?? null);
}
