import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  browserLanguage,
  detectInitialLanguage,
  LANGUAGE_STORAGE_KEY,
  readStoredLanguage,
  writeStoredLanguage,
} from './initial-language';

describe('browserLanguage', () => {
  it('takes the first language the app speaks', () => {
    expect(browserLanguage(['nl-NL', 'en'])).toBe('nl');
    expect(browserLanguage(['en-US', 'nl'])).toBe('en');
    expect(browserLanguage(['de', 'nl'])).toBe('nl');
    expect(browserLanguage(['NL-be'])).toBe('nl');
  });

  it('falls back on English', () => {
    expect(browserLanguage(['fr'])).toBe('en');
    expect(browserLanguage([])).toBe('en');
  });
});

describe('the language kept on this device', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('is read back after it was written', () => {
    expect(readStoredLanguage()).toBeNull();
    writeStoredLanguage('nl');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('nl');
    expect(readStoredLanguage()).toBe('nl');
  });

  it('ignores a value that is not a language', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'klingon');
    expect(readStoredLanguage()).toBeNull();
  });

  it('wins from the browser language at the start', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['nl-NL']);
    expect(detectInitialLanguage()).toBe('nl');

    writeStoredLanguage('en');
    expect(detectInitialLanguage()).toBe('en');
  });

  it('survives storage that refuses to work', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr']);

    expect(() => writeStoredLanguage('nl')).not.toThrow();
    expect(detectInitialLanguage()).toBe('en');
  });
});
