import { describe, it, expect } from 'vitest';
import { tailorToLevel } from './level-tailoring';

describe('tailorToLevel', () => {
  const extraAttack =
    'Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn.\n\n' +
    'The number of attacks increases to three when you reach 11th level in this class and to four when you reach 20th level in this class.';

  it('drops a paragraph about a level the character has not reached', () => {
    expect(tailorToLevel(extraAttack, 5)).toBe(
      'Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn.'
    );
  });

  it('keeps a sentence whole once the character reached one of its levels', () => {
    expect(tailorToLevel(extraAttack, 11)).toBe(extraAttack);
  });

  it('keeps the text whole at the highest level it names', () => {
    expect(tailorToLevel(extraAttack, 20)).toBe(extraAttack);
  });

  it('keeps a list of tiers whole from the first tier on, and drops it before that', () => {
    const fireBolt = "This spell's damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10).";

    expect(tailorToLevel(fireBolt, 4)).toBe('');
    expect(tailorToLevel(fireBolt, 5)).toBe(fireBolt);
    expect(tailorToLevel(fireBolt, 12)).toBe(fireBolt);
  });

  it('counts every level of a list, not only the first', () => {
    const tiers = 'You hit hard. The die becomes a d8 at 5th level, a d10 at 10th level, and a d12 at 15th level.';

    expect(tailorToLevel(tiers, 4)).toBe('You hit hard.');
    expect(tailorToLevel(tiers, 10)).toBe(tiers);
  });

  it('reads a list of ordinals as levels', () => {
    const circleSpells = 'At 3rd, 5th, 7th, and 9th level you gain access to circle spells.';

    expect(tailorToLevel(circleSpells, 3)).toBe(circleSpells);
  });

  it('leaves spell and slot levels alone', () => {
    const naturalRecovery =
      'Starting at 2nd level, you can regain some of your magical energy. ' +
      'The spell slots can have a combined level that is equal to or less than half your druid level (rounded up), and none of the slots can be 6th level or higher.';

    expect(tailorToLevel(naturalRecovery, 2)).toBe(naturalRecovery);
  });

  it('drops the sentences that follow a level the character has not reached', () => {
    const text =
      'You can frighten a creature.\n\n' +
      'At 14th level, you gain a pair of wings. You can create these wings as a bonus action.';

    expect(tailorToLevel(text, 6)).toBe('You can frighten a creature.');
  });

  it('drops the bullets under a dropped introduction', () => {
    const text = 'You are fast.\n\nAt 18th level, you gain the following benefits:\n* You fly.\n* You swim.\n\nYou are still fast.';

    expect(tailorToLevel(text, 3)).toBe('You are fast.\n\nYou are still fast.');
  });

  it('drops the rows of a level table the character has not reached', () => {
    const wildShape = [
      'Your druid level determines the beasts you can transform into.',
      '',
      '| Level | Max. CR | Example |',
      '| --- | --- | --- |',
      '| 2nd | 1/4 | Wolf |',
      '| 4th | 1/2 | Crocodile |',
      '| 8th | 1 | Giant Eagle |',
    ].join('\n');

    const result = tailorToLevel(wildShape, 4);

    expect(result).toContain('| 4th | 1/2 | Crocodile |');
    expect(result).not.toContain('Giant Eagle');
  });

  it('drops a level table, and its heading, when no row is reached', () => {
    const text = 'You gain oath spells.\n\n### Oath Spells\n\n| Paladin Level | Spells |\n| --- | --- |\n| 3rd | sanctuary |';

    expect(tailorToLevel(text, 2)).toBe('You gain oath spells.');
  });

  it('keeps a table that is not about character levels', () => {
    const text = 'You can create slots.\n\n| Spell Slot Level | Sorcery Point Cost |\n| --- | --- |\n| 1st | 2 |\n| 5th | 7 |';

    expect(tailorToLevel(text, 2)).toBe(text);
  });

  it('keeps prerequisites, which say what a later level unlocks', () => {
    const text = 'You learn invocations.\n\n### Ascendant Step\n\nPrerequisite: 9th level\n\nYou can cast levitate at will.';

    expect(tailorToLevel(text, 3)).toBe(text);
  });

  it('returns nothing when the text as a whole is about a later level', () => {
    expect(tailorToLevel('Starting at 14th level, you can overchannel.\n\nIt hurts.', 5)).toBe('');
  });

  it('leaves the text alone without a usable level', () => {
    expect(tailorToLevel(extraAttack, Number.NaN)).toBe(extraAttack);
    expect(tailorToLevel(extraAttack, 0)).toBe(extraAttack);
  });
});
