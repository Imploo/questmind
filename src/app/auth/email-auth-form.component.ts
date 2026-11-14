import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

export type EmailAuthMode = 'signin' | 'signup' | 'reset';

export interface EmailAuthCredentials {
  email: string;
  password: string;
}

export const MIN_PASSWORD_LENGTH = 6;

/**
 * Presentational email/password form for sign in, sign up and password reset.
 * The parent owns the mode, loading, error and success state and performs the auth calls.
 */
@Component({
  selector: 'app-email-auth-form',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error()) {
      <div class="qm-alert mb-4" role="alert">
        {{ error() }}
      </div>
    }

    @if (success()) {
      <div class="qm-alert qm-alert-success mb-4" role="status">
        {{ success() }}
      </div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4" novalidate>
      <div>
        <label for="email" class="qm-label">Email</label>
        <input
          id="email"
          type="email"
          formControlName="email"
          autocomplete="email"
          placeholder="you@example.com"
          class="qm-input"
        />
        @if (form.controls.email.touched && form.controls.email.invalid) {
          <p class="mt-1 text-xs text-wine" data-testid="email-error">
            {{ form.controls.email.hasError('required') ? 'Email is required' : 'Enter a valid email address' }}
          </p>
        }
      </div>

      @if (mode() !== 'reset') {
        <div>
          <label for="password" class="qm-label">Password</label>
          <input
            id="password"
            type="password"
            formControlName="password"
            [attr.autocomplete]="mode() === 'signup' ? 'new-password' : 'current-password'"
            placeholder="••••••••"
            class="qm-input"
          />
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <p class="mt-1 text-xs text-wine" data-testid="password-error">
              {{ form.controls.password.hasError('required') ? 'Password is required' : 'Password must be at least ' + minPasswordLength + ' characters' }}
            </p>
          } @else if (mode() === 'signup') {
            <p class="qm-help mt-1">Must be at least {{ minPasswordLength }} characters</p>
          }
        </div>
      }

      <button type="submit" [disabled]="loading()" class="qm-btn qm-btn-primary qm-btn-lg qm-btn-block">
        @if (loading()) {
          <span class="flex items-center justify-center gap-2">
            <span class="qm-spinner qm-spinner-light" aria-hidden="true"></span>
            <span>{{ mode() === 'reset' ? 'Sending...' : 'Processing...' }}</span>
          </span>
        } @else {
          @switch (mode()) {
            @case ('signup') { <span>Create Account</span> }
            @case ('reset') { <span>Send Reset Link</span> }
            @default { <span>Sign In</span> }
          }
        }
      </button>
    </form>

    <div class="mt-6 text-center text-sm">
      @switch (mode()) {
        @case ('signup') {
          <span class="qm-muted">Already have an account? </span>
          <button type="button" class="qm-link" (click)="modeChange.emit('signin')">
            Sign in
          </button>
        }
        @case ('reset') {
          <button type="button" class="qm-link" (click)="modeChange.emit('signin')">
            Back to sign in
          </button>
        }
        @default {
          <div class="space-y-2">
            <button type="button" class="qm-link !font-medium" (click)="modeChange.emit('reset')">
              Forgot password?
            </button>
            <div>
              <span class="qm-muted">Don't have an account? </span>
              <button type="button" class="qm-link" (click)="modeChange.emit('signup')">
                Sign up
              </button>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class EmailAuthFormComponent {
  readonly mode = input<EmailAuthMode>('signin');
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly success = input<string | null>(null);

  readonly submitted = output<EmailAuthCredentials>();
  readonly modeChange = output<EmailAuthMode>();

  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
  });

  constructor() {
    // Keep the control state in sync with the inputs: the password is not part of the
    // reset flow, and nothing is editable while a request is in flight.
    effect(() => {
      const isReset = this.mode() === 'reset';
      const isLoading = this.loading();
      const { email, password } = this.form.controls;

      if (isLoading) {
        email.disable({ emitEvent: false });
        password.disable({ emitEvent: false });
        return;
      }

      email.enable({ emitEvent: false });
      if (isReset) {
        password.disable({ emitEvent: false });
      } else {
        password.enable({ emitEvent: false });
      }
    });
  }

  submit(): void {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.submitted.emit({
      email: email.trim(),
      password: this.mode() === 'reset' ? '' : password,
    });
  }
}
