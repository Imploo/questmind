import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe, type LanguageCode, type LanguageStrategy } from '../../core/i18n';
import { LanguageSwitcherComponent } from '../../shared/components/language-switcher.component';

/** What the drawer shows of the signed-in user. */
export interface ProfileDrawerUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/**
 * Slide-over with the user's own things: who is signed in, the language of the
 * app and signing out. Purely visual; the nav rail opens it and acts on its events.
 */
@Component({
  selector: 'app-profile-drawer',
  imports: [TranslatePipe, LanguageSwitcherComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-[60] flex justify-end">
        <div class="qm-scrim" (click)="closed.emit()" aria-hidden="true"></div>

        <aside
          class="qm-drawer relative z-[60] w-full max-w-sm"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="'profile.title' | translate"
        >
          <div class="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
            <div>
              <div class="qm-eyebrow">{{ 'profile.eyebrow' | translate }}</div>
              <h2 class="qm-display text-xl">{{ 'profile.title' | translate }}</h2>
            </div>
            <button
              type="button"
              class="qm-btn qm-btn-ghost qm-btn-icon"
              (click)="closed.emit()"
              [attr.aria-label]="'common.close' | translate"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto scrollbar-thin px-5 pb-5 space-y-6">
            <div class="flex items-center gap-3">
              @if (user().photoURL; as photo) {
                <img [src]="photo" alt="" class="avatar" />
              } @else {
                <span class="avatar" aria-hidden="true">{{ initials() }}</span>
              }
              <div class="min-w-0">
                @if (user().displayName; as name) {
                  <div class="font-semibold truncate" data-testid="profile-name">{{ name }}</div>
                }
                @if (user().email; as email) {
                  <div class="text-sm qm-muted truncate" data-testid="profile-email">{{ email }}</div>
                }
              </div>
            </div>

            <div>
              <div class="qm-label">{{ 'common.language' | translate }}</div>
              <app-language-switcher
                [language]="language()"
                [languages]="languages()"
                (languageChange)="languageChange.emit($event)"
              />
              <p class="qm-help mt-2">{{ 'profile.languageHint' | translate }}</p>
            </div>
          </div>

          <div class="px-5 py-4 border-t border-[color:var(--line)]">
            <button type="button" class="qm-btn qm-btn-block" data-testid="profile-sign-out" (click)="signOut.emit()">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
              </svg>
              {{ 'profile.signOut' | translate }}
            </button>
          </div>
        </aside>
      </div>
    }
  `,
  styles: [`
    .avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      font-family: var(--font-display);
      font-size: 17px;
      font-weight: 700;
      color: var(--gold-deep);
      background: radial-gradient(circle at 35% 30%, #fff8e8, var(--gold-soft));
      border: 1.5px solid #e5c77f;
    }
  `],
})
export class ProfileDrawerComponent {
  readonly open = input.required<boolean>();
  readonly user = input.required<ProfileDrawerUser>();
  readonly language = input.required<LanguageCode>();
  readonly languages = input.required<readonly LanguageStrategy[]>();

  readonly languageChange = output<LanguageCode>();
  readonly signOut = output<void>();
  readonly closed = output<void>();

  readonly initials = computed(() => userInitials(this.user()));

  onEscape(): void {
    if (this.open()) this.closed.emit();
  }
}

/** Two letters for an avatar without a photo: from the name, else the first letter of the e-mail address. */
export function userInitials(user: Pick<ProfileDrawerUser, 'displayName' | 'email'>): string {
  if (user.displayName) {
    return user.displayName.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2);
  }
  return user.email?.[0]?.toUpperCase() ?? '?';
}
