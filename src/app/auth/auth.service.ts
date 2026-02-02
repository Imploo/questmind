import { Injectable, signal, computed } from '@angular/core';
import { 
  getAuth, 
  signInWithPopup, 
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
import { getApp } from 'firebase/app';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth: Auth;
  private user = signal<User | null>(null);
  private loading = signal<boolean>(true);
  private error = signal<string | null>(null);

  // Public read-only signals
  readonly currentUser = this.user.asReadonly();
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isLoading = this.loading.asReadonly();
  readonly authError = this.error.asReadonly();

  constructor() {
    this.auth = getAuth(getApp());
    this.initAuthStateListener();
  }

  private initAuthStateListener(): void {
    onAuthStateChanged(this.auth, (user) => {
      this.user.set(user);
      this.loading.set(false);
      if (user) {
        this.error.set(null);
      }
    }, (err) => {
      console.error('Auth state change error:', err);
      this.error.set(this.getErrorMessage(err));
      this.loading.set(false);
    });
  }

  async signInWithGoogle(): Promise<UserCredential> {
    this.loading.set(true);
    this.error.set(null);
    
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(this.auth, provider);
      this.loading.set(false);
      return result;
    } catch (err: any) {
      this.loading.set(false);
      const errorMessage = this.getErrorMessage(err);
      this.error.set(errorMessage);
      throw new Error(errorMessage);
    }
  }

  async signInWithEmail(email: string, password: string): Promise<UserCredential> {
    this.loading.set(true);
    this.error.set(null);
    
    try {
      const result = await signInWithEmailAndPassword(this.auth, email, password);
      this.loading.set(false);
      return result;
    } catch (err: any) {
      this.loading.set(false);
      const errorMessage = this.getErrorMessage(err);
      this.error.set(errorMessage);
      throw new Error(errorMessage);
    }
  }

  async signUpWithEmail(email: string, password: string): Promise<UserCredential> {
    this.loading.set(true);
    this.error.set(null);
    
    try {
      const result = await createUserWithEmailAndPassword(this.auth, email, password);
      this.loading.set(false);
      return result;
    } catch (err: any) {
      this.loading.set(false);
      const errorMessage = this.getErrorMessage(err);
      this.error.set(errorMessage);
      throw new Error(errorMessage);
    }
  }

  async sendPasswordReset(email: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    
    try {
      await sendPasswordResetEmail(this.auth, email);
      this.loading.set(false);
    } catch (err: any) {
      this.loading.set(false);
      const errorMessage = this.getErrorMessage(err);
      this.error.set(errorMessage);
      throw new Error(errorMessage);
    }
  }

  async signOut(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    
    try {
      await firebaseSignOut(this.auth);
      this.user.set(null);
      this.loading.set(false);
    } catch (err: any) {
      this.loading.set(false);
      const errorMessage = this.getErrorMessage(err);
      this.error.set(errorMessage);
      throw new Error(errorMessage);
    }
  }

  private getErrorMessage(error: any): string {
    if (!error?.code) return error?.message || 'An error occurred';
    
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
      'auth/network-request-failed': 'Network error. Please check your connection.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/invalid-credential': 'Invalid credentials provided'
    };
    
    return errorMessages[error.code] || error.message || 'Authentication failed';
  }
}
