import { describe, it, expect } from 'vitest';
import { otherRulesVersion, rulesConversionRequest, rulesVersionOf } from './rules-version';
import { isImageRequest } from '../../chat/chat-view';

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
    const request = rulesConversionRequest(rulesVersion);

    expect(request).toContain(`Zet dit karakter om naar de D&D 5e regels van ${rulesVersion}.`);
    // It has to be answered as a question, not drawn as a portrait.
    expect(isImageRequest(request)).toBe(false);
  });
});
