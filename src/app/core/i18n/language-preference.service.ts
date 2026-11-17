import { computed, effect, inject, Injectable, untracked } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import * as logger from '../../shared/logger';
import { UserService } from '../user.service';
import { I18nService } from './i18n.service';
import { writeStoredLanguage } from './initial-language';
import { isLanguageCode, type LanguageCode } from './language-strategy';

/**
 * Where the language choice lives. The profile (`users/{uid}.language`) is the
 * source and always wins. The copy in localStorage serves visitors without an
 * account and lets the app start in the right language before the profile has
 * loaded. Only a deliberate choice is stored; without one the browser decides.
 */
@Injectable({ providedIn: 'root' })
export class LanguagePreferenceService {
  private readonly i18n = inject(I18nService);
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);

  /** A computed, so the effect only runs when the stored language itself changes. */
  private readonly profileLanguage = computed(() => this.userService.storedProfile()?.language);

  constructor() {
    effect(() => {
      const language = this.profileLanguage();
      if (!isLanguageCode(language)) return;
      untracked(() => {
        this.i18n.use(language);
        writeStoredLanguage(language);
      });
    });
  }

  /** The user picks a language: switch now, remember it here, and store it in the profile when signed in. */
  async choose(language: LanguageCode): Promise<void> {
    this.i18n.use(language);
    writeStoredLanguage(language);

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
