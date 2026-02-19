import { Injectable, computed, effect, inject, resource } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import type { UserProfile } from './models/user.model';
import { UserProfileRepositoryFactory } from '../shared/repository/user-profile.repository';

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

  readonly profile = computed<UserProfile | null>(() => {
    const repo = this.profileResource.value();
    if (!repo) return null;
    const data = repo.get() as UserProfile | null;
    if (data) return data;
    // Fallback: create basic profile from auth user when doc doesn't exist yet
    const user = this.authService.currentUser();
    if (user) {
      return {
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
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

  async refreshProfile(): Promise<void> {
    // With real-time listener via repository, data auto-refreshes
    // This method is kept for API compatibility
  }
}
