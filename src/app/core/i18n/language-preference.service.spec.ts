import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../auth/auth.service';
import type { UserProfile } from '../models/user.model';
import { UserService } from '../user.service';
import { I18nService } from './i18n.service';
import { LANGUAGE_STORAGE_KEY } from './initial-language';
import { LanguagePreferenceService } from './language-preference.service';
import { provideTestLanguage } from './testing';

describe('LanguagePreferenceService', () => {
  const storedProfile = signal<UserProfile | null | undefined>(undefined);
  const currentUser = signal<{ uid: string } | null>(null);
  const setLanguage = vi.fn<(userId: string, language: string) => Promise<void>>();

  const setup = () => {
    TestBed.configureTestingModule({
      providers: [
        provideTestLanguage('en'),
        { provide: AuthService, useValue: { currentUser } },
        { provide: UserService, useValue: { storedProfile, setLanguage } },
      ],
    });
    const preference = TestBed.inject(LanguagePreferenceService);
    return { preference, i18n: TestBed.inject(I18nService) };
  };

  const profile = (language?: 'nl' | 'en'): UserProfile => ({ uid: 'u1', email: 'a@b.c', ...(language ? { language } : {}) });

  beforeEach(() => {
    localStorage.clear();
    storedProfile.set(undefined);
    currentUser.set(null);
    setLanguage.mockReset().mockResolvedValue(undefined);
  });

  // Spec files share a browser context: a language left behind here would become
  // the starting language of whatever spec runs next.
  afterEach(() => localStorage.clear());

  it('follows the language of the profile and keeps a copy on this device', () => {
    const { i18n } = setup();
    expect(i18n.language()).toBe('en');

    storedProfile.set(profile('nl'));
    TestBed.tick();

    expect(i18n.language()).toBe('nl');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('nl');
  });

  it('leaves the language alone for a profile without a choice', () => {
    const { i18n } = setup();

    storedProfile.set(profile());
    TestBed.tick();

    expect(i18n.language()).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  it('does not undo a fresh choice when the profile changes for another reason', async () => {
    const { preference, i18n } = setup();
    storedProfile.set(profile('nl'));
    TestBed.tick();

    await preference.choose('en');
    storedProfile.set({ ...profile('nl'), defaultCampaignId: 'c1' });
    TestBed.tick();

    expect(i18n.language()).toBe('en');
  });

  it('stores a choice in the profile when signed in', async () => {
    const { preference, i18n } = setup();
    currentUser.set({ uid: 'u1' });

    await preference.choose('nl');

    expect(i18n.language()).toBe('nl');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('nl');
    expect(setLanguage).toHaveBeenCalledWith('u1', 'nl');
  });

  it('keeps a choice on this device only when nobody is signed in', async () => {
    const { preference, i18n } = setup();

    await preference.choose('nl');

    expect(i18n.language()).toBe('nl');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('nl');
    expect(setLanguage).not.toHaveBeenCalled();
  });

  it('still switches when the profile cannot be written', async () => {
    const { preference, i18n } = setup();
    currentUser.set({ uid: 'u1' });
    setLanguage.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(preference.choose('nl')).resolves.toBeUndefined();

    expect(i18n.language()).toBe('nl');
  });
});
