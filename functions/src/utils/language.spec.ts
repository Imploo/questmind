import { describe, it, expect } from 'vitest';
import { languageFromAcceptLanguage, parseLanguage } from './language';

describe('parseLanguage', () => {
  it('accepts the two languages of the app', () => {
    expect(parseLanguage('nl')).toBe('nl');
    expect(parseLanguage('en')).toBe('en');
  });

  it.each([undefined, null, '', 'de', 'EN', 'en-GB', 42, true, ['en'], { language: 'en' }])(
    'is Dutch for %j: existing clients and documents are Dutch',
    (value) => {
      expect(parseLanguage(value)).toBe('nl');
    }
  );
});

describe('languageFromAcceptLanguage', () => {
  it.each([
    ['nl', 'nl'],
    ['nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7', 'nl'],
    ['NL-be', 'nl'],
    // The first language the browser asks for that the app speaks.
    ['de-DE,de;q=0.9,nl;q=0.8', 'nl'],
    ['de,nl;q=0.5,en;q=0.4', 'nl'],
    ['en-GB,en;q=0.9,nl;q=0.8', 'en'],
    ['de,en;q=0.5,nl;q=0.4', 'en'],
    // Preference is the quality, not the position in the header.
    ['en;q=0.5, nl;q=0.9', 'nl'],
    ['nl;q=0.5, en;q=0.9', 'en'],
    // A language that is ruled out does not count.
    ['nl;q=0, fr', 'en'],
  ])('reads %j as %s', (header, language) => {
    expect(languageFromAcceptLanguage(header)).toBe(language);
  });

  it.each([undefined, '', '*', 'fr-FR,fr;q=0.9', 'nonsense;;q=x', ',,'])('is English for %j', (header) => {
    expect(languageFromAcceptLanguage(header)).toBe('en');
  });
});
