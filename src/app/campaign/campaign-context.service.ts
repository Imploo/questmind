import { Injectable, computed, effect, inject, signal, Injector, runInInjectionContext } from '@angular/core';
import type { User } from 'firebase/auth';
import { AuthService } from '../auth/auth.service';
import { Campaign, UserProfile } from './campaign.models';
import { CampaignService } from './campaign.service';
import { UserProfileService } from './user-profile.service';
import { UserProfileRepository } from '../shared/repository/user-profile.repository';
import * as logger from '../shared/logger';

@Injectable({ providedIn: 'root' })
export class CampaignContextService {
  private readonly authService = inject(AuthService);
  private readonly campaignService = inject(CampaignService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly injector = inject(Injector);
  private profileRepo: UserProfileRepository | null = null;
  private activeUserId: string | null = null;

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
        this.setupProfileListener(user);
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

  private setupProfileListener(user: User): void {
    if (!user?.uid) {
      return;
    }

    // Don't re-setup if same user
    if (this.activeUserId === user.uid) {
      return;
    }

    this.activeUserId = user.uid;
    this.cleanupProfileRepo();

    runInInjectionContext(this.injector, () => {
      this.profileRepo = new UserProfileRepository(user.uid);

      const profileSignal = this.profileRepo.get;
      effect(() => {
        const profile = profileSignal() as UserProfile | null;
        if (!profile) {
          // Profile doesn't exist yet, create it
          void this.loadForUser(user);
          return;
        }
        void this.loadCampaignsFromProfile(user, profile);
      });
    });
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

  private cleanupProfileRepo(): void {
    this.profileRepo?.destroy();
    this.profileRepo = null;
  }

  private clear(): void {
    this.cleanupProfileRepo();
    this.activeUserId = null;
    this.campaigns.set([]);
    this.selectedCampaignId.set(null);
    this.isLoading.set(false);
    this.error.set(null);
  }
}
