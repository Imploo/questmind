import { computed, effect, inject, Injectable, signal, DOCUMENT } from '@angular/core';
import { INITIAL_LANGUAGE } from './initial-language';
import { LANGUAGE_STRATEGIES, type LanguageCode, type LanguageStrategy } from './language-strategy';
import type { ParamsOf, TranslationKey } from './translation-key';

/**
 * The active language. Everything the app shows reads `t()`, `locale()` or the
 * `translate` pipe, so switching the strategy changes every text at once.
 * Where the choice comes from and where it is kept is `LanguagePreferenceService`'s job.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly strategies = inject(LANGUAGE_STRATEGIES);
  private readonly document = inject(DOCUMENT);
  private readonly active = signal<LanguageStrategy>(this.strategyFor(inject(INITIAL_LANGUAGE)) ?? this.strategies[0]);

  readonly language = computed(() => this.active().code);
  /** Locale for dates and numbers. */
  readonly locale = computed(() => this.active().locale);
  /** All texts in the active language. */
  readonly t = computed(() => this.active().translations);
  /** The languages the user can choose from. */
  readonly available = this.strategies;

  constructor() {
    effect(() => {
      this.document.documentElement.lang = this.language();
    });
  }

  /** Switch to a language; an unknown code changes nothing. */
  use(code: LanguageCode): void {
    const strategy = this.strategyFor(code);
    if (strategy) this.active.set(strategy);
  }

  /** The text behind a key, in the active language. */
  translate<K extends TranslationKey>(key: K, ...args: ParamsOf<K>): string {
    let value: unknown = this.t();
    for (const part of key.split('.')) {
      value = (value as Record<string, unknown> | undefined)?.[part];
    }
    if (typeof value === 'function') {
      return (value as (...params: unknown[]) => string)(...args);
    }
    return typeof value === 'string' ? value : key;
  }

  private strategyFor(code: string): LanguageStrategy | undefined {
    return this.strategies.find(strategy => strategy.code === code);
  }
}
