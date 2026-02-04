import { Injectable, signal, computed, effect } from '@angular/core';
import { inject } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { AuthService } from '../auth/auth.service';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  admin?: boolean;
  campaigns?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly firebaseService = inject(FirebaseService);
  private readonly authService = inject(AuthService);

  private readonly userProfile = signal<UserProfile | null>(null);
  private readonly loading = signal<boolean>(false);
  private readonly error = signal<string | null>(null);

  // Public read-only signals
  readonly profile = this.userProfile.asReadonly();
  readonly isAdmin = computed(() => this.userProfile()?.admin === true);
  readonly isLoading = this.loading.asReadonly();
  readonly userError = this.error.asReadonly();

  constructor() {
    // Automatically fetch user profile when auth state changes
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        void this.fetchUserProfile(user.uid);
      } else {
        this.userProfile.set(null);
        this.error.set(null);
      }
    });
  }

  private async fetchUserProfile(uid: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const firestore = this.firebaseService.requireFirestore();
      const userDoc = doc(firestore, 'users', uid);
      const snapshot = await getDoc(userDoc);

      if (snapshot.exists()) {
        const data = snapshot.data();
        const profile = {
          uid,
          email: data['email'] ?? null,
          displayName: data['displayName'] ?? null,
          admin: data['admin'] === true,
          campaigns: data['campaigns'] ?? [],
          createdAt: data['createdAt']?.toDate ? data['createdAt'].toDate() : data['createdAt'],
          updatedAt: data['updatedAt']?.toDate ? data['updatedAt'].toDate() : data['updatedAt']
        };
        this.userProfile.set(profile);
      } else {
        console.warn('User document does not exist in Firestore for uid:', uid);
        // User document doesn't exist yet - create basic profile
        this.userProfile.set({
          uid,
          email: this.authService.currentUser()?.email ?? null,
          displayName: this.authService.currentUser()?.displayName ?? null,
          admin: false
        });
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to fetch user profile');
      this.userProfile.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Manually refresh the user profile from Firestore
   */
  async refreshProfile(): Promise<void> {
    const user = this.authService.currentUser();
    if (user) {
      await this.fetchUserProfile(user.uid);
    }
  }
}
