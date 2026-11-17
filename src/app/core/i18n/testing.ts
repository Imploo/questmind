import type { Provider } from '@angular/core';
import { INITIAL_LANGUAGE } from './initial-language';
import type { LanguageCode } from './language-strategy';

/**
 * Fix the language a test starts in. Without it a test runs in English:
 * jsdom asks for `en-US` and its storage starts empty.
 */
export function provideTestLanguage(language: LanguageCode): Provider {
  return { provide: INITIAL_LANGUAGE, useValue: language };
}
