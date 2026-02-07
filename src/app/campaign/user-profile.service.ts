import { Injectable } from '@angular/core';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type Firestore
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { UserProfile } from './campaign.models';
import { FirebaseService } from '../core/firebase.service';

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly db: Firestore | null;

  constructor(private readonly firebase: FirebaseService) {
    this.db = this.firebase.firestore;
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    if (!this.db) {
      return null;
    }
    const userRef = doc(this.db, 'users', userId);
    const snapshot = await getDoc(userRef);
    return snapshot.exists() ? (snapshot.data() as UserProfile) : null;
  }

  async ensureProfile(user: User): Promise<UserProfile> {
    if (!this.db) {
      throw new Error('Firestore is not configured. Cannot ensure user profile.');
    }

    const userRef = doc(this.db, 'users', user.uid);
    const snapshot = await getDoc(userRef);
    if (snapshot.exists()) {
      const existing = snapshot.data() as UserProfile;
      const normalizedEmail = (user.email || '').toLowerCase();
      const updates: Partial<UserProfile> = {};
      if (normalizedEmail && existing.email !== normalizedEmail) {
        updates.email = normalizedEmail;
      }
      if (!Array.isArray(existing.campaigns)) {
        updates.campaigns = [];
      }
      if (Object.keys(updates).length > 0) {
        await updateDoc(userRef, {
          ...updates,
          updatedAt: new Date()
        });
        return { ...existing, ...updates };
      }
      return existing;
    }

    const now = new Date();
    const email = (user.email || '').toLowerCase();
    const profile: UserProfile = {
      uid: user.uid,
      email,
      displayName: user.displayName || undefined,
      photoURL: user.photoURL || undefined,
      campaigns: [],
      createdAt: now,
      updatedAt: now
    };

    await setDoc(userRef, profile, { merge: true });
    return profile;
  }

  async addCampaign(userId: string, campaignId: string): Promise<void> {
    if (!this.db) return;
    const userRef = doc(this.db, 'users', userId);
    const snapshot = await getDoc(userRef);
    if (!snapshot.exists()) {
      await setDoc(userRef, {
        uid: userId,
        campaigns: [campaignId],
        updatedAt: new Date()
      }, { merge: true });
      return;
    }
    const data = snapshot.data() as UserProfile;
    const campaigns = data.campaigns ?? [];
    if (campaigns.includes(campaignId)) {
      return;
    }
    await updateDoc(userRef, {
      campaigns: [...campaigns, campaignId],
      updatedAt: new Date()
    });
  }

  async removeCampaign(userId: string, campaignId: string): Promise<void> {
    if (!this.db) return;
    const userRef = doc(this.db, 'users', userId);
    const snapshot = await getDoc(userRef);
    if (!snapshot.exists()) return;
    const data = snapshot.data() as UserProfile;
    const campaigns = (data.campaigns ?? []).filter(id => id !== campaignId);
    await updateDoc(userRef, {
      campaigns,
      updatedAt: new Date()
    });
  }

  async setDefaultCampaign(userId: string, campaignId: string | null): Promise<void> {
    if (!this.db) return;
    const userRef = doc(this.db, 'users', userId);
    await updateDoc(userRef, {
      defaultCampaignId: campaignId,
      updatedAt: new Date()
    });
  }
}
