import { Component, signal, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from './auth.service';
import * as logger from '../shared/logger';

type AuthMode = 'signin' | 'signup' | 'reset';

@Component({
  selector: 'app-sign-in-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div 
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      (click)="handleBackdropClick($event)"
    >
      <div 
        class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative"
        (click)="$event.stopPropagation()"
      >
        <button
          type="button"
          class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-light leading-none"
          (click)="closed.emit()"
          aria-label="Close"
        >
          ×
        </button>

        <div class="mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-2">
            {{ mode() === 'signin' ? 'Sign In' : mode() === 'signup' ? 'Create Account' : 'Reset Password' }}
          </h2>
          <p class="text-sm text-gray-600">
            {{ mode() === 'signin' ? 'Welcome back!' : mode() === 'signup' ? 'Join Questmind today' : 'Enter your email to receive a password reset link' }}
          </p>
        </div>

        @if (authService.authError()) {
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {{ authService.authError() }}
          </div>
        }

        @if (successMessage()) {
          <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {{ successMessage() }}
          </div>
        }

        @if (mode() !== 'reset') {
          <button
            type="button"
            class="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border-2 border-gray-200 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 transition-colors mb-6"
            (click)="handleGoogleSignIn()"
            [disabled]="loading()"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>{{ loading() ? 'Signing in...' : 'Continue with Google' }}</span>
          </button>

          <div class="relative mb-6">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-200"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-4 bg-white text-gray-500">or</span>
            </div>
          </div>
        }

        <form (ngSubmit)="handleSubmit()" class="space-y-4">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              [(ngModel)]="email"
              name="email"
              required
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              placeholder="you@example.com"
              [disabled]="loading()"
            />
          </div>

          @if (mode() !== 'reset') {
            <div>
              <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                [(ngModel)]="password"
                name="password"
                required
                minlength="6"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                placeholder="••••••••"
                [disabled]="loading()"
              />
              @if (mode() === 'signup') {
                <p class="mt-1 text-xs text-gray-500">Must be at least 6 characters</p>
              }
            </div>
          }

          <button
            type="submit"
            class="w-full px-4 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            [disabled]="loading()"
          >
            @if (loading()) {
              <span class="flex items-center justify-center gap-2">
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>{{ mode() === 'reset' ? 'Sending...' : 'Processing...' }}</span>
              </span>
            } @else {
              <span>{{ mode() === 'signin' ? 'Sign In' : mode() === 'signup' ? 'Create Account' : 'Send Reset Link' }}</span>
            }
          </button>
        </form>

        <div class="mt-6 text-center text-sm">
          @if (mode() === 'signin') {
            <div class="space-y-2">
              <button
                type="button"
                class="text-primary hover:underline"
                (click)="mode.set('reset')"
              >
                Forgot password?
              </button>
              <div>
                <span class="text-gray-600">Don't have an account? </span>
                <button
                  type="button"
                  class="text-primary font-semibold hover:underline"
                  (click)="mode.set('signup')"
                >
                  Sign up
                </button>
              </div>
            </div>
          } @else if (mode() === 'signup') {
            <div>
              <span class="text-gray-600">Already have an account? </span>
              <button
                type="button"
                class="text-primary font-semibold hover:underline"
                (click)="mode.set('signin')"
              >
                Sign in
              </button>
            </div>
          } @else {
            <button
              type="button"
              class="text-primary hover:underline"
              (click)="mode.set('signin')"
            >
              Back to sign in
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class SignInModalComponent {
  readonly authService = inject(AuthService);
  closed = output<void>();

  mode = signal<AuthMode>('signin');
  email = '';
  password = '';
  loading = signal<boolean>(false);
  successMessage = signal<string | null>(null);

  handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  async handleGoogleSignIn(): Promise<void> {
    this.loading.set(true);
    this.successMessage.set(null);
    
    try {
      await this.authService.signInWithGoogle();
      this.closed.emit();
    } catch (error) {
      logger.error('Google sign-in failed:', error);
    } finally {
      this.loading.set(false);
    }
  }

  async handleSubmit(): Promise<void> {
    if (!this.email || (this.mode() !== 'reset' && !this.password)) {
      return;
    }

    this.loading.set(true);
    this.successMessage.set(null);

    try {
      if (this.mode() === 'signin') {
        await this.authService.signInWithEmail(this.email, this.password);
        this.closed.emit();
      } else if (this.mode() === 'signup') {
        await this.authService.signUpWithEmail(this.email, this.password);
        this.closed.emit();
      } else {
        await this.authService.sendPasswordReset(this.email);
        this.successMessage.set('Password reset email sent! Check your inbox.');
        this.email = '';
      }
    } catch (error) {
      logger.error('Auth operation failed:', error);
    } finally {
      this.loading.set(false);
    }
  }
}
