import { computed, effect, inject, Injectable, untracked } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import * as logger from '../../shared/logger';
import { UserService } from '../user.service';
import { I18nService } from './i18n.service';
import { readStoredLanguage, writeStoredLanguage } from './initial-language';
import { isLanguageCode, type LanguageCode } from './language-strategy';

/**
 * Where the language choice lives. The profile (`users/{uid}.language`) is the
 * source and always wins. The copy in localStorage serves visitors without an
 * account and lets the app start in the right language before the profile has
 * loaded. Only a deliberate choice is stored; without one the browser decides.
 * A choice made before signing in (on the sign-in page, on a shared link) moves
 * into the profile once the user is signed in, unless the profile already has one.
 */
@Injectable({ providedIn: 'root' })
export class LanguagePreferenceService {
  private readonly i18n = inject(I18nService);
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);

  /**
   * The language in the profile; `null` for a loaded profile without one and
   * `undefined` while there is no profile to read. A computed, so the effect
   * only runs when this changes and not on every other change to the profile.
   */
  private readonly profileLanguage = computed(() => {
    const profile = this.userService.storedProfile();
    if (!profile) return undefined;
    return isLanguageCode(profile.language) ? profile.language : null;
  });

  constructor() {
    effect(() => {
      const language = this.profileLanguage();
      if (language === undefined) return;
      untracked(() => {
        if (language) {
          this.i18n.use(language);
          writeStoredLanguage(language);
          return;
        }
        const chosenHere = readStoredLanguage();
        if (chosenHere) void this.storeInProfile(chosenHere);
      });
    });
  }

  /** The user picks a language: switch now, remember it here, and store it in the profile when signed in. */
  async choose(language: LanguageCode): Promise<void> {
    this.i18n.use(language);
    writeStoredLanguage(language);

    await this.storeInProfile(language);
  }

  private async storeInProfile(language: LanguageCode): Promise<void> {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) return;
    try {
      await this.userService.setLanguage(userId, language);
    } catch (error) {
      // The app already switched and this device remembers; only other devices miss the choice.
      logger.error('Failed to store the language in the profile:', error);
    }
  }
}
