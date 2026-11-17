import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { I18nService, type LanguageCode } from '../../core/i18n';
import { provideTestLanguage } from '../../core/i18n/testing';
import { ProfileDrawerComponent, userInitials } from './profile-drawer.component';

describe('ProfileDrawerComponent', () => {
  let fixture: ComponentFixture<ProfileDrawerComponent>;
  let element: HTMLElement;
  let events: { languages: LanguageCode[]; signOuts: number; closes: number };

  const user = { displayName: 'Bram Stoker', email: 'bram@example.com', photoURL: null };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestLanguage('nl')] });
    fixture = TestBed.createComponent(ProfileDrawerComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('user', user);
    fixture.componentRef.setInput('language', 'nl');
    fixture.componentRef.setInput('languages', TestBed.inject(I18nService).available);

    events = { languages: [], signOuts: 0, closes: 0 };
    const component = fixture.componentInstance;
    component.languageChange.subscribe(language => events.languages.push(language));
    component.signOut.subscribe(() => events.signOuts++);
    component.closed.subscribe(() => events.closes++);

    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('shows who is signed in', () => {
    expect(element.querySelector('[data-testid="profile-name"]')?.textContent).toBe('Bram Stoker');
    expect(element.querySelector('[data-testid="profile-email"]')?.textContent).toBe('bram@example.com');
    expect(element.querySelector('.avatar')?.textContent).toBe('BS');
  });

  it('renders nothing while closed', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('passes a picked language on', () => {
    const english = element.querySelector<HTMLButtonElement>('app-language-switcher button[lang="en"]');
    english?.click();
    expect(events.languages).toEqual(['en']);
  });

  it('asks to sign out', () => {
    const button = element.querySelector<HTMLButtonElement>('[data-testid="profile-sign-out"]');
    expect(button?.textContent?.trim()).toBe('Uitloggen');
    button?.click();
    expect(events.signOuts).toBe(1);
  });

  it('closes on Escape, on the scrim and on the close button', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    element.querySelector<HTMLElement>('.qm-scrim')?.click();
    element.querySelector<HTMLButtonElement>('button[aria-label="Sluiten"]')?.click();
    expect(events.closes).toBe(3);
  });

  it('ignores Escape while closed', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(events.closes).toBe(0);
  });
});

describe('userInitials', () => {
  it('takes two letters from the name, else one from the e-mail address', () => {
    expect(userInitials({ displayName: 'Bram van der Stoker', email: 'x@y.z' })).toBe('BV');
    expect(userInitials({ displayName: null, email: 'bram@example.com' })).toBe('B');
    expect(userInitials({ displayName: null, email: null })).toBe('?');
  });
});
