import { describe, it, expect } from 'vitest';
import { resolutionContextOf, resolutionKey, usesBundledRules } from './resolution-context';

describe('resolutionContextOf', () => {
  it('takes class, race and level from the character', () => {
    expect(resolutionContextOf({ class: 'Druid', race: 'Wood Elf', level: 3 })).toEqual({
      class: 'Druid', race: 'Wood Elf', level: 3, maxSpellSlotLevel: undefined, features: [], rulesVersion: '2014',
    });
  });

  it('takes the rules the character follows from the caller', () => {
    expect(resolutionContextOf({ class: 'Druid', race: 'Wood Elf', level: 3 }, '2024').rulesVersion).toBe('2024');
  });

  it('lists the names of the character\'s features', () => {
    const featuresAndTraits = [{ name: 'Metamagic', description: '' }, { name: 'Quickened Spell', description: 'x' }];

    expect(resolutionContextOf({ class: 'Sorcerer', race: 'Elf', level: 3, featuresAndTraits }).features).toEqual([
      'Metamagic', 'Quickened Spell',
    ]);
  });

  it('finds the highest slot level the character has slots of', () => {
    const slots = [{ level: 1, total: 4, expended: 0 }, { level: 2, total: 2, expended: 2 }, { level: 3, total: 0, expended: 0 }];

    expect(resolutionContextOf({ class: 'Druid', race: 'Elf', level: 3, spellcasting: { slots } }).maxSpellSlotLevel).toBe(2);
  });

  it('reads slots stored as a record', () => {
    const slots = { '1': { total: 2, expended: 0 }, '3': { total: 2, expended: 0 } };

    expect(resolutionContextOf({ class: 'Warlock', race: 'Elf', level: 5, spellcasting: { slots } }).maxSpellSlotLevel).toBe(3);
  });
});

describe('resolutionKey', () => {
  it('changes with class, race, level and highest slot', () => {
    const druid = { class: 'Druid', race: 'Wood Elf', level: 3, maxSpellSlotLevel: 2 };

    expect(resolutionKey(druid)).toBe('v2|druid|wood elf|3|2');
    expect(resolutionKey({ ...druid, level: 4 })).not.toBe(resolutionKey(druid));
    expect(resolutionKey({ ...druid, class: 'Wizard' })).not.toBe(resolutionKey(druid));
    expect(resolutionKey({ ...druid, maxSpellSlotLevel: undefined })).toBe('v2|druid|wood elf|3|-');
  });

  it('does not change with the character\'s features', () => {
    const sorcerer = { class: 'Sorcerer', race: 'Elf', level: 3 };

    expect(resolutionKey({ ...sorcerer, features: ['Metamagic'] })).toBe(resolutionKey(sorcerer));
  });

  it('changes with the rules, and keeps the keys of 2014 texts as they were', () => {
    const druid = { class: 'Druid', race: 'Wood Elf', level: 3, maxSpellSlotLevel: 2 };

    expect(resolutionKey({ ...druid, rulesVersion: '2014' })).toBe('v2|druid|wood elf|3|2');
    expect(resolutionKey({ ...druid, rulesVersion: '2024' })).toBe('v2|druid|wood elf|3|2|2024');
  });

  it('ignores case and surrounding spaces', () => {
    expect(resolutionKey({ class: ' DRUID ', race: 'Elf', level: 3 })).toBe(resolutionKey({ class: 'druid', race: 'elf', level: 3 }));
  });
});

describe('usesBundledRules', () => {
  it('holds for the 2014 rules, which the bundled SRD data is', () => {
    expect(usesBundledRules({ rulesVersion: '2014' })).toBe(true);
    expect(usesBundledRules({})).toBe(true);
    expect(usesBundledRules(undefined)).toBe(true);
  });

  it('does not hold for the 2024 rules', () => {
    expect(usesBundledRules({ rulesVersion: '2024' })).toBe(false);
  });
});
