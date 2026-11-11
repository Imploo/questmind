import { describe, it, expect } from 'vitest';
import type { DndCharacter } from '../schemas/dnd-character.schema';
import {
  abilityModifier,
  abilityScoresChanged,
  fixAbilityModifiers,
  formatAbilityFeedback,
  pointBuyCost,
  validateAbilityScores,
} from './ability-score-validation';

type Abilities = DndCharacter['abilities'];
interface Bonus { source: string; amount: number }

/** Ability entry from base + bonuses, with a correct score and modifier. */
function ab(base: number, ...bonuses: Bonus[]) {
  const score = base + bonuses.reduce((sum, b) => sum + b.amount, 0);
  return { base, bonuses, score, modifier: abilityModifier(score) };
}
const race = (amount: number): Bonus => ({ source: 'Race', amount });

function chr(abilities: Partial<Abilities>, method?: DndCharacter['abilityScoreMethod']) {
  return { abilities: abilities as Abilities, abilityScoreMethod: method };
}

// Hill dwarf cleric on point buy: 27 points exactly.
const validPointBuy = (): Abilities => ({
  strength: ab(14),
  dexterity: ab(8),
  constitution: ab(15, race(2)),
  intelligence: ab(8),
  wisdom: ab(15, race(1)),
  charisma: ab(10),
});

describe('abilityModifier', () => {
  it.each([[1, -5], [8, -1], [9, -1], [10, 0], [11, 0], [15, 2], [17, 3], [20, 5], [30, 10]])('score %i -> %i', (score, mod) => {
    expect(abilityModifier(score)).toBe(mod);
  });
});

describe('pointBuyCost', () => {
  it('sums the PHB costs', () => {
    expect(pointBuyCost([15, 15, 15, 8, 8, 8])).toBe(27);
    expect(pointBuyCost([14, 14, 14, 12, 10, 8])).toBe(27);
    expect(pointBuyCost([8, 8, 8, 8, 8, 8])).toBe(0);
  });

  it('returns null for a base outside 8-15', () => {
    expect(pointBuyCost([16, 8, 8, 8, 8, 8])).toBeNull();
    expect(pointBuyCost([7, 8, 8, 8, 8, 8])).toBeNull();
  });
});

describe('validateAbilityScores', () => {
  it('accepts a legal point buy', () => {
    expect(validateAbilityScores(chr(validPointBuy(), 'pointBuy'))).toEqual([]);
  });

  it('accepts a point buy that leaves points unspent', () => {
    expect(validateAbilityScores(chr({ ...validPointBuy(), strength: ab(8) }, 'pointBuy'))).toEqual([]);
  });

  it('rejects a point buy over 27 points, with the breakdown', () => {
    const issues = validateAbilityScores(chr({ ...validPointBuy(), charisma: ab(14) }, 'pointBuy'));
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('pointBuyBudget');
    expect(issues[0].message).toContain('32 points');
    expect(issues[0].message).toContain('CHA 14 (7)');
  });

  it('rejects point buy bases outside 8-15', () => {
    const issues = validateAbilityScores(chr({ ...validPointBuy(), strength: ab(16), dexterity: ab(7) }, 'pointBuy'));
    expect(issues.filter(i => i.code === 'baseOutOfRange').map(i => i.ability)).toEqual(['strength', 'dexterity']);
  });

  it('requires a base for every ability under point buy', () => {
    const abilities = validPointBuy();
    const withoutBase = { score: abilities.wisdom.score, modifier: abilities.wisdom.modifier };
    const issues = validateAbilityScores(chr({ ...abilities, wisdom: withoutBase }, 'pointBuy'));
    expect(issues).toEqual([expect.objectContaining({ code: 'missingBase', message: expect.stringContaining('WIS') })]);
  });

  it('flags bonuses that do not add up to the score, for any method', () => {
    const abilities = { ...validPointBuy(), constitution: { ...ab(15, race(2)), score: 16, modifier: 3 } };
    for (const method of ['pointBuy', 'rolled', undefined] as const) {
      const issues = validateAbilityScores(chr(abilities, method));
      expect(issues).toEqual([expect.objectContaining({ code: 'bonusMismatch', ability: 'constitution' })]);
      expect(issues[0].message).toBe('CON: base 15 +2 (Race) = 17, but the score is 16.');
    }
  });

  it('accepts the standard array in any order and rejects anything else', () => {
    const array: Abilities = {
      strength: ab(8), dexterity: ab(14, race(2)), constitution: ab(13), intelligence: ab(15, race(1)), wisdom: ab(12), charisma: ab(10),
    };
    expect(validateAbilityScores(chr(array, 'standardArray'))).toEqual([]);
    const issues = validateAbilityScores(chr({ ...array, strength: ab(15) }, 'standardArray'));
    expect(issues).toEqual([expect.objectContaining({ code: 'standardArray' })]);
  });

  it('does not apply point buy limits to rolled scores', () => {
    const rolled: Abilities = { ...validPointBuy(), strength: ab(18), dexterity: ab(3) };
    expect(validateAbilityScores(chr(rolled, 'rolled'))).toEqual([]);
  });

  it('tolerates characters without abilities or bases', () => {
    expect(validateAbilityScores({ abilities: undefined as unknown as Abilities })).toEqual([]);
    expect(validateAbilityScores(chr({ strength: { score: 12, modifier: 1 } }))).toEqual([]);
  });
});

describe('fixAbilityModifiers', () => {
  it('recomputes wrong modifiers without changing the input', () => {
    const abilities = { ...validPointBuy(), strength: { ...ab(14), modifier: 3 } };
    const input = chr(abilities, 'pointBuy');
    const { character, fixes } = fixAbilityModifiers(input);

    expect(character.abilities.strength.modifier).toBe(2);
    expect(fixes).toEqual(['STR modifier 3 -> 2']);
    expect(input.abilities.strength.modifier).toBe(3);
  });

  it('returns the same object when nothing is wrong', () => {
    const input = chr(validPointBuy(), 'pointBuy');
    expect(fixAbilityModifiers(input).character).toBe(input);
  });
});

describe('abilityScoresChanged', () => {
  it('detects changes to scores, bases, bonuses and method', () => {
    const before = chr(validPointBuy(), 'pointBuy');
    expect(abilityScoresChanged(before, chr(validPointBuy(), 'pointBuy'))).toBe(false);
    expect(abilityScoresChanged(before, chr({ ...validPointBuy(), strength: ab(15) }, 'pointBuy'))).toBe(true);
    expect(abilityScoresChanged(before, chr({ ...validPointBuy(), strength: ab(12, race(2)) }, 'pointBuy'))).toBe(true);
    expect(abilityScoresChanged(before, chr(validPointBuy(), 'rolled'))).toBe(true);
    expect(abilityScoresChanged(undefined, before)).toBe(true);
  });
});

describe('formatAbilityFeedback', () => {
  it('lists every issue and restates the rules', () => {
    const text = formatAbilityFeedback([
      { code: 'pointBuyBudget', message: 'Point buy costs 32 points, the maximum is 27.' },
      { code: 'bonusMismatch', ability: 'constitution', message: 'CON: base 15 +2 (Race) = 17, but the score is 16.' },
    ]);
    expect(text).toContain('- Point buy costs 32 points, the maximum is 27.');
    expect(text).toContain('- CON: base 15 +2 (Race) = 17, but the score is 16.');
    expect(text).toContain('COMPLETE character JSON');
    expect(text).toContain('14=7, 15=9');
  });
});
