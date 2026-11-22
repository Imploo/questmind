import { describe, it, expect } from 'vitest';
import { ChangeDetectionStrategy, Component, computed, inject, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { en } from './en';
import { I18nService } from './i18n.service';
import type { LanguageCode } from './language-strategy';
import { nl } from './nl';
import { provideTestLanguage } from './testing';
import { TranslatePipe } from './translate.pipe';

describe('I18nService', () => {
  const setup = (language: LanguageCode) => {
    TestBed.configureTestingModule({ providers: [provideTestLanguage(language)] });
    return TestBed.inject(I18nService);
  };

  it('starts in the given language', () => {
    const i18n = setup('nl');
    expect(i18n.language()).toBe('nl');
    expect(i18n.locale()).toBe('nl-NL');
    expect(i18n.t()).toBe(nl);
  });

  it('switches language, locale and texts together', () => {
    const i18n = setup('nl');

    i18n.use('en');

    expect(i18n.language()).toBe('en');
    expect(i18n.locale()).toBe('en-GB');
    expect(i18n.t()).toBe(en);
  });

  it('ignores a language it does not have', () => {
    const i18n = setup('nl');

    i18n.use('de' as LanguageCode);

    expect(i18n.language()).toBe('nl');
  });

  it('offers Dutch and English to choose from', () => {
    const i18n = setup('en');
    expect(i18n.available.map(strategy => [strategy.code, strategy.nativeName])).toEqual([
      ['nl', 'Nederlands'],
      ['en', 'English'],
    ]);
  });

  it('translates a key, with its values', () => {
    const i18n = setup('en');
    expect(i18n.translate('nav.campaigns')).toBe('Campaigns');
    expect(i18n.translate('common.version', 3)).toBe('Version 3');
    expect(i18n.translate('errors.reasons.podcastNotReady')).toBe(en.errors.reasons.podcastNotReady);
  });

  it('sets the language of the document', () => {
    const i18n = setup('nl');
    TestBed.tick();
    expect(document.documentElement.lang).toBe('nl');

    i18n.use('en');
    TestBed.tick();
    expect(document.documentElement.lang).toBe('en');
  });
});

@Component({
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p data-testid="pipe">{{ 'nav.campaigns' | translate }}</p>
    <p data-testid="pipe-values">{{ 'common.version' | translate: 2 }}</p>
    <p data-testid="signal">{{ t().nav.campaigns }}</p>
    <p data-testid="computed">{{ label() }}</p>
    <button [attr.aria-label]="'common.close' | translate"></button>
  `,
})
class SwitchingHostComponent {
  private readonly i18n = inject(I18nService);
  readonly t = this.i18n.t;
  readonly label = computed(() => this.i18n.t().nav.characters);
}

describe('switching language in a zoneless OnPush component', () => {
  it('changes every text at once: pipe, signal and computed', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideTestLanguage('nl')],
    });
    const fixture = TestBed.createComponent(SwitchingHostComponent);
    const element = fixture.nativeElement as HTMLElement;
    const text = (id: string) => element.querySelector(`[data-testid="${id}"]`)?.textContent;
    await fixture.whenStable();

    expect(text('pipe')).toBe('Campagnes');
    expect(text('pipe-values')).toBe('Versie 2');
    expect(text('signal')).toBe('Campagnes');
    expect(text('computed')).toBe('Karakters');
    expect(element.querySelector('button')?.getAttribute('aria-label')).toBe('Sluiten');

    // No detectChanges: the language signal alone has to schedule the re-render.
    TestBed.inject(I18nService).use('en');
    await fixture.whenStable();

    expect(text('pipe')).toBe('Campaigns');
    expect(text('pipe-values')).toBe('Version 2');
    expect(text('signal')).toBe('Campaigns');
    expect(text('computed')).toBe('Characters');
    expect(element.querySelector('button')?.getAttribute('aria-label')).toBe('Close');
  });
});
