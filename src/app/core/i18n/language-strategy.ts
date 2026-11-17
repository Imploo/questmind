import { InjectionToken } from '@angular/core';
import { en } from './en';
import { nl } from './nl';
import type { Translations } from './translations';

export const LANGUAGE_CODES = ['nl', 'en'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

/** The language for anyone whose browser asks for neither Dutch nor English. */
export const FALLBACK_LANGUAGE: LanguageCode = 'en';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGE_CODES as readonly string[]).includes(value);
}

/**
 * Everything that belongs to one language: its texts, the locale for dates and
 * numbers, and the name it goes by in the language switcher. The app talks to
 * the active strategy only, so another language is a new strategy and nothing else.
 */
export interface LanguageStrategy {
  readonly code: LanguageCode;
  /** Locale for `Intl` and `toLocale…String`. */
  readonly locale: string;
  /** The language in its own words, as the switcher shows it. */
  readonly nativeName: string;
  readonly translations: Translations;
}

export class DutchLanguageStrategy implements LanguageStrategy {
  readonly code = 'nl';
  readonly locale = 'nl-NL';
  readonly nativeName = 'Nederlands';
  readonly translations = nl;
}

export class EnglishLanguageStrategy implements LanguageStrategy {
  readonly code = 'en';
  /** British notation: 6 Nov 2026 and a 24-hour clock. */
  readonly locale = 'en-GB';
  readonly nativeName = 'English';
  readonly translations = en;
}

export const LANGUAGE_STRATEGIES = new InjectionToken<readonly LanguageStrategy[]>('LANGUAGE_STRATEGIES', {
  providedIn: 'root',
  factory: () => [new DutchLanguageStrategy(), new EnglishLanguageStrategy()],
});
