import { Component, effect, inject, signal, input, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from './campaign-context.service';
import { CampaignService } from './campaign.service';
import { Campaign } from './campaign.models';

@Component({
  selector: 'app-campaign-selector',
  imports: [FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Expanded: pill bar with campaign name + icon buttons -->
    @if (!isCollapsed()) {
      <div class="flex items-center justify-center gap-2">

        <!-- Campaign pill -->
        <div class="relative flex-1 min-w-0 max-w-[50vw] md:max-w-80">
          <div class="pill">
            <!-- Settings cogwheel inside pill -->
            <button
              type="button"
              (click)="openManageCampaign(); $event.stopPropagation()"
              [disabled]="!selectedCampaign()"
              class="flex items-center justify-center w-9 h-9 flex-shrink-0 rounded-full text-gold-deep hover:bg-gold-soft transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="Campaign instellingen"
              aria-label="Campaign instellingen"
            >
              <lucide-icon name="settings" class="w-4 h-4" />
            </button>
            <!-- Campaign name + dropdown toggle -->
            <button
              type="button"
              (click)="toggleDropdown()"
              [attr.aria-expanded]="showDropdown()"
              class="flex items-center flex-1 min-w-0 pr-3 pl-1 py-2 hover:bg-paper-2 rounded-r-full transition-all"
            >
              <span class="flex-1 font-display text-sm font-bold tracking-wide text-ink truncate text-center">
                {{ selectedCampaign()?.name || 'Selecteer een campaign' }}
              </span>
              <lucide-icon
                name="chevron-down"
                class="w-4 h-4 text-gold flex-shrink-0 transition-transform duration-200"
                [style.transform]="showDropdown() ? 'rotate(180deg)' : 'rotate(0deg)'"
              />
            </button>
          </div>

          <!-- Backdrop -->
          @if (showDropdown()) {
            <div class="fixed inset-0 z-40" (click)="showDropdown.set(false)"></div>
          }

          <!-- Dropdown list -->
          @if (showDropdown()) {
            <div class="qm-menu absolute top-full mt-2 left-1/2 -translate-x-1/2 w-72 z-50">
              <div class="qm-eyebrow px-4 pt-3 pb-1.5">Campaigns</div>
              @for (campaign of campaigns(); track campaign.id) {
                <button
                  type="button"
                  (click)="onCampaignChange(campaign.id); showDropdown.set(false)"
                  class="qm-menu-item justify-between"
                  [class.is-active]="campaign.id === selectedId"
                >
                  <span class="truncate">{{ campaign.name }}</span>
                  @if (isCampaignOwner(campaign)) {
                    <span class="qm-badge qm-badge-quiet flex-shrink-0">Owner</span>
                  }
                </button>
              }
              @if (campaigns().length === 0) {
                <div class="px-4 py-3 text-sm qm-muted">Geen campaigns gevonden</div>
              }
              <button
                type="button"
                (click)="showCreateCampaign.set(true); showDropdown.set(false)"
                class="qm-menu-item border-t border-line font-semibold text-primary-dark"
              >
                <lucide-icon name="plus" class="w-4 h-4 flex-shrink-0" />
                <span>Nieuwe campaign</span>
              </button>
            </div>
          }
        </div>
      </div>

      @if (errorMessage()) {
        <div class="qm-alert mt-2 mx-auto max-w-80 !text-xs">{{ errorMessage() }}</div>
      }
    }

    <!-- Collapsed: icon button with dropdown (sidebar use) -->
    @if (isCollapsed()) {
      <div class="relative">
        <button
          type="button"
          (click)="toggleDropdown()"
          class="p-2 rounded-lg hover:bg-white/15 transition-colors w-full"
          [title]="selectedCampaign()?.name || 'Select campaign'"
        >
          <lucide-icon name="book-open" class="w-6 h-6 mx-auto" />
        </button>

        @if (showDropdown()) {
          <div class="fixed inset-0 z-40" (click)="showDropdown.set(false)"></div>
          <div class="qm-menu absolute left-full ml-2 top-0 w-64 z-50">
            <div class="qm-eyebrow px-4 pt-3 pb-1.5">Campaign</div>
            @for (campaign of campaigns(); track campaign.id) {
              <button
                type="button"
                (click)="onCampaignChange(campaign.id); showDropdown.set(false)"
                class="qm-menu-item justify-between"
                [class.is-active]="campaign.id === selectedId"
              >
                <span class="truncate">{{ campaign.name }}</span>
                @if (isCampaignOwner(campaign)) {
                  <span class="qm-badge qm-badge-quiet flex-shrink-0">Owner</span>
                }
              </button>
            }
            <div class="border-t border-line">
              <button
                type="button"
                (click)="showCreateCampaign.set(true); showDropdown.set(false)"
                class="qm-menu-item font-semibold text-primary-dark"
              >
                <lucide-icon name="plus" class="w-4 h-4" />
                <span>Nieuwe campaign</span>
              </button>
              @if (selectedCampaign()) {
                <button
                  type="button"
                  (click)="openManageCampaign(); showDropdown.set(false)"
                  class="qm-menu-item"
                >
                  <lucide-icon name="settings" class="w-4 h-4" />
                  <span>Instellingen</span>
                </button>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- Create campaign modal -->
    @if (showCreateCampaign()) {
      <div class="qm-scrim flex items-center justify-center p-4">
        <div class="qm-dialog" role="dialog" aria-modal="true" aria-labelledby="create-campaign-title">
          <div class="qm-eyebrow">Campaign</div>
          <h3 id="create-campaign-title" class="qm-display text-xl mb-4">Nieuwe campaign aanmaken</h3>
          <div class="space-y-4">
            <div>
              <label for="new-campaign-name" class="qm-label">Naam</label>
              <input
                id="new-campaign-name"
                type="text"
                [(ngModel)]="newCampaignName"
                class="qm-input"
                placeholder="Mijn D&D Campaign"
              />
            </div>
            <div>
              <label for="new-campaign-description" class="qm-label">Beschrijving (optioneel)</label>
              <textarea
                id="new-campaign-description"
                [(ngModel)]="newCampaignDescription"
                class="qm-input"
                rows="3"
                placeholder="Beschrijving van je campaign..."
              ></textarea>
            </div>
          </div>
          <div class="flex gap-2 mt-6">
            <button
              type="button"
              (click)="createCampaign()"
              [disabled]="!newCampaignName.trim().length"
              class="qm-btn qm-btn-primary flex-1"
            >
              Aanmaken
            </button>
            <button type="button" (click)="showCreateCampaign.set(false)" class="qm-btn flex-1">
              Annuleren
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* The campaign you are in, as a name plate. */
    .pill {
      display: flex;
      align-items: center;
      width: 100%;
      padding: 2px;
      border-radius: 999px;
      background: var(--paper);
      border: 1px solid #e5c77f;
      box-shadow: 0 10px 24px -14px rgba(24, 12, 60, 0.8);
    }
  `]
})
export class CampaignSelectorComponent {
  readonly isCollapsed = input<boolean>(false);

  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly campaignService = inject(CampaignService);
  private readonly campaignContext = inject(CampaignContextService);

  campaigns = this.campaignContext.campaigns;
  selectedCampaign = this.campaignContext.selectedCampaign;

  selectedId: string | null = null;
  showCreateCampaign = signal(false);
  showDropdown = signal(false);
  errorMessage = signal('');

  newCampaignName = '';
  newCampaignDescription = '';

  constructor() {
    effect(() => {
      this.selectedId = this.campaignContext.selectedCampaignId();
    });
  }

  async onCampaignChange(campaignId: string): Promise<void> {
    if (!campaignId) {
      return;
    }
    await this.campaignContext.selectCampaign(campaignId);
    await this.router.navigate(['/campaign', campaignId]);
  }

  async createCampaign(): Promise<void> {
    try {
      const campaignId = await this.campaignService.createCampaign(
        this.newCampaignName,
        this.newCampaignDescription
      );
      await this.campaignContext.refreshCampaigns();
      await this.router.navigate(['/campaign', campaignId]);
      this.showCreateCampaign.set(false);
      this.newCampaignName = '';
      this.newCampaignDescription = '';
    } catch (error: unknown) {
      this.errorMessage.set((error as Error)?.message || 'Failed to create campaign');
    }
  }

  async openManageCampaign(): Promise<void> {
    const campaignId = this.campaignContext.selectedCampaignId();
    if (campaignId) {
      await this.router.navigate(['/campaign', campaignId, 'settings']);
    }
  }

  toggleDropdown(): void {
    this.showDropdown.update(v => !v);
  }

  isCampaignOwner(campaign: Campaign): boolean {
    const userId = this.authService.currentUser()?.uid;
    return this.campaignService.isCampaignOwner(campaign, userId);
  }
}
