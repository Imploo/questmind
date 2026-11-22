import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { I18nService, LanguagePreferenceService, TranslatePipe, type LanguageCode } from '../../core/i18n';
import { LanguageSwitcherComponent } from '../../shared/components/language-switcher.component';
import { LogoComponent } from '../../shared/components/logo.component';

/**
 * Top bar for a visitor who is not signed in: on a shared character, a shared
 * campaign and a shared podcast. It says where they are, lets them pick a language and offers to sign in.
 */
@Component({
  selector: 'app-public-topbar',
  imports: [RouterLink, LogoComponent, LanguageSwitcherComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <header class="max-w-5xl mx-auto mb-4 flex items-center justify-between gap-3">
      <a routerLink="/" class="flex items-center gap-3 no-underline min-w-0">
        <app-logo [size]="40" />
        <span class="font-display text-lg font-bold tracking-[0.08em] text-white truncate" data-no-i18n>Questmind</span>
      </a>
      <div class="flex items-center gap-2 shrink-0">
        <app-language-switcher
          tone="dark"
          [language]="i18n.language()"
          [languages]="i18n.available"
          (languageChange)="chooseLanguage($event)"
        />
        <!-- After signing in the visitor comes back here: to the shared character, campaign or podcast. -->
        <a routerLink="/sign-in" [queryParams]="{ returnUrl: currentUrl() }" class="qm-btn qm-btn-gold">{{ 'common.signIn' | translate }}</a>
      </div>
    </header>
  `,
})
export class PublicTopbarComponent {
  protected readonly i18n = inject(I18nService);
  private readonly preference = inject(LanguagePreferenceService);
  private readonly router = inject(Router);

  /** The page the visitor is on; it follows the tabs of a shared campaign. */
  protected readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  chooseLanguage(language: LanguageCode): void {
    void this.preference.choose(language);
  }
}
