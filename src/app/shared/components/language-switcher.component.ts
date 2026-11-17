import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe, type LanguageCode, type LanguageStrategy } from '../../core/i18n';

/**
 * The language choice as a pair of buttons ("NL" / "EN"). Purely visual: the
 * parent says which language is active and hears which one was picked.
 * `tone` follows the surface it sits on: parchment (`light`) or the night sky (`dark`).
 */
@Component({
  selector: 'app-language-switcher',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="switch" [class.is-dark]="tone() === 'dark'" role="group" [attr.aria-label]="'common.language' | translate">
      @for (option of languages(); track option.code) {
        <button
          type="button"
          class="option"
          [class.is-active]="option.code === language()"
          [attr.aria-pressed]="option.code === language()"
          [attr.aria-label]="option.nativeName"
          [attr.lang]="option.code"
          (click)="languageChange.emit(option.code)"
        >{{ option.code }}</button>
      }
    </div>
  `,
  styles: [`
    .switch {
      display: inline-flex;
      gap: 2px;
      padding: 3px;
      border-radius: 10px;
      background: var(--paper-2);
      border: 1px solid var(--line);
    }
    .option {
      min-width: 40px;
      min-height: 32px;
      padding: 0 0.6rem;
      border-radius: 7px;
      font-family: var(--font-display);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
      transition: background 0.15s, color 0.15s;
      touch-action: manipulation;
    }
    .option:hover:not(.is-active) { color: var(--ink); }
    .option.is-active {
      color: var(--gold-deep);
      background: var(--paper);
      box-shadow: 0 1px 3px rgba(30, 20, 60, 0.18);
    }

    .switch.is-dark {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.22);
    }
    .is-dark .option { color: rgba(255, 255, 255, 0.82); }
    .is-dark .option:hover:not(.is-active) { color: #fff; }
    .is-dark .option.is-active { color: var(--gold-deep); background: var(--paper); }
  `],
})
export class LanguageSwitcherComponent {
  readonly language = input.required<LanguageCode>();
  readonly languages = input.required<readonly LanguageStrategy[]>();
  readonly tone = input<'light' | 'dark'>('light');

  readonly languageChange = output<LanguageCode>();
}
