import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { SignInModalComponent } from './sign-in-modal.component';
import * as logger from '../shared/logger';

@Component({
  selector: 'app-auth-button',
  imports: [SignInModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-3">
      @if (authService.isLoading()) {
        <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 text-white text-sm">
          <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          <span>Loading...</span>
        </div>
      } @else if (authService.isAuthenticated()) {
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 text-white text-sm">
            @if (user()?.photoURL) {
              <img 
                [src]="user()?.photoURL || ''" 
                [alt]="user()?.displayName || 'User avatar'"
                class="w-6 h-6 rounded-full"
              />
            } @else {
              <div class="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center text-xs font-semibold">
                {{ getUserInitials() }}
              </div>
            }
            <span class="font-medium">{{ user()?.displayName || user()?.email || 'User' }}</span>
          </div>
          <button
            type="button"
            class="px-4 py-2 text-sm font-semibold rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            (click)="handleSignOut()"
            [disabled]="signingOut()"
          >
            {{ signingOut() ? 'Signing out...' : 'Sign Out' }}
          </button>
        </div>
      } @else {
        <button
          type="button"
          class="px-4 py-2 text-sm font-semibold rounded-full bg-white text-primary hover:bg-white/90 transition-colors shadow-lg"
          (click)="openSignInModal()"
        >
          Sign In
        </button>
      }
    </div>

    @if (showSignInModal()) {
      <app-sign-in-modal (closed)="closeSignInModal()"></app-sign-in-modal>
    }
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class AuthButtonComponent {
  readonly authService = inject(AuthService);
  showSignInModal = signal<boolean>(false);
  signingOut = signal<boolean>(false);

  get user() {
    return this.authService.currentUser;
  }

  getUserInitials(): string {
    const user = this.user();
    if (!user) return '?';
    
    if (user.displayName) {
      const parts = user.displayName.split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return user.displayName[0].toUpperCase();
    }
    
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    
    return '?';
  }

  openSignInModal(): void {
    this.showSignInModal.set(true);
  }

  closeSignInModal(): void {
    this.showSignInModal.set(false);
  }

  async handleSignOut(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.authService.signOut();
    } catch (error) {
      logger.error('Sign out failed:', error);
    } finally {
      this.signingOut.set(false);
    }
  }
}
