import { InjectionToken } from '@angular/core';
import { FALLBACK_LANGUAGE, isLanguageCode, LANGUAGE_CODES, type LanguageCode } from './language-strategy';

export const LANGUAGE_STORAGE_KEY = 'questmind.language';

/** The language chosen on this device earlier, if any. */
export function readStoredLanguage(): LanguageCode | null {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguageCode(stored) ? stored : null;
  } catch {
    // Storage can be blocked (private mode, embedded views); the browser language decides then.
    return null;
  }
}

export function writeStoredLanguage(language: LanguageCode): void {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Not being able to remember the choice is no reason to refuse it.
  }
}

/** The first language the browser asks for that the app speaks; English otherwise. */
export function browserLanguage(preferred: readonly string[]): LanguageCode {
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split('-')[0];
    const match = LANGUAGE_CODES.find(code => code === primary);
    if (match) return match;
  }
  return FALLBACK_LANGUAGE;
}

/** The language to start in, known before the first render: this device's choice, else the browser's. */
export function detectInitialLanguage(): LanguageCode {
  const stored = readStoredLanguage();
  if (stored) return stored;
  const nav = globalThis.navigator;
  const preferred = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  return browserLanguage(preferred);
}

export const INITIAL_LANGUAGE = new InjectionToken<LanguageCode>('INITIAL_LANGUAGE', {
  providedIn: 'root',
  factory: detectInitialLanguage,
});
