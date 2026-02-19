import { Injectable, signal, computed, effect, Injector, runInInjectionContext } from '@angular/core';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import type { UserProfile } from './models/user.model';
import { UserProfileRepository } from '../shared/repository/user-profile.repository';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly authService = inject(AuthService);
  private readonly injector = inject(Injector);

  private profileRepo: UserProfileRepository | null = null;

  private readonly userProfile = signal<UserProfile | null>(null);
  private readonly loading = signal<boolean>(false);

  // Public read-only signals
  readonly profile = this.userProfile.asReadonly();
  readonly isAdmin = computed(() => this.userProfile()?.admin === true);
  readonly isLoading = this.loading.asReadonly();

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.setupProfileRepo(user.uid);
      } else {
        this.cleanupProfileRepo();
        this.userProfile.set(null);
      }
    });
  }

  private setupProfileRepo(uid: string): void {
    // Don't re-setup for same user
    if (this.profileRepo) {
      return;
    }

    this.loading.set(true);

    runInInjectionContext(this.injector, () => {
      this.profileRepo = new UserProfileRepository(uid);

      // Create an effect to sync repo data to the service signal
      const profileSignal = this.profileRepo.get;
      effect(() => {
        const profileData = profileSignal();
        if (profileData) {
          this.userProfile.set(profileData as UserProfile);
        } else {
          // User document doesn't exist yet - create basic profile
          const currentUser = this.authService.currentUser();
          if (currentUser) {
            this.userProfile.set({
              uid,
              email: currentUser.email ?? null,
              displayName: currentUser.displayName ?? null,
              admin: false
            });
          }
        }
        this.loading.set(false);
      });
    });
  }

  private cleanupProfileRepo(): void {
    this.profileRepo?.destroy();
    this.profileRepo = null;
  }

  async refreshProfile(): Promise<void> {
    // With real-time listener via repository, data auto-refreshes
    // This method is kept for API compatibility
  }
}
