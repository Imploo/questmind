import { Injectable, computed, effect, inject, resource } from '@angular/core';
import type { User } from 'firebase/auth';
import { AuthService } from '../auth/auth.service';
import type { UserProfile } from './models/user.model';
import { UserProfileRepositoryFactory } from '../shared/repository/user-profile.repository';

type ProfileRecord = UserProfile & Record<string, unknown>;

/** Display name for a profile: the auth display name, or the part of the e-mail address before the `@`. */
export function profileDisplayName(user: Pick<User, 'displayName' | 'email'>): string | null {
  const fromAuth = user.displayName?.trim();
  if (fromAuth) return fromAuth;
  const localPart = (user.email ?? '').split('@')[0]?.trim();
  return localPart || null;
}

/**
 * The signed-in user's profile (`users/{uid}`): a live view of the stored
 * document plus the writes on user profiles (creation, campaign membership,
 * default campaign).
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly authService = inject(AuthService);
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

  /** The stored profile document: undefined while loading or signed out, null when it does not exist. */
  readonly storedProfile = computed<UserProfile | null | undefined>(() => {
    const repo = this.profileResource.value();
    return repo ? (repo.get() as UserProfile | null) : undefined;
  });

  /** The profile, with a basic profile from the auth user while the document does not exist yet. */
  readonly profile = computed<UserProfile | null>(() => {
    const stored = this.storedProfile();
    if (stored === undefined) return null;
    if (stored) return stored;
    const user = this.authService.currentUser();
    if (user) {
      return {
        uid: user.uid,
        email: user.email ?? null,
        displayName: profileDisplayName(user),
        admin: false
      };
    }
    return null;
  });

  readonly isAdmin = computed(() => this.profile()?.admin === true);
  readonly isLoading = this.profileResource.isLoading;

  constructor() {
    effect((onCleanup) => {
      const repo = this.profileResource.value();
      if (repo) {
        onCleanup(() => repo.destroy());
      }
    });
  }

  /**
   * Make sure the user has a profile document and return it. Works for every
   * sign-in method: e-mail/password users have no `displayName`/`photoURL`, so
   * the display name falls back to the part of the e-mail address before the `@`
   * and absent fields are left out (Firestore rejects `undefined`).
   */
  async ensureProfile(user: User): Promise<UserProfile> {
    const repo = this.profileRepoFactory.create(user.uid);
    const existing = await repo.fetch();
    const email = (user.email || '').toLowerCase();
    const displayName = profileDisplayName(user);

    if (existing) {
      const updates: Partial<UserProfile> = {};
      if (email && existing.email !== email) {
        updates.email = email;
      }
      if (!existing.displayName && displayName) {
        updates.displayName = displayName;
      }
      if (!Array.isArray(existing.campaigns)) {
        updates.campaigns = [];
      }
      if (Object.keys(updates).length > 0) {
        await repo.patch({ ...updates, updatedAt: new Date() });
        return { ...existing, ...updates };
      }
      return existing;
    }

    const now = new Date();
    const profile: UserProfile = {
      uid: user.uid,
      email,
      ...(displayName ? { displayName } : {}),
      ...(user.photoURL ? { photoURL: user.photoURL } : {}),
      campaigns: [],
      createdAt: now,
      updatedAt: now
    };

    await repo.update(profile as ProfileRecord);
    return profile;
  }

  /** Add a campaign to a user's profile (also used for invited users). */
  async addCampaign(userId: string, campaignId: string): Promise<void> {
    const repo = this.profileRepoFactory.create(userId);
    const existing = await repo.fetch();
    if (!existing) {
      await repo.update({ uid: userId, campaigns: [campaignId], updatedAt: new Date() } as Partial<ProfileRecord>);
      return;
    }
    const campaigns = existing.campaigns ?? [];
    if (campaigns.includes(campaignId)) {
      return;
    }
    await repo.patch({ campaigns: [...campaigns, campaignId], updatedAt: new Date() });
  }

  async removeCampaign(userId: string, campaignId: string): Promise<void> {
    const repo = this.profileRepoFactory.create(userId);
    const existing = await repo.fetch();
    if (!existing) return;
    const campaigns = (existing.campaigns ?? []).filter(id => id !== campaignId);
    await repo.patch({ campaigns, updatedAt: new Date() });
  }

  async setDefaultCampaign(userId: string, campaignId: string | null): Promise<void> {
    await this.profileRepoFactory.create(userId).patch({ defaultCampaignId: campaignId, updatedAt: new Date() });
  }
}
