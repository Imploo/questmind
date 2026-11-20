import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from './campaign-context.service';
import { CampaignService } from './campaign.service';
import { CampaignSummary, CampaignSummaryService } from './campaign-summary.service';
import { Campaign } from './campaign.models';
import { CampaignError, campaignErrorMessage } from './campaign-error';
import { FormattingService } from '../shared/formatting.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import * as logger from '../shared/logger';

/** The campaigns you are in, as cards, and the way to start a new one. */
@Component({
  selector: 'app-campaign-list-page',
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-5xl mx-auto space-y-6">
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="qm-page-title">{{ 'campaign.list.title' | translate }}</h1>
          <p class="qm-page-sub mt-1">{{ 'campaign.list.intro' | translate }}</p>
        </div>
        <button type="button" class="qm-btn qm-btn-lg" (click)="openCreate()">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-width="2" d="M12 5v14M5 12h14" />
          </svg>
          {{ 'campaign.list.newCampaign' | translate }}
        </button>
      </header>

      @if (errorMessage()) {
        <div class="qm-alert" role="alert">{{ errorMessage() }}</div>
      }

      @if (isLoading()) {
        <div class="text-center py-12" role="status" [attr.aria-label]="'campaign.list.loading' | translate">
          <span class="qm-spinner qm-spinner-lg qm-spinner-light"></span>
        </div>
      } @else if (campaigns().length === 0) {
        <div class="qm-panel qm-hero qm-empty">
          <p class="qm-empty-text">{{ 'campaign.list.empty' | translate }}</p>
        </div>
      } @else {
        <ul class="grid gap-5 sm:grid-cols-2" role="list">
          @for (campaign of campaigns(); track campaign.id) {
            <li>
              <a
                [routerLink]="['/campaign', campaign.id]"
                class="campaign-card qm-panel sm:!p-6 flex h-full flex-col gap-4"
                data-testid="campaign-card"
              >
                <div class="flex items-start gap-3.5">
                  <span class="qm-medallion text-xl" aria-hidden="true">{{ initial(campaign) }}</span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h2 class="qm-display text-xl leading-tight break-words">{{ campaign.name }}</h2>
                      <span class="qm-badge qm-badge-quiet">
                        {{ (isOwner(campaign) ? 'campaign.roles.owner' : 'campaign.roles.member') | translate }}
                      </span>
                    </div>
                    @if (campaign.description) {
                      <p class="font-prose text-lg leading-snug text-gray-700 mt-1">{{ campaign.description }}</p>
                    }
                  </div>
                </div>

                <p class="flex flex-wrap gap-x-5 gap-y-1 text-sm qm-muted">
                  @if (summaryOf(campaign); as summary) {
                    <span>{{ 'campaign.page.sessions' | translate: summary.sessionCount }}</span>
                  }
                  <span>{{ 'campaign.page.players' | translate: memberCount(campaign) }}</span>
                  @if (summaryOf(campaign)?.lastPlayed; as lastPlayed) {
                    <span>{{ 'campaign.page.lastPlayed' | translate: formatting.formatDay(lastPlayed) }}</span>
                  }
                </p>

                <div class="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-line pt-3.5">
                  @if (summaryOf(campaign)?.processingCount; as processing) {
                    <span class="qm-badge qm-badge-info">
                      <span class="qm-dot qm-dot-busy !h-1.5 !w-1.5 !shadow-none"></span>
                      {{ 'campaign.list.processing' | translate: processing }}
                    </span>
                  } @else {
                    <span></span>
                  }
                  <span class="inline-flex items-center gap-1 text-sm font-semibold text-primary-dark">
                    {{ 'campaign.list.open' | translate }}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                </div>
              </a>
            </li>
          }
        </ul>
      }
    </div>

    @if (showCreate()) {
      <div class="qm-scrim flex items-center justify-center p-4">
        <form
          class="qm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-campaign-title"
          (ngSubmit)="createCampaign()"
        >
          <div class="qm-eyebrow">{{ 'campaign.list.createLabel' | translate }}</div>
          <h3 id="create-campaign-title" class="qm-display text-xl mb-4">{{ 'campaign.list.createTitle' | translate }}</h3>
          <div class="space-y-4">
            <div>
              <label for="new-campaign-name" class="qm-label">{{ 'common.name' | translate }}</label>
              <input
                id="new-campaign-name"
                name="name"
                type="text"
                [(ngModel)]="newCampaignName"
                class="qm-input"
                [placeholder]="'campaign.list.namePlaceholder' | translate"
              />
            </div>
            <div>
              <label for="new-campaign-description" class="qm-label">{{ 'campaign.list.descriptionLabel' | translate }}</label>
              <textarea
                id="new-campaign-description"
                name="description"
                [(ngModel)]="newCampaignDescription"
                class="qm-input"
                rows="3"
                [placeholder]="'campaign.list.descriptionPlaceholder' | translate"
              ></textarea>
            </div>
          </div>
          <div class="flex gap-2 mt-6">
            <button type="submit" [disabled]="!newCampaignName.trim().length || creating()" class="qm-btn qm-btn-primary flex-1">
              {{ 'common.create' | translate }}
            </button>
            <button type="button" (click)="showCreate.set(false)" class="qm-btn flex-1">
              {{ 'common.cancel' | translate }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [`
    .campaign-card {
      color: inherit;
      text-decoration: none;
      transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
    }
    .campaign-card:hover {
      border-color: var(--gold);
      transform: translateY(-2px);
    }
  `],
})
export class CampaignListPageComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly campaignService = inject(CampaignService);
  private readonly campaignContext = inject(CampaignContextService);
  private readonly summaries = inject(CampaignSummaryService);
  private readonly i18n = inject(I18nService);
  protected readonly formatting = inject(FormattingService);

  readonly campaigns = this.campaignContext.campaigns;
  readonly isLoading = computed(() => this.campaignContext.isLoading() && this.campaigns().length === 0);

  readonly showCreate = signal(false);
  readonly creating = signal(false);
  readonly errorMessage = signal('');
  newCampaignName = '';
  newCampaignDescription = '';

  /** The counts per campaign; a campaign whose counts could not be read just shows fewer facts. */
  private readonly summaryMap = resource({
    params: () => ({ ids: this.campaigns().map(campaign => campaign.id) }),
    loader: async ({ params }) => {
      const entries = await Promise.all(
        params.ids.map(async id => {
          try {
            return [id, await this.summaries.summary(id)] as const;
          } catch (error) {
            logger.warn(`[CampaignList] Could not count the sessions of campaign ${id}:`, error);
            return [id, null] as const;
          }
        })
      );
      return new Map<string, CampaignSummary | null>(entries);
    },
  });

  summaryOf(campaign: Campaign): CampaignSummary | null {
    return this.summaryMap.value()?.get(campaign.id) ?? null;
  }

  isOwner(campaign: Campaign): boolean {
    return this.campaignService.isCampaignOwner(campaign, this.authService.currentUser()?.uid);
  }

  memberCount(campaign: Campaign): number {
    return Object.keys(campaign.members ?? {}).length;
  }

  initial(campaign: Campaign): string {
    return campaign.name.trim().charAt(0).toUpperCase() || '?';
  }

  openCreate(): void {
    this.errorMessage.set('');
    this.showCreate.set(true);
  }

  async createCampaign(): Promise<void> {
    if (!this.newCampaignName.trim() || this.creating()) return;
    this.creating.set(true);
    try {
      const campaignId = await this.campaignService.createCampaign(this.newCampaignName, this.newCampaignDescription);
      await this.campaignContext.refreshCampaigns();
      this.showCreate.set(false);
      this.newCampaignName = '';
      this.newCampaignDescription = '';
      await this.router.navigate(['/campaign', campaignId]);
    } catch (error: unknown) {
      if (!(error instanceof CampaignError)) logger.error('[CampaignList] Creating a campaign failed:', error);
      const texts = this.i18n.t();
      this.showCreate.set(false);
      this.errorMessage.set(campaignErrorMessage(error, texts.errors, texts.campaign.errors.createFailed));
    } finally {
      this.creating.set(false);
    }
  }
}
