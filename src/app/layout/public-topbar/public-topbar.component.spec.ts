import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { I18nService, LanguagePreferenceService } from '../../core/i18n';
import { provideTestLanguage } from '../../core/i18n/testing';
import { PublicTopbarComponent } from './public-topbar.component';

describe('PublicTopbarComponent', () => {
  let fixture: ComponentFixture<PublicTopbarComponent>;
  let element: HTMLElement;
  const preference = { choose: vi.fn() };

  beforeEach(() => {
    preference.choose.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestLanguage('en'),
        { provide: LanguagePreferenceService, useValue: preference },
      ],
    });
    fixture = TestBed.createComponent(PublicTopbarComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('shows where the visitor is, the language choice and the way in', () => {
    expect(element.textContent).toContain('Questmind');
    expect(element.querySelectorAll('app-language-switcher button')).toHaveLength(2);
    const signIn = element.querySelector<HTMLAnchorElement>('a[href="/sign-in"]');
    expect(signIn?.textContent?.trim()).toBe('Sign in');
  });

  it('passes a picked language on to be remembered', () => {
    element.querySelector<HTMLButtonElement>('app-language-switcher button[lang="nl"]')?.click();
    expect(preference.choose).toHaveBeenCalledWith('nl');
  });

  it('follows the language', async () => {
    TestBed.inject(I18nService).use('nl');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('a[href="/sign-in"]')?.textContent?.trim()).toBe('Inloggen');
    expect(element.querySelector('app-language-switcher button[lang="nl"]')?.getAttribute('aria-pressed')).toBe('true');
  });
});
