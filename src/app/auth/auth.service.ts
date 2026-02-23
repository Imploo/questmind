import { Injectable, inject, signal, computed } from '@angular/core';
import {
  signInWithPopup,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  type Auth,
  type User,
  type UserCredential
} from 'firebase/auth';
import { FirebaseService } from '../core/firebase.service';
import { SentryService } from '../core/services/sentry.service';
import * as logger from '../shared/logger';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sentryService = inject(SentryService);
  private readonly firebase = inject(FirebaseService);
  private auth: Auth;
  private user = signal<User | null>(null);
  private loading = signal<boolean>(true);
  private error = signal<string | null>(null);

  // Public read-only signals
  readonly currentUser = this.user.asReadonly();
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isLoading = this.loading.asReadonly();
  readonly authError = this.error.asReadonly();

  private authStateInitialized = false;
  private redirectCheckComplete = false;

  constructor() {
    this.auth = this.firebase.requireAuth();
    this.initAuthStateListener();
    this.checkRedirectResult();
  }

  private initAuthStateListener(): void {
    onAuthStateChanged(this.auth, (user) => {
      this.user.set(user);
      this.authStateInitialized = true;
      
      if (user) {
        this.loading.set(false);
        this.error.set(null);
        this.sentryService.setUser(
          user.uid,
          user.email ?? undefined,
          user.displayName ?? undefined,
        );
      } else {
        this.sentryService.clearUser();
        // Only set loading to false if we've also checked for redirect results
        if (this.redirectCheckComplete) {
          this.loading.set(false);
        }
      }
    }, (err) => {
      logger.error('Auth state change error:', err);
      this.error.set(this.getErrorMessage(err));
      this.loading.set(false);
    });
  }

  private async checkRedirectResult(): Promise<void> {
    try {
      const result = await getRedirectResult(this.auth);
      if (result) {
        // User successfully signed in via redirect
        this.sentryService.addBreadcrumb('Sign-in redirect completed', 'auth', 'info');
        logger.info('Successfully signed in via redirect:', result.user.email);
      }
    } catch (err: unknown) {
      logger.error('Redirect result error:', err);
      this.error.set(this.getErrorMessage(err));
    } finally {
      this.redirectCheckComplete = true;
      // If auth state is initialized and we still don't have a user, we're done loading
      if (this.authStateInitialized && !this.user()) {
        this.loading.set(false);
      }
    }
  }

  async signInWithGoogle(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.sentryService.addBreadcrumb('Sign-in with Google started', 'auth', 'info');
    
    try {
      const provider = new GoogleAuthProvider();
      // Use popup instead of redirect to avoid third-party cookie issues (Brave, etc.)
      await signInWithPopup(this.auth, provider);
      // Auth state listener will update the user
    } catch (err: unknown) {
      this.loading.set(false);
      const errorMessage = this.getErrorMessage(err);
      this.error.set(errorMessage);
      throw new Error(errorMessage);
    }
  }

  async signInWithEmail(email: string, password: string): Promise<UserCredential> {
    this.loading.set(true);
    this.error.set(null);
    this.sentryService.addBreadcrumb('Sign-in with email started', 'auth', 'info');
    
    try {
      const result = await signInWithEmailAndPassword(this.auth, email, password);
      this.loading.set(false);
      return result;
    } catch (err: unknown) {
      this.loading.set(false);
      const errorMessage = this.getErrorMessage(err);
      this.error.set(errorMessage);
      throw new Error(errorMessage);
    }
  }

  async signUpWithEmail(email: string, password: string): Promise<UserCredential> {
    this.loading.set(true);
    this.error.set(null);
    this.sentryService.addBreadcrumb('Sign-up with email started', 'auth', 'info');
    
    try {
      const result = await createUserWithEmailAndPassword(this.auth, email, password);
      this.loading.set(false);
      return result;
    } catch (err: unknown) {
      this.loading.set(false);
      const errorMessage = this.getErrorMessage(err);
      this.error.set(errorMessage);
      throw new Error(errorMessage);
    }
  }

  async sendPasswordReset(email: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.sentryService.addBreadcrumb('Password reset requested', 'auth', 'info');
    
    try {
      await sendPasswordResetEmail(this.auth, email);
      this.loading.set(false);
    } catch (err: unknown) {
      this.loading.set(false);
      const errorMessage = this.getErrorMessage(err);
      this.error.set(errorMessage);
      throw new Error(errorMessage);
    }
  }

  async signOut(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.sentryService.addBreadcrumb('Sign-out started', 'auth', 'info');
    
    try {
      await firebaseSignOut(this.auth);
      this.user.set(null);
      this.loading.set(false);
    } catch (err: unknown) {
      this.loading.set(false);
      const errorMessage = this.getErrorMessage(err);
      this.error.set(errorMessage);
      throw new Error(errorMessage);
    }
  }

  private getErrorMessage(error: unknown): string {
    if (!error || typeof error !== 'object') return 'An error occurred';
    const err = error as { code?: string; message?: string };
    if (!err.code) return err.message || 'An error occurred';
    
    const errorMessages: Record<string, string> = {
      'auth/invalid-email': 'Invalid email address',
      'auth/user-disabled': 'This account has been disabled',
      'auth/user-not-found': 'No account found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/email-already-in-use': 'An account with this email already exists',
      'auth/weak-password': 'Password should be at least 6 characters',
      'auth/operation-not-allowed': 'This sign-in method is not enabled',
      'auth/popup-blocked': 'Sign-in popup was blocked. Please allow popups for this site.',
      'auth/popup-closed-by-user': 'Sign-in was cancelled',
      'auth/cancelled-popup-request': 'Sign-in was cancelled',
      'auth/network-request-failed': 'Network error. Please check your connection.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/invalid-credential': 'Invalid credentials provided'
    };
    
    return errorMessages[err.code] || err.message || 'Authentication failed';
  }
}
