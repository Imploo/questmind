import { inject, Pipe, type PipeTransform } from '@angular/core';
import { I18nService } from './i18n.service';
import type { ParamsOf, TranslationKey } from './translation-key';

/**
 * A text from the active language: `{{ 'nav.signOut' | translate }}`, or with
 * values `{{ 'campaignStory.sessionCount' | translate: count }}`.
 *
 * Not pure on purpose. A pure pipe only runs again when its input changes, and
 * the key stays the same when the language switches. Reading the signal inside
 * `transform` makes the view depend on the language, so it re-renders by itself.
 */
@Pipe({ name: 'translate', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform<K extends TranslationKey>(key: K, ...args: ParamsOf<K>): string {
    return this.i18n.translate(key, ...args);
  }
}
