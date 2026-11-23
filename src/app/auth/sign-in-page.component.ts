import { ChangeDetectionStrategy, Component, computed, signal, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { safeReturnUrl } from './return-url';
import { AuthService } from './auth.service';
import { EmailAuthFormComponent, type EmailAuthCredentials, type EmailAuthMode } from './email-auth-form.component';
import { LogoComponent } from '../shared/components/logo.component';
import { I18nService, LanguagePreferenceService, TranslatePipe, type LanguageCode } from '../core/i18n';
import { LanguageSwitcherComponent } from '../shared/components/language-switcher.component';

@Component({
  selector: 'app-sign-in-page',
  imports: [EmailAuthFormComponent, LogoComponent, LanguageSwitcherComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative min-h-dvh flex items-center justify-center p-4">
      <div class="absolute top-4 right-4">
        <app-language-switcher
          tone="dark"
          [language]="i18n.language()"
          [languages]="i18n.available"
          (languageChange)="chooseLanguage($event)"
        />
      </div>
      <div class="qm-panel qm-hero w-full max-w-md !p-7 sm:!p-9">
        <div class="text-center mb-7">
          <app-logo [size]="84" [plain]="true" />
          <h1 class="qm-display text-3xl tracking-wide mt-2" data-no-i18n>Questmind</h1>
          <p class="font-prose text-lg text-gray-700 mt-1">{{ subtitle() }}</p>
        </div>

        @if (mode() !== 'reset') {
          <button
            type="button"
            (click)="signInWithGoogle()"
            [disabled]="loading()"
            class="qm-btn qm-btn-lg qm-btn-block"
          >
            @if (loading()) {
              <span class="qm-spinner" aria-hidden="true"></span>
              <span>{{ 'auth.signingIn' | translate }}</span>
            } @else {
              <svg class="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>{{ 'auth.signInWithGoogle' | translate }}</span>
            }
          </button>

          <div class="or" aria-hidden="true"><span>{{ 'auth.or' | translate }}</span></div>
        }

        <app-email-auth-form
          [mode]="mode()"
          [loading]="loading()"
          [error]="error()"
          [success]="success()"
          (submitted)="submitEmail($event)"
          (modeChange)="setMode($event)"
        />

        <p class="qm-help mt-6 text-center">
          {{ 'auth.terms' | translate }}
        </p>
      </div>
    </div>
  `,
  styles: [`
    .or {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 1.4rem 0;
      font-family: var(--font-display);
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .or::before, .or::after { content: ''; flex: 1; height: 1px; }
    .or::before { background: linear-gradient(to left, #d9c9a6, transparent); }
    .or::after { background: linear-gradient(to right, #d9c9a6, transparent); }
  `]
})
export class SignInPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  /** Where the user came from (e.g. a shared campaign), to go back to once signed in. */
  private readonly returnUrl = safeReturnUrl(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'));
  protected readonly i18n = inject(I18nService);
  private readonly preference = inject(LanguagePreferenceService);

  readonly loading = this.authService.isLoading;
  readonly mode = signal<EmailAuthMode>('signin');
  /** Single error source: messages thrown by AuthService (already mapped to a text in the active language). */
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly subtitle = computed(() => {
    const auth = this.i18n.t().auth;
    switch (this.mode()) {
      case 'signup':
        return auth.subtitleSignUp;
      case 'reset':
        return auth.subtitleReset;
      default:
        return auth.subtitleSignIn;
    }
  });

  chooseLanguage(language: LanguageCode): void {
    void this.preference.choose(language);
  }

  setMode(mode: EmailAuthMode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.success.set(null);
  }

  async signInWithGoogle(): Promise<void> {
    await this.run(async () => {
      await this.authService.signInWithGoogle();
      await this.router.navigateByUrl(this.returnUrl);
    });
  }

  async submitEmail({ email, password }: EmailAuthCredentials): Promise<void> {
    const mode = this.mode();
    await this.run(async () => {
      if (mode === 'reset') {
        await this.authService.sendPasswordReset(email);
        this.success.set(this.i18n.t().auth.resetSent);
        return;
      }
      if (mode === 'signup') {
        await this.authService.signUpWithEmail(email, password);
      } else {
        await this.authService.signInWithEmail(email, password);
      }
      await this.router.navigateByUrl(this.returnUrl);
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.success.set(null);
    try {
      await action();
    } catch (err: unknown) {
      this.error.set((err as Error)?.message || this.i18n.t().auth.signInFailed);
    }
  }
}
