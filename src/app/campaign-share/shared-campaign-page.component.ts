import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { CampaignHeadingComponent } from '../campaign/campaign-heading.component';
import { CampaignTabsComponent } from '../campaign/campaign-tabs.component';
import { SharedCampaignStore, shareIdOf } from './shared-campaign.store';
import { SharedCampaignStatusComponent } from './shared-campaign-status.component';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/**
 * A campaign opened through its share link: the same heading and tabs as the
 * campaign page, read-only and without signing in. The tabs render in the outlet.
 */
@Component({
  selector: 'app-shared-campaign-page',
  imports: [RouterOutlet, CampaignHeadingComponent, CampaignTabsComponent, SharedCampaignStatusComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-5xl mx-auto space-y-4 sm:space-y-5">
      @if (store.campaign(); as campaign) {
        <app-campaign-heading
          [name]="campaign.name"
          [sessionCount]="campaign.sessionCount"
          [playerCount]="campaign.playerCount"
          [lastPlayed]="campaign.lastPlayed"
        >
          <span class="read-only" data-testid="read-only">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.46 12C3.73 7.94 7.52 5 12 5c4.48 0 8.27 2.94 9.54 7-1.27 4.06-5.06 7-9.54 7-4.48 0-8.27-2.94-9.54-7z" />
            </svg>
            {{ 'campaign.sharePage.readOnly' | translate }}
          </span>
        </app-campaign-heading>

        <app-campaign-tabs [base]="store.base()" [sessionCount]="campaign.sessionCount" />

        <router-outlet />
      } @else {
        <app-shared-campaign-status />
      }
    </div>
  `,
  styles: [`
    /* Light on the gradient, like the facts above it. */
    .read-only {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.3rem 0.75rem;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.35);
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
      font-size: 0.8rem;
      font-weight: 600;
    }
  `],
})
export class SharedCampaignPageComponent {
  protected readonly store = inject(SharedCampaignStore);

  constructor() {
    this.store.select(shareIdOf(inject(ActivatedRoute)));
  }
}
