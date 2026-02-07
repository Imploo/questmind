import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { User } from 'firebase/auth';
import { doc, onSnapshot, type Firestore } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { Campaign, UserProfile } from './campaign.models';
import { CampaignService } from './campaign.service';
import { UserProfileService } from './user-profile.service';
import { FirebaseService } from '../core/firebase.service';
import * as logger from '../shared/logger';

@Injectable({ providedIn: 'root' })
export class CampaignContextService {
  private readonly authService = inject(AuthService);
  private readonly campaignService = inject(CampaignService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly firebase = inject(FirebaseService);
  private readonly db: Firestore | null;
  private profileUnsubscribe?: () => void;
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
    this.db = this.firebase.firestore;

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
    this.profileUnsubscribe?.();

    if (!this.db) {
      console.error('Firestore not configured. Cannot listen to profile changes.');
      void this.loadForUser(user);
      return;
    }

    const userRef = doc(this.db, 'users', user.uid);
    this.profileUnsubscribe = onSnapshot(
      userRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          // Profile doesn't exist yet, create it
          await this.loadForUser(user);
          return;
        }

        const profile = snapshot.data() as UserProfile;
        await this.loadCampaignsFromProfile(user, profile);
      },
      (error) => {
        console.error('Failed to listen to user profile changes:', error);
        this.error.set(error?.message || 'Failed to load campaigns');
        this.isLoading.set(false);
      }
    );
  }

  private async loadForUser(user: User): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const profile = await this.userProfileService.ensureProfile(user);
      await this.loadCampaignsFromProfile(user, profile);
    } catch (error: any) {
      console.error('Failed to load campaigns:', error);
      this.error.set(error?.message || 'Failed to load campaigns');
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
    } catch (error: any) {
      console.error('Failed to load campaigns from profile:', error);
      this.error.set(error?.message || 'Failed to load campaigns');
    } finally {
      this.isLoading.set(false);
    }
  }

  private clear(): void {
    this.profileUnsubscribe?.();
    this.profileUnsubscribe = undefined;
    this.activeUserId = null;
    this.campaigns.set([]);
    this.selectedCampaignId.set(null);
    this.isLoading.set(false);
    this.error.set(null);
  }
}
