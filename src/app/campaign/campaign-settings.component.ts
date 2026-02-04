import { Component, effect, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from './campaign-context.service';
import { CampaignService } from './campaign.service';
import { Campaign } from './campaign.models';

@Component({
  selector: 'app-campaign-settings',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-4xl mx-auto">
      @if (selectedCampaign()) {
        <div class="bg-white rounded-lg shadow-lg p-6">
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-2xl font-bold text-gray-900">Campaign Settings</h2>
            <button
              (click)="goBack()"
              class="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Back
            </button>
          </div>

          <!-- Campaign Name -->
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ selectedCampaign()!.name }}</h3>
            @if (selectedCampaign()!.description) {
              <p class="text-gray-600">{{ selectedCampaign()!.description }}</p>
            }
          </div>

          <!-- Owner Information -->
          <div class="mb-6 p-4 bg-gray-50 rounded-lg">
            <div class="text-sm text-gray-600 mb-1">Campaign Owner</div>
            <div class="font-medium text-gray-900">{{ selectedCampaign()!.ownerEmail }}</div>
          </div>

          <!-- Settings Section -->
          <div class="mb-6 border-t pt-6">
            <h4 class="text-lg font-semibold text-gray-900 mb-4">General Settings</h4>
            <div class="space-y-4">
              <!-- Kanka Integration -->
              <div class="bg-gray-50 p-4 rounded-lg">
                <label class="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    [(ngModel)]="kankaEnabled"
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Enable Kanka Integration
                </label>
                @if (kankaEnabled) {
                  <div class="mt-3 ml-6">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Kanka Campaign ID</label>
                    <input
                      type="text"
                      [(ngModel)]="kankaCampaignId"
                      placeholder="e.g. 123456"
                      class="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p class="text-xs text-gray-500 mt-1">
                      Used for Kanka integration when generating stories.
                    </p>
                  </div>
                }
              </div>

              <!-- Member Permissions -->
              <div class="bg-gray-50 p-4 rounded-lg">
                <label class="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    [(ngModel)]="allowMembersToCreateSessions"
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Allow members to create sessions
                </label>
              </div>

              <!-- Save Button -->
              <div class="flex gap-2">
                <button
                  (click)="saveCampaignSettings()"
                  [disabled]="isSaving()"
                  class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {{ isSaving() ? 'Saving...' : 'Save Settings' }}
                </button>
                @if (saveSuccess()) {
                  <div class="flex items-center text-sm text-green-600">
                    Settings saved successfully!
                  </div>
                }
                @if (saveError()) {
                  <div class="flex items-center text-sm text-red-600">
                    {{ saveError() }}
                  </div>
                }
              </div>
            </div>
          </div>

          <!-- Members Section -->
          <div class="mb-6 border-t pt-6">
            <h4 class="text-lg font-semibold text-gray-900 mb-4">Members ({{ campaignMembers().length }})</h4>
            <div class="space-y-2">
              @for (member of campaignMembers(); track member.userId) {
                <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <div class="font-medium text-gray-900">{{ member.email }}</div>
                    <div class="text-sm text-gray-500 capitalize">{{ member.role }}</div>
                  </div>
                  @if (isCampaignOwner(selectedCampaign()!) && member.role !== 'owner') {
                    <button
                      (click)="removeMember(member.userId)"
                      class="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      Remove
                    </button>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Invite Member Section -->
          @if (isCampaignOwner(selectedCampaign()!)) {
            <div class="border-t pt-6">
              <h4 class="text-lg font-semibold text-gray-900 mb-4">Invite Member</h4>
              <div class="flex gap-2">
                <input
                  type="email"
                  [(ngModel)]="inviteEmail"
                  placeholder="user@example.com"
                  class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  (click)="inviteMember()"
                  [disabled]="!inviteEmail.trim().length || isInviting()"
                  class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {{ isInviting() ? 'Inviting...' : 'Invite' }}
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
        </div>
      } @else {
        <div class="bg-white rounded-lg shadow-lg p-6">
          <div class="text-center text-gray-600">
            No campaign selected
          </div>
        </div>
      }
    </div>
  `
})
export class CampaignSettingsComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly campaignService = inject(CampaignService);
  private readonly campaignContext = inject(CampaignContextService);

  selectedCampaign = this.campaignContext.selectedCampaign;
  campaignMembers = signal<Array<{ userId: string; role: string; email: string }>>([]);
  
  inviteEmail = '';
  inviteError = signal('');
  inviteSuccess = signal('');
  isInviting = signal(false);
  
  kankaEnabled = false;
  kankaCampaignId = '';
  allowMembersToCreateSessions = true;
  
  isSaving = signal(false);
  saveSuccess = signal(false);
  saveError = signal('');

  constructor() {
    effect(() => {
      const campaign = this.selectedCampaign();
      if (campaign) {
        this.kankaEnabled = campaign.settings?.kankaEnabled ?? false;
        this.kankaCampaignId = campaign.settings?.kankaCampaignId || '';
        this.allowMembersToCreateSessions = campaign.settings?.allowMembersToCreateSessions ?? true;
        void this.loadMembers();
      }
    });
  }

  goBack(): void {
    const campaignId = this.campaignContext.selectedCampaignId();
    if (campaignId) {
      void this.router.navigate(['/campaign', campaignId]);
    } else {
      void this.router.navigate(['/']);
    }
  }

  async saveCampaignSettings(): Promise<void> {
    this.isSaving.set(true);
    this.saveSuccess.set(false);
    this.saveError.set('');
    
    try {
      const campaignId = this.campaignContext.selectedCampaignId();
      if (!campaignId) return;
      
      await this.campaignService.updateCampaign(campaignId, {
        settings: {
          ...(this.selectedCampaign()?.settings || {}),
          allowMembersToCreateSessions: this.allowMembersToCreateSessions,
          kankaEnabled: this.kankaEnabled,
          kankaCampaignId: this.kankaCampaignId.trim() || undefined
        }
      });
      
      await this.campaignContext.refreshCampaigns();
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(false), 3000);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save settings';
      this.saveError.set(errorMessage);
      setTimeout(() => this.saveError.set(''), 5000);
    } finally {
      this.isSaving.set(false);
    }
  }

  async inviteMember(): Promise<void> {
    this.inviteError.set('');
    this.inviteSuccess.set('');
    this.isInviting.set(true);
    
    try {
      const campaignId = this.campaignContext.selectedCampaignId();
      if (!campaignId) return;
      
      await this.campaignService.inviteUserByEmail(campaignId, this.inviteEmail);
      this.inviteSuccess.set('User invited successfully!');
      this.inviteEmail = '';
      await this.loadMembers();
      void this.campaignContext.refreshCampaigns();
      setTimeout(() => this.inviteSuccess.set(''), 3000);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to invite user';
      this.inviteError.set(errorMessage);
    } finally {
      this.isInviting.set(false);
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove member';
      this.inviteError.set(errorMessage);
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
