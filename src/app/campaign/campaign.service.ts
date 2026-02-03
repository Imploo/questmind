import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { Campaign, CampaignMember, CampaignRole, CampaignSettings } from './campaign.models';
import { UserProfileService } from './user-profile.service';
import { FirebaseService } from '../core/firebase.service';

@Injectable({ providedIn: 'root' })
export class CampaignService {
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly firebase = inject(FirebaseService);
  private readonly db: Firestore | null;

  constructor() {
    this.db = this.firebase.firestore;
  }

  async createCampaign(name: string, description?: string): Promise<string> {
    const user = this.authService.currentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    if (!this.db) {
      throw new Error('Firestore is not configured');
    }

    const campaignId = doc(collection(this.db, 'campaigns')).id;
    const now = new Date().toISOString();
    const ownerEmail = (user.email || '').toLowerCase();
    const campaign: Campaign = {
      id: campaignId,
      name: name.trim(),
      ...(description?.trim()
        ? { description: description.trim() }
        : {}),
      createdAt: now,
      updatedAt: now,
      ownerId: user.uid,
      ownerEmail,
      members: {
        [user.uid]: {
          role: 'owner',
          email: ownerEmail,
          joinedAt: now
        }
      },
      settings: {
        allowMembersToCreateSessions: true
      }
    };

    const campaignRef = doc(this.db, 'campaigns', campaignId);
    await setDoc(campaignRef, campaign);
    await this.userProfileService.addCampaign(user.uid, campaignId);
    await this.userProfileService.setDefaultCampaign(user.uid, campaignId);

    return campaignId;
  }

  async getCampaign(campaignId: string): Promise<Campaign | null> {
    if (!this.db) {
      return null;
    }
    const campaignRef = doc(this.db, 'campaigns', campaignId);
    const snapshot = await getDoc(campaignRef);
    return snapshot.exists() ? (snapshot.data() as Campaign) : null;
  }

  async getCampaignsByIds(campaignIds: string[]): Promise<Campaign[]> {
    if (!this.db || campaignIds.length === 0) {
      return [];
    }
    const campaigns = await Promise.all(
      campaignIds.map(async id => {
        const campaign = await this.getCampaign(id);
        return campaign;
      })
    );
    return campaigns.filter(Boolean) as Campaign[];
  }

  async updateCampaign(
    campaignId: string,
    updates: Partial<Pick<Campaign, 'name' | 'description' | 'settings'>>
  ): Promise<void> {
    if (!this.db) return;
    const campaignRef = doc(this.db, 'campaigns', campaignId);
    await updateDoc(campaignRef, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
  }

  async updateCampaignSettings(campaignId: string, settings: CampaignSettings): Promise<void> {
    await this.updateCampaign(campaignId, { settings });
  }

  async inviteUserByEmail(campaignId: string, email: string): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    if (!this.db) {
      throw new Error('Firestore is not configured');
    }
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    if (campaign.ownerId !== user.uid) {
      throw new Error('Only campaign owner can invite users');
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log('Attempting to invite user with email:', normalizedEmail);

    let targetUser;
    try {
      targetUser = await this.findUserByEmail(normalizedEmail);
      if (!targetUser) {
        throw new Error(`No user found with email: ${normalizedEmail}. The user must create an account first.`);
      }
      console.log('Target user found:', targetUser);
    } catch (error: any) {
      console.error('Error during user lookup:', error);
      throw error;
    }

    if (campaign.members?.[targetUser.uid]) {
      throw new Error('User is already a member of this campaign');
    }

    const now = new Date().toISOString();
    const campaignRef = doc(this.db, 'campaigns', campaignId);
    await updateDoc(campaignRef, {
      [`members.${targetUser.uid}`]: {
        role: 'member',
        email: targetUser.email,
        joinedAt: now
      },
      updatedAt: now
    });
    await this.userProfileService.addCampaign(targetUser.uid, campaignId);
  }

  async removeMember(campaignId: string, memberId: string): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    if (!this.db) {
      throw new Error('Firestore is not configured');
    }

    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    if (memberId === campaign.ownerId) {
      throw new Error('Cannot remove campaign owner');
    }
    if (campaign.ownerId !== user.uid && memberId !== user.uid) {
      throw new Error('Only campaign owner can remove members');
    }

    const nextMembers = { ...campaign.members };
    delete nextMembers[memberId];
    const campaignRef = doc(this.db, 'campaigns', campaignId);
    await updateDoc(campaignRef, {
      members: nextMembers,
      updatedAt: new Date().toISOString()
    });
    await this.userProfileService.removeCampaign(memberId, campaignId);
  }

  async getCampaignMembers(campaignId: string): Promise<Array<CampaignMember & { userId: string }>> {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return [];
    }
    return Object.entries(campaign.members || {}).map(([userId, data]) => ({
      userId,
      ...data
    }));
  }

  isCampaignOwner(campaign: Campaign, userId: string | null | undefined): boolean {
    if (!userId) return false;
    return campaign.ownerId === userId;
  }

  getUserRole(campaign: Campaign, userId: string | null | undefined): CampaignRole | null {
    if (!userId) return null;
    return campaign.members?.[userId]?.role || null;
  }

  isSessionOwner(session: { ownerId?: string }, userId: string | null | undefined): boolean {
    if (!userId) return false;
    return session.ownerId === userId;
  }

  private async findUserByEmail(email: string): Promise<{ uid: string; email: string } | null> {
    if (!this.db) {
      console.error('Firestore DB is not initialized');
      return null;
    }
    const normalizedEmail = email.trim().toLowerCase();
    console.log('Searching for user with email:', normalizedEmail);

    try {
      const usersRef = collection(this.db, 'users');
      const q = query(usersRef, where('email', '==', normalizedEmail));
      const snapshot = await getDocs(q);

      console.log('Query returned', snapshot.size, 'results');

      if (snapshot.empty) {
        console.warn('No user found with email:', normalizedEmail);
        return null;
      }

      const docSnap = snapshot.docs[0];
      const userData = {
        uid: docSnap.id,
        email: docSnap.data()['email']
      };
      console.log('Found user:', userData);
      return userData;
    } catch (error) {
      console.error('Error searching for user by email:', error);
      throw error;
    }
  }
}
