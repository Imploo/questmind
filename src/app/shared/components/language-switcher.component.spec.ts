import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { I18nService, type LanguageCode } from '../../core/i18n';
import { LanguageSwitcherComponent } from './language-switcher.component';

describe('LanguageSwitcherComponent', () => {
  let fixture: ComponentFixture<LanguageSwitcherComponent>;
  let element: HTMLElement;
  let picked: LanguageCode[];

  const options = () => Array.from(element.querySelectorAll<HTMLButtonElement>('button'));

  beforeEach(() => {
    fixture = TestBed.createComponent(LanguageSwitcherComponent);
    fixture.componentRef.setInput('language', 'nl');
    fixture.componentRef.setInput('languages', TestBed.inject(I18nService).available);
    picked = [];
    fixture.componentInstance.languageChange.subscribe(language => picked.push(language));
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('shows one button per language, named in its own language', () => {
    expect(options().map(option => option.textContent?.trim())).toEqual(['nl', 'en']);
    expect(options().map(option => option.getAttribute('aria-label'))).toEqual(['Nederlands', 'English']);
  });

  it('marks the active language', () => {
    expect(options().map(option => option.getAttribute('aria-pressed'))).toEqual(['true', 'false']);

    fixture.componentRef.setInput('language', 'en');
    fixture.detectChanges();

    expect(options().map(option => option.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('reports the language that was picked', () => {
    options()[1].click();
    expect(picked).toEqual(['en']);
  });
});
