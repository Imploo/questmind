import { describe, it, expect } from 'vitest';
import { otherRulesVersion, rulesConversionRequest, rulesVersionOf } from './rules-version';
import { isImageRequest } from '../../chat/chat-view';
import { en } from '../../core/i18n/en';
import { nl } from '../../core/i18n/nl';

describe('rulesVersionOf', () => {
  it('is 2014 for a character without the setting', () => {
    expect(rulesVersionOf({})).toBe('2014');
    expect(rulesVersionOf(null)).toBe('2014');
    expect(rulesVersionOf(undefined)).toBe('2014');
  });

  it('reads the stored setting and ignores a value it does not know', () => {
    expect(rulesVersionOf({ rulesVersion: '2024' })).toBe('2024');
    expect(rulesVersionOf({ rulesVersion: '2014' })).toBe('2014');
    expect(rulesVersionOf({ rulesVersion: '3.5' })).toBe('2014');
  });
});

describe('otherRulesVersion', () => {
  it('switches between the two editions', () => {
    expect(otherRulesVersion('2014')).toBe('2024');
    expect(otherRulesVersion('2024')).toBe('2014');
  });
});

describe('rulesConversionRequest', () => {
  it.each(['2014', '2024'] as const)('asks The Sidekick to rebuild the character under the %s rules', rulesVersion => {
    const request = rulesConversionRequest(rulesVersion, nl.characters.rulesConversion);

    expect(request).toContain(`Zet dit karakter om naar de D&D 5e regels van ${rulesVersion}.`);
    expect(request).toContain(`naar de ${rulesVersion}-versie.`);
    // It has to be answered as a question, not drawn as a portrait.
    expect(isImageRequest(request)).toBe(false);
  });

  it.each(['2014', '2024'] as const)('asks it in English when that is the language of the user (%s)', rulesVersion => {
    const request = rulesConversionRequest(rulesVersion, en.characters.rulesConversion);

    expect(request).toBe(
      [
        en.characters.rulesConversion.convert(rulesVersion),
        en.characters.rulesConversion.review(rulesVersion),
        en.characters.rulesConversion.choices,
      ].join(' ')
    );
    expect(request).toContain(`Convert this character to the D&D 5e rules of ${rulesVersion}.`);
    expect(request).not.toContain('Zet dit karakter');
    expect(isImageRequest(request)).toBe(false);
  });
});
