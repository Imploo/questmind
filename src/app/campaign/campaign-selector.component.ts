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
          <div
            class="flex items-center w-full bg-white rounded-full shadow-sm border border-gray-200 text-left"
          >
            <!-- Settings cogwheel inside pill -->
            <button
              (click)="openManageCampaign(); $event.stopPropagation()"
              [disabled]="!selectedCampaign()"
              class="flex items-center justify-center w-9 h-9 flex-shrink-0 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="Campaign instellingen"
            >
              <lucide-icon name="settings" class="w-4 h-4" />
            </button>
            <!-- Campaign name + dropdown toggle -->
            <button
              (click)="toggleDropdown()"
              class="flex items-center flex-1 min-w-0 pr-3 pl-1 py-2.5 hover:bg-gray-50 rounded-r-full transition-all"
            >
              <span class="flex-1 text-sm font-medium text-gray-800 truncate text-center">
                {{ selectedCampaign()?.name || 'Selecteer een campaign' }}
              </span>
              <lucide-icon
                name="chevron-down"
                class="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200"
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
            <div class="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-72 bg-white rounded-2xl shadow-xl z-50 border border-gray-100 overflow-hidden">
              @for (campaign of campaigns(); track campaign.id) {
                <button
                  (click)="onCampaignChange(campaign.id); showDropdown.set(false)"
                  class="w-full px-4 py-3 text-left text-sm transition-colors flex items-center justify-between gap-2 hover:bg-gray-50"
                  [class.bg-blue-50]="campaign.id === selectedId"
                  [class.text-blue-700]="campaign.id === selectedId"
                  [class.font-medium]="campaign.id === selectedId"
                >
                  <span class="truncate">{{ campaign.name }}</span>
                  @if (isCampaignOwner(campaign)) {
                    <span class="text-xs text-gray-400 flex-shrink-0">Owner</span>
                  }
                </button>
              }
              @if (campaigns().length === 0) {
                <div class="px-4 py-3 text-sm text-gray-400">Geen campaigns gevonden</div>
              }
              <button
                (click)="showCreateCampaign.set(true); showDropdown.set(false)"
                class="w-full px-4 py-3 text-left text-sm transition-colors flex items-center gap-2 hover:bg-gray-50 text-blue-600 border-t border-gray-100"
              >
                <lucide-icon name="plus" class="w-4 h-4 flex-shrink-0" />
                <span>Nieuwe campaign</span>
              </button>
            </div>
          }
        </div>
      </div>

      @if (errorMessage()) {
        <div class="text-xs text-red-600 mt-2 px-1">{{ errorMessage() }}</div>
      }
    }

    <!-- Collapsed: icon button with dropdown (sidebar use) -->
    @if (isCollapsed()) {
      <div class="relative">
        <button
          (click)="toggleDropdown()"
          class="p-2 rounded-lg hover:bg-gray-100 transition-colors w-full"
          [title]="selectedCampaign()?.name || 'Select campaign'"
        >
          <lucide-icon name="book-open" class="w-6 h-6 mx-auto" />
        </button>

        @if (showDropdown()) {
          <div class="fixed inset-0 z-40" (click)="showDropdown.set(false)"></div>
          <div class="absolute left-full ml-2 top-0 w-64 bg-white rounded-xl shadow-xl z-50 border border-gray-100 overflow-hidden">
            <div class="p-2">
              <p class="text-xs font-semibold text-gray-500 px-3 py-2">Campaign</p>
              @for (campaign of campaigns(); track campaign.id) {
                <button
                  (click)="onCampaignChange(campaign.id); showDropdown.set(false)"
                  class="w-full px-3 py-2.5 text-left text-sm rounded-lg transition-colors flex items-center justify-between gap-2 hover:bg-gray-50"
                  [class.bg-blue-50]="campaign.id === selectedId"
                  [class.text-blue-700]="campaign.id === selectedId"
                >
                  <span class="truncate">{{ campaign.name }}</span>
                  @if (isCampaignOwner(campaign)) {
                    <span class="text-xs text-gray-400 flex-shrink-0">Owner</span>
                  }
                </button>
              }
            </div>
            <div class="border-t border-gray-100 p-2">
              <button
                (click)="showCreateCampaign.set(true); showDropdown.set(false)"
                class="w-full px-3 py-2.5 text-left text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2"
              >
                <lucide-icon name="plus" class="w-4 h-4" />
                <span>Nieuwe campaign</span>
              </button>
              @if (selectedCampaign()) {
                <button
                  (click)="openManageCampaign(); showDropdown.set(false)"
                  class="w-full px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2"
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
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 class="text-xl font-bold mb-4">Nieuwe campaign aanmaken</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Naam</label>
              <input
                type="text"
                [(ngModel)]="newCampaignName"
                class="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Mijn D&D Campaign"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Beschrijving (optioneel)</label>
              <textarea
                [(ngModel)]="newCampaignDescription"
                class="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows="3"
                placeholder="Beschrijving van je campaign..."
              ></textarea>
            </div>
          </div>
          <div class="flex gap-2 mt-6">
            <button
              (click)="createCampaign()"
              [disabled]="!newCampaignName.trim().length"
              class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Aanmaken
            </button>
            <button
              (click)="showCreateCampaign.set(false)"
              class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
            >
              Annuleren
            </button>
          </div>
        </div>
      </div>
    }
  `
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
