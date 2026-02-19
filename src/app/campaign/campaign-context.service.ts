import { Injectable, computed, effect, inject, resource, signal, untracked } from '@angular/core';
import type { User } from 'firebase/auth';
import { AuthService } from '../auth/auth.service';
import { Campaign, UserProfile } from './campaign.models';
import { CampaignService } from './campaign.service';
import { UserProfileService } from './user-profile.service';
import { UserProfileRepositoryFactory } from '../shared/repository/user-profile.repository';
import * as logger from '../shared/logger';

@Injectable({ providedIn: 'root' })
export class CampaignContextService {
  private readonly authService = inject(AuthService);
  private readonly campaignService = inject(CampaignService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly profileRepoFactory = inject(UserProfileRepositoryFactory);

  private readonly profileResource = resource({
    params: () => {
      const user = this.authService.currentUser();
      if (!user?.uid) return undefined;
      return { userId: user.uid };
    },
    loader: async ({ params }) => {
      const repo = this.profileRepoFactory.create(params.userId);
      await repo.waitForData();
      return repo;
    },
  });

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
    // Cleanup repo on resource change
    effect((onCleanup) => {
      const repo = this.profileResource.value();
      if (repo) {
        onCleanup(() => repo.destroy());
      }
    });

    // Clear state when user logs out
    effect(() => {
      const user = this.authService.currentUser();
      if (!user) {
        untracked(() => {
          this.campaigns.set([]);
          this.selectedCampaignId.set(null);
          this.isLoading.set(false);
          this.error.set(null);
        });
      }
    });

    // React to profile data changes and load campaigns
    effect(() => {
      const repo = this.profileResource.value();
      if (!repo) return;

      const profile = repo.get() as UserProfile | null;
      const user = untracked(() => this.authService.currentUser());
      if (!user) return;

      if (!profile) {
        void this.loadForUser(user);
        return;
      }
      void this.loadCampaignsFromProfile(user, profile);
    });
  }

  async refreshCampaigns(): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) {
      this.campaigns.set([]);
      this.selectedCampaignId.set(null);
      this.isLoading.set(false);
      this.error.set(null);
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
      await this.loadCampaignsFromProfile(user, profile);
    } catch (error: unknown) {
      console.error('Failed to load campaigns:', error);
      this.error.set((error as Error)?.message || 'Failed to load campaigns');
      this.isLoading.set(false);
    }
  }

  private async loadCampaignsFromProfile(user: User, profile: UserProfile): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
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

      if (campaigns.length < campaignIds.length) {
        logger.warn(`[CampaignContext] Some campaigns could not be loaded. Expected: ${campaignIds.length}, Got: ${campaigns.length}`);
        logger.warn('[CampaignContext] Missing campaign IDs:',
          campaignIds.filter(id => !campaigns.some(c => c.id === id))
        );
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
    } catch (error: unknown) {
      console.error('Failed to load campaigns from profile:', error);
      this.error.set((error as Error)?.message || 'Failed to load campaigns');
    } finally {
      this.isLoading.set(false);
    }
  }
}
