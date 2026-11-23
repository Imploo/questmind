import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SharedCampaignStore } from './shared-campaign.store';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** What a shared campaign page shows while there is no campaign: loading, not found, or failed. */
@Component({
  selector: 'app-shared-campaign-status',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (store.isLoading()) {
      <div class="text-center py-12" role="status">
        <span class="qm-spinner qm-spinner-lg qm-spinner-light"></span>
        <p class="mt-4 text-white/90">{{ 'campaign.sharePage.loading' | translate }}</p>
      </div>
    } @else if (store.failed()) {
      <div class="qm-alert" role="alert">{{ 'campaign.sharePage.loadFailed' | translate }}</div>
    } @else {
      <div class="qm-panel qm-hero qm-empty" data-testid="share-not-found">
        <span class="qm-medallion qm-medallion-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></span>
        <h1 class="qm-empty-title">{{ 'campaign.sharePage.notFoundTitle' | translate }}</h1>
        <p class="qm-empty-text">{{ 'campaign.sharePage.notFoundText' | translate }}</p>
      </div>
    }
  `,
})
export class SharedCampaignStatusComponent {
  protected readonly store = inject(SharedCampaignStore);
}
