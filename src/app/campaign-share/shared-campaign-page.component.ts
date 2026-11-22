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
        />

        <app-campaign-tabs [base]="store.base()" [sessionCount]="campaign.sessionCount" />

        <router-outlet />
      } @else {
        <app-shared-campaign-status />
      }
    </div>
  `,
})
export class SharedCampaignPageComponent {
  protected readonly store = inject(SharedCampaignStore);

  constructor() {
    this.store.select(shareIdOf(inject(ActivatedRoute)));
  }
}
