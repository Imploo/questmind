import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '../core/i18n/translate.pipe';

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
  imports: [ReactiveFormsModule, TranslatePipe],
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
        <label for="email" class="qm-label">{{ 'common.email' | translate }}</label>
        <input
          id="email"
          type="email"
          formControlName="email"
          autocomplete="email"
          [placeholder]="'auth.emailPlaceholder' | translate"
          class="qm-input"
        />
        @if (form.controls.email.touched && form.controls.email.invalid) {
          <p class="mt-1 text-xs text-wine" data-testid="email-error">
            {{ (form.controls.email.hasError('required') ? 'auth.emailRequired' : 'auth.emailInvalid') | translate }}
          </p>
        }
      </div>

      @if (mode() !== 'reset') {
        <div>
          <label for="password" class="qm-label">{{ 'auth.passwordLabel' | translate }}</label>
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
              @if (form.controls.password.hasError('required')) {
                {{ 'auth.passwordRequired' | translate }}
              } @else {
                {{ 'auth.passwordTooShort' | translate: minPasswordLength }}
              }
            </p>
          } @else if (mode() === 'signup') {
            <p class="qm-help mt-1">{{ 'auth.passwordHint' | translate: minPasswordLength }}</p>
          }
        </div>
      }

      <button type="submit" [disabled]="loading()" class="qm-btn qm-btn-primary qm-btn-lg qm-btn-block">
        @if (loading()) {
          <span class="flex items-center justify-center gap-2">
            <span class="qm-spinner qm-spinner-light" aria-hidden="true"></span>
            <span>{{ (mode() === 'reset' ? 'auth.sending' : 'auth.processing') | translate }}</span>
          </span>
        } @else {
          @switch (mode()) {
            @case ('signup') { <span>{{ 'auth.createAccount' | translate }}</span> }
            @case ('reset') { <span>{{ 'auth.sendResetLink' | translate }}</span> }
            @default { <span>{{ 'auth.signIn' | translate }}</span> }
          }
        }
      </button>
    </form>

    <div class="mt-6 text-center text-sm">
      @switch (mode()) {
        @case ('signup') {
          <span class="qm-muted">{{ 'auth.haveAccount' | translate }} </span>
          <button type="button" class="qm-link" (click)="modeChange.emit('signin')">
            {{ 'auth.signInLink' | translate }}
          </button>
        }
        @case ('reset') {
          <button type="button" class="qm-link" (click)="modeChange.emit('signin')">
            {{ 'auth.backToSignIn' | translate }}
          </button>
        }
        @default {
          <div class="space-y-2">
            <button type="button" class="qm-link !font-medium" (click)="modeChange.emit('reset')">
              {{ 'auth.forgotPassword' | translate }}
            </button>
            <div>
              <span class="qm-muted">{{ 'auth.noAccount' | translate }} </span>
              <button type="button" class="qm-link" (click)="modeChange.emit('signup')">
                {{ 'auth.signUpLink' | translate }}
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
