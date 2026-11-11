import { describe, it, expect } from 'vitest';
import type { DndCharacter } from '../schemas/dnd-character.schema';
import { proficiencyBonus, recalculateDerivedStats, spellcastingAbility } from './derived-stats';

const ability = (score: number) => ({ score, modifier: Math.floor((score - 10) / 2) });

/** Level 5 (PB +3) wizard with every derived value already correct. */
function wizard(overrides: Partial<DndCharacter> = {}): DndCharacter {
  return {
    name: 'Gandara', class: 'Wizard', level: 5, race: 'High Elf', experiencePoints: 6500,
    abilities: {
      strength: ability(8), dexterity: ability(14), constitution: ability(12),
      intelligence: ability(18), wisdom: ability(13), charisma: ability(10),
    },
    savingThrows: {
      strength: { proficient: false, modifier: -1 },
      dexterity: { proficient: false, modifier: 2 },
      constitution: { proficient: false, modifier: 1 },
      intelligence: { proficient: true, modifier: 7 },
      wisdom: { proficient: true, modifier: 4 },
      charisma: { proficient: false, modifier: 0 },
    },
    skills: [
      { name: 'Arcana', proficient: true, modifier: 7 },
      { name: 'Perception', proficient: true, modifier: 4 },
      { name: 'Stealth', proficient: false, modifier: 2 },
    ],
    passiveWisdom: 14,
    initiative: 2,
    spellcasting: { spellSaveDc: 15, spellAttackBonus: 7, spells: [] },
    proficiencies: [], languages: [], armorClass: 12, speed: 30,
    hitPoints: { max: 27, current: 27, temp: 0 }, hitDice: { total: 5, current: 5, die: 'd6' },
    deathSaves: { successes: 0, failures: 0 }, attacks: [], equipment: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, featuresAndTraits: [],
    ...overrides,
  };
}

describe('proficiencyBonus', () => {
  it.each([[1, 2], [4, 2], [5, 3], [8, 3], [9, 4], [13, 5], [17, 6], [20, 6]])('level %i -> +%i', (level, pb) => {
    expect(proficiencyBonus(level)).toBe(pb);
  });
});

describe('spellcastingAbility', () => {
  it('prefers the explicit ability, then derives it from the class', () => {
    expect(spellcastingAbility({ class: 'Fighter', spellcasting: { ability: 'intelligence' } })).toBe('intelligence');
    expect(spellcastingAbility({ class: 'Cleric', spellcasting: {} })).toBe('wisdom');
    expect(spellcastingAbility({ class: 'Fighter', spellcasting: {} })).toBeNull();
  });
});

describe('recalculateDerivedStats', () => {
  it('leaves a correct character untouched', () => {
    const input = wizard();
    const { character, corrections } = recalculateDerivedStats(input);
    expect(corrections).toEqual([]);
    expect(character).toBe(input);
  });

  it('recalculates everything after an ability score change, without changing the input', () => {
    const input = wizard();
    input.abilities.intelligence = ability(20); // +5
    input.abilities.wisdom = ability(15); // +2
    input.abilities.dexterity = ability(16); // +3

    const { character, corrections } = recalculateDerivedStats(input);

    expect(character.savingThrows.intelligence.modifier).toBe(8);
    expect(character.savingThrows.wisdom.modifier).toBe(5);
    expect(character.savingThrows.dexterity.modifier).toBe(3);
    expect(character.skills.find(s => s.name === 'Arcana')!.modifier).toBe(8);
    expect(character.skills.find(s => s.name === 'Stealth')!.modifier).toBe(3);
    expect(character.initiative).toBe(3);
    expect(character.passiveWisdom).toBe(15);
    expect(character.spellcasting!.spellSaveDc).toBe(16);
    expect(character.spellcasting!.spellAttackBonus).toBe(8);
    expect(corrections).toContain('INT save +7 -> +8');
    expect(corrections).toContain('Initiative +2 -> +3');
    expect(corrections).toContain('Passive Perception 14 -> 15');
    expect(corrections).toContain('Spell save DC 15 -> 16');
    expect(input.initiative).toBe(2);
  });

  it('follows the proficiency bonus when the level changes', () => {
    const { character } = recalculateDerivedStats(wizard({ level: 9 })); // PB +4
    expect(character.savingThrows.intelligence.modifier).toBe(8);
    expect(character.skills.find(s => s.name === 'Arcana')!.modifier).toBe(8);
    expect(character.spellcasting!.spellSaveDc).toBe(16);
  });

  it('keeps expertise, and recognises it from a double-proficiency modifier', () => {
    const { character, corrections } = recalculateDerivedStats(wizard({
      skills: [
        { name: 'Arcana', proficient: true, expertise: true, modifier: 7 }, // should be 4 + 6
        { name: 'History', proficient: true, modifier: 10 }, // already at expertise
      ],
    }));
    expect(character.skills[0].modifier).toBe(10);
    expect(character.skills[1]).toMatchObject({ modifier: 10, expertise: true });
    expect(corrections).toContain('Arcana +7 -> +10');
    expect(corrections).not.toContainEqual(expect.stringContaining('History'));
  });

  it('applies Jack of All Trades to non-proficient skills and initiative', () => {
    const { character } = recalculateDerivedStats(wizard({
      class: 'Bard',
      featuresAndTraits: [{ name: 'Jack of All Trades', description: '' }],
    }));
    expect(character.skills.find(s => s.name === 'Stealth')!.modifier).toBe(3); // 2 + floor(3/2)
    expect(character.skills.find(s => s.name === 'Arcana')!.modifier).toBe(7); // proficient: unchanged
    expect(character.initiative).toBe(3);
  });

  it('adds declared bonuses', () => {
    const bonus = (amount: number) => [{ source: 'Test', amount }];
    const { character } = recalculateDerivedStats(wizard({
      derivedBonuses: {
        initiative: bonus(5), passivePerception: bonus(5), savingThrows: bonus(1), spellSaveDc: bonus(1), spellAttack: bonus(1),
      },
    }));
    expect(character.initiative).toBe(7);
    expect(character.passiveWisdom).toBe(19);
    expect(character.savingThrows.strength.modifier).toBe(0);
    expect(character.spellcasting!.spellSaveDc).toBe(16);
    expect(character.spellcasting!.spellAttackBonus).toBe(8);
  });

  it('computes passive perception without a Perception entry', () => {
    const { character } = recalculateDerivedStats(wizard({ skills: [], passiveWisdom: 99 }));
    expect(character.passiveWisdom).toBe(11);
  });

  it('leaves homebrew skills and non-casters alone', () => {
    const { character } = recalculateDerivedStats(wizard({
      class: 'Fighter',
      skills: [{ name: 'Cooking', proficient: true, modifier: 9 }],
      spellcasting: { spellSaveDc: 99 },
    }));
    expect(character.skills[0].modifier).toBe(9);
    expect(character.spellcasting!.spellSaveDc).toBe(99);
  });

  it('does nothing without complete ability scores', () => {
    const input = { name: 'Partial' } as DndCharacter;
    expect(recalculateDerivedStats(input)).toEqual({ character: input, corrections: [] });
  });
});
