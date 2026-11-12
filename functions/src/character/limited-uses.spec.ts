import { describe, it, expect } from 'vitest';
import type { DndCharacter } from '../schemas/dnd-character.schema';
import { preserveLimitedUses } from './limited-uses';

function character(overrides: Partial<DndCharacter> = {}): DndCharacter {
  return {
    name: 'Vesper', class: 'Paladin', level: 5, race: 'Tiefling',
    featuresAndTraits: [],
    ...overrides,
  } as DndCharacter;
}

describe('preserveLimitedUses', () => {
  it('carries a tracker over to a feature the generator returned without one', () => {
    const previous = character({
      featuresAndTraits: [
        { name: 'Hellish Rebuke', description: 'text', source: 'Race', uses: { max: 1, recharge: 'longRest' } },
      ],
    });
    const draft = character({
      featuresAndTraits: [
        { name: 'hellish rebuke', description: '', source: 'Race' },
        { name: 'Darkvision', description: '', source: 'Race' },
      ],
    });

    expect(preserveLimitedUses(previous, draft).featuresAndTraits).toEqual([
      { name: 'hellish rebuke', description: '', source: 'Race', uses: { max: 1, recharge: 'longRest' } },
      { name: 'Darkvision', description: '', source: 'Race' },
    ]);
  });

  it('keeps the tracker the generator returned', () => {
    const previous = character({
      featuresAndTraits: [{ name: 'Rage', description: '', uses: { max: 2, recharge: 'longRest' } }],
    });
    const draft = character({
      featuresAndTraits: [{ name: 'Rage', description: '', uses: { max: 3, recharge: 'longRest' } }],
    });

    expect(preserveLimitedUses(previous, draft).featuresAndTraits[0].uses).toEqual({ max: 3, recharge: 'longRest' });
  });

  it('carries spell trackers over and leaves string spells alone', () => {
    const previous = character({
      spellcasting: { spells: [{ name: 'Misty Step', level: 2, uses: { max: 1, recharge: 'longRest' } }, 'Bless'] },
    });
    const draft = character({
      spellcasting: { spells: [{ name: 'Misty Step', level: 2 }, 'Bless', { name: 'Shield', level: 1 }] },
    });

    expect(preserveLimitedUses(previous, draft).spellcasting?.spells).toEqual([
      { name: 'Misty Step', level: 2, uses: { max: 1, recharge: 'longRest' } },
      'Bless',
      { name: 'Shield', level: 1 },
    ]);
  });

  it('handles a character without spellcasting', () => {
    const draft = character();
    expect(preserveLimitedUses(character(), draft).spellcasting).toBeUndefined();
  });
});
