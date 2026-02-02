import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from './campaign-context.service';
import { CampaignService } from './campaign.service';
import { Campaign } from './campaign.models';

@Component({
  selector: 'app-campaign-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bg-white/90 backdrop-blur rounded-2xl p-4 shadow-lg">
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-3">
          <label class="text-sm font-semibold text-gray-700">Campaign</label>
          <select
            [(ngModel)]="selectedId"
            (ngModelChange)="onCampaignChange($event)"
            class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            @for (campaign of campaigns(); track campaign.id) {
              <option [value]="campaign.id">
                {{ campaign.name }}
                @if (isCampaignOwner(campaign)) { (Owner) }
              </option>
            }
          </select>
        </div>
        <div class="flex items-center gap-2">
          <button
            (click)="showCreateCampaign.set(true)"
            class="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Campaign
          </button>
          @if (selectedCampaign()) {
            <button
              (click)="openManageCampaign()"
              class="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              ⚙️ Manage
            </button>
          }
        </div>
      </div>

      @if (errorMessage()) {
        <div class="mt-3 text-sm text-red-600">{{ errorMessage() }}</div>
      }
    </div>

    @if (showCreateCampaign()) {
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 max-w-md w-full">
          <h3 class="text-xl font-bold mb-4">Create New Campaign</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
              <input
                type="text"
                [(ngModel)]="newCampaignName"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="My D&D Campaign"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
              <textarea
                [(ngModel)]="newCampaignDescription"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                rows="3"
                placeholder="Description of your campaign..."
              ></textarea>
            </div>
          </div>
          <div class="flex gap-2 mt-6">
            <button
              (click)="createCampaign()"
              [disabled]="!newCampaignName.trim().length"
              class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create
            </button>
            <button
              (click)="showCreateCampaign.set(false)"
              class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    }

    @if (showManageCampaign() && selectedCampaign()) {
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
          <h3 class="text-xl font-bold mb-4">Manage Campaign: {{ selectedCampaign()!.name }}</h3>

          <div class="mb-6 p-4 bg-gray-50 rounded-lg">
            <div class="text-sm text-gray-600 mb-1">Owner</div>
            <div class="font-medium">{{ selectedCampaign()!.ownerEmail }}</div>
          </div>

          <div class="mb-6">
            <h4 class="font-semibold mb-2">Settings</h4>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Kanka Campaign ID</label>
                <input
                  type="text"
                  [(ngModel)]="kankaCampaignId"
                  placeholder="e.g. 123456"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
                <p class="text-xs text-gray-500 mt-1">
                  Used for Kanka integration when generating stories.
                </p>
              </div>
              <label class="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  [(ngModel)]="allowMembersToCreateSessions"
                />
                Allow members to create sessions
              </label>
              <button
                (click)="saveCampaignSettings()"
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>

          <div class="mb-6">
            <h4 class="font-semibold mb-2">Members ({{ campaignMembers().length }})</h4>
            <div class="space-y-2">
              @for (member of campaignMembers(); track member.userId) {
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div class="font-medium">{{ member.email }}</div>
                    <div class="text-xs text-gray-500">{{ member.role }}</div>
                  </div>
                  @if (isCampaignOwner(selectedCampaign()!) && member.role !== 'owner') {
                    <button
                      (click)="removeMember(member.userId)"
                      class="px-3 py-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      Remove
                    </button>
                  }
                </div>
              }
            </div>
          </div>

          @if (isCampaignOwner(selectedCampaign()!)) {
            <div class="mb-6">
              <h4 class="font-semibold mb-2">Invite Member</h4>
              <div class="flex gap-2">
                <input
                  type="email"
                  [(ngModel)]="inviteEmail"
                  placeholder="user@example.com"
                  class="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
                />
                <button
                  (click)="inviteMember()"
                  [disabled]="!inviteEmail.trim().length"
                  class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Invite
                </button>
              </div>
              @if (inviteError()) {
                <div class="mt-2 text-sm text-red-600">{{ inviteError() }}</div>
              }
              @if (inviteSuccess()) {
                <div class="mt-2 text-sm text-green-600">{{ inviteSuccess() }}</div>
              }
            </div>
          }

          <div class="flex gap-2">
            <button
              (click)="showManageCampaign.set(false)"
              class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class CampaignSelectorComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly campaignService = inject(CampaignService);
  private readonly campaignContext = inject(CampaignContextService);

  campaigns = this.campaignContext.campaigns;
  selectedCampaign = this.campaignContext.selectedCampaign;

  selectedId: string | null = null;
  showCreateCampaign = signal(false);
  showManageCampaign = signal(false);
  errorMessage = signal('');

  newCampaignName = '';
  newCampaignDescription = '';

  campaignMembers = signal<Array<{ userId: string; role: string; email: string }>>([]);
  inviteEmail = '';
  inviteError = signal('');
  inviteSuccess = signal('');
  kankaCampaignId = '';
  allowMembersToCreateSessions = true;

  constructor() {
    effect(() => {
      this.selectedId = this.campaignContext.selectedCampaignId();
      const campaign = this.selectedCampaign();
      if (campaign) {
        this.kankaCampaignId = campaign.settings?.kankaCampaignId || '';
        this.allowMembersToCreateSessions = campaign.settings?.allowMembersToCreateSessions ?? true;
      }
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
    } catch (error: any) {
      this.errorMessage.set(error?.message || 'Failed to create campaign');
    }
  }

  async openManageCampaign(): Promise<void> {
    this.showManageCampaign.set(true);
    await this.loadMembers();
  }

  async inviteMember(): Promise<void> {
    this.inviteError.set('');
    this.inviteSuccess.set('');
    try {
      const campaignId = this.campaignContext.selectedCampaignId();
      if (!campaignId) return;
      await this.campaignService.inviteUserByEmail(campaignId, this.inviteEmail);
      this.inviteSuccess.set('User invited successfully!');
      this.inviteEmail = '';
      await this.loadMembers();
      void this.campaignContext.refreshCampaigns();
      setTimeout(() => this.inviteSuccess.set(''), 3000);
    } catch (error: any) {
      this.inviteError.set(error?.message || 'Failed to invite user');
    }
  }

  async removeMember(userId: string): Promise<void> {
    if (!confirm('Are you sure you want to remove this member?')) {
      return;
    }
    try {
      const campaignId = this.campaignContext.selectedCampaignId();
      if (!campaignId) return;
      await this.campaignService.removeMember(campaignId, userId);
      await this.loadMembers();
      void this.campaignContext.refreshCampaigns();
    } catch (error: any) {
      this.inviteError.set(error?.message || 'Failed to remove member');
    }
  }

  async saveCampaignSettings(): Promise<void> {
    try {
      const campaignId = this.campaignContext.selectedCampaignId();
      if (!campaignId) return;
      await this.campaignService.updateCampaign(campaignId, {
        settings: {
          ...(this.selectedCampaign()?.settings || {}),
          allowMembersToCreateSessions: this.allowMembersToCreateSessions,
          kankaCampaignId: this.kankaCampaignId.trim() || undefined
        }
      });
      await this.campaignContext.refreshCampaigns();
    } catch (error: any) {
      this.errorMessage.set(error?.message || 'Failed to save settings');
    }
  }

  isCampaignOwner(campaign: Campaign): boolean {
    const userId = this.authService.currentUser()?.uid;
    return this.campaignService.isCampaignOwner(campaign, userId);
  }

  private async loadMembers(): Promise<void> {
    const campaignId = this.campaignContext.selectedCampaignId();
    if (!campaignId) {
      this.campaignMembers.set([]);
      return;
    }
    const members = await this.campaignService.getCampaignMembers(campaignId);
    this.campaignMembers.set(members);
  }
}
