import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { User } from 'firebase/auth';
import { AuthService } from '../auth/auth.service';
import { Campaign } from './campaign.models';
import { CampaignService } from './campaign.service';
import { UserProfileService } from './user-profile.service';

@Injectable({ providedIn: 'root' })
export class CampaignContextService {
  private readonly authService = inject(AuthService);
  private readonly campaignService = inject(CampaignService);
  private readonly userProfileService = inject(UserProfileService);

  campaigns = signal<Campaign[]>([]);
  selectedCampaignId = signal<string | null>(null);
  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);

  selectedCampaign = computed(() => {
    const campaigns = this.campaigns();
    const id = this.selectedCampaignId();
    if (!id) return null;
    return campaigns.find(campaign => campaign.id === id) || null;
  });

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user?.uid) {
        void this.loadForUser(user);
      } else {
        this.clear();
      }
    });
  }

  async refreshCampaigns(): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) {
      this.clear();
      return;
    }
    await this.loadForUser(user);
  }

  async selectCampaign(campaignId: string | null): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) {
      return;
    }
    this.selectedCampaignId.set(campaignId);
    await this.userProfileService.setDefaultCampaign(user.uid, campaignId);
  }

  canCreateSessions(userId: string | null | undefined): boolean {
    const campaign = this.selectedCampaign();
    if (!campaign || !userId) return false;
    if (campaign.ownerId === userId) return true;
    return campaign.settings?.allowMembersToCreateSessions ?? true;
  }

  private async loadForUser(user: User): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const profile = await this.userProfileService.ensureProfile(user);
      let campaignIds = profile.campaigns || [];

      if (campaignIds.length === 0) {
        const campaignId = await this.campaignService.createCampaign(
          `${user.displayName || user.email || 'My'} Campaign`
        );
        campaignIds = [campaignId];
      }

      let campaigns = await this.campaignService.getCampaignsByIds(campaignIds);
      if (campaigns.length === 0) {
        const campaignId = await this.campaignService.createCampaign(
          `${user.displayName || user.email || 'My'} Campaign`
        );
        campaignIds = [campaignId];
        campaigns = await this.campaignService.getCampaignsByIds(campaignIds);
      }
      this.campaigns.set(campaigns);

      let selectedId = profile.defaultCampaignId || null;
      if (selectedId && !campaigns.some(campaign => campaign.id === selectedId)) {
        selectedId = campaigns[0]?.id ?? null;
      }
      if (!selectedId && campaigns.length > 0) {
        selectedId = campaigns[0].id;
      }

      this.selectedCampaignId.set(selectedId);
      if (selectedId && selectedId !== profile.defaultCampaignId) {
        await this.userProfileService.setDefaultCampaign(user.uid, selectedId);
      }
    } catch (error: any) {
      console.error('Failed to load campaigns:', error);
      this.error.set(error?.message || 'Failed to load campaigns');
    } finally {
      this.isLoading.set(false);
    }
  }

  private clear(): void {
    this.campaigns.set([]);
    this.selectedCampaignId.set(null);
    this.isLoading.set(false);
    this.error.set(null);
  }
}
