import { describe, it, expect } from 'vitest';
import { resolutionContextOf, resolutionKey } from './resolution-context';

describe('resolutionContextOf', () => {
  it('takes class, race and level from the character', () => {
    expect(resolutionContextOf({ class: 'Druid', race: 'Wood Elf', level: 3 })).toEqual({
      class: 'Druid', race: 'Wood Elf', level: 3, maxSpellSlotLevel: undefined,
    });
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

    expect(resolutionKey(druid)).toBe('druid|wood elf|3|2');
    expect(resolutionKey({ ...druid, level: 4 })).not.toBe(resolutionKey(druid));
    expect(resolutionKey({ ...druid, class: 'Wizard' })).not.toBe(resolutionKey(druid));
    expect(resolutionKey({ ...druid, maxSpellSlotLevel: undefined })).toBe('druid|wood elf|3|-');
  });

  it('ignores case and surrounding spaces', () => {
    expect(resolutionKey({ class: ' DRUID ', race: 'Elf', level: 3 })).toBe(resolutionKey({ class: 'druid', race: 'elf', level: 3 }));
  });
});
