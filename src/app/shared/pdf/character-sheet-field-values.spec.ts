import { describe, it, expect } from 'vitest';
import { DndCharacter } from '../models/dnd-character.model';
import {
  APPENDIX_HINT,
  buildSheetFieldValues,
  FEATURES_ON_FIRST_PAGE,
  proficiencyBonus,
  SheetSpell,
  spellcastingAbility,
} from './character-sheet-field-values';
import { SPELL_LEVEL_FIELDS, TEXT_FIELDS, WEAPON_FIELDS } from './character-sheet-template';

function createTestCharacter(overrides: Partial<DndCharacter> = {}): DndCharacter {
  return {
    name: 'Gandara the Wise',
    class: 'Wizard',
    level: 5,
    race: 'High Elf',
    background: 'Sage',
    alignment: 'Neutral Good',
    playerName: 'John',
    experiencePoints: 6500,
    abilities: {
      strength: { score: 8, modifier: -1 },
      dexterity: { score: 14, modifier: 2 },
      constitution: { score: 12, modifier: 1 },
      intelligence: { score: 18, modifier: 4 },
      wisdom: { score: 12, modifier: 1 },
      charisma: { score: 10, modifier: 0 },
    },
    skills: [
      { name: 'Arcana', proficient: true, modifier: 7 },
      { name: 'History', proficient: true, modifier: 7 },
    ],
    savingThrows: {
      strength: { proficient: false, modifier: -1 },
      dexterity: { proficient: false, modifier: 2 },
      constitution: { proficient: false, modifier: 1 },
      intelligence: { proficient: true, modifier: 7 },
      wisdom: { proficient: true, modifier: 4 },
      charisma: { proficient: false, modifier: 0 },
    },
    passiveWisdom: 11,
    proficiencies: ['Daggers', 'Quarterstaffs'],
    languages: ['Common', 'Elvish'],
    armorClass: 12,
    initiative: 2,
    speed: 30,
    hitPoints: { max: 27, current: 20, temp: 3 },
    hitDice: { total: 5, current: 4, die: 'd6' },
    deathSaves: { successes: 1, failures: 2 },
    attacks: [
      { name: 'Quarterstaff', bonus: 2, damage: '1d6-1', type: 'bludgeoning' },
      { name: 'Dagger', bonus: 5, damage: '1d4+2', type: 'piercing' },
      { name: 'Fire Bolt', bonus: 7, damage: '2d10', type: 'fire' },
      { name: 'Ray of Frost', bonus: 7, damage: '2d8', type: 'cold' },
    ],
    spellcasting: {
      spellSaveDc: 15,
      spellAttackBonus: 7,
      slots: [
        { level: 1, total: 4, expended: 1 },
        { level: 2, total: 3, expended: 0 },
        { level: 3, total: 2, expended: 2 },
      ],
      spells: [],
    },
    equipment: ['Quarterstaff', 'Spellbook'],
    coins: { cp: 1, sp: 2, ep: 0, gp: 15, pp: 0 },
    featuresAndTraits: [],
    personalityTraits: 'Curious.',
    backstory: 'Studied at Candlekeep.',
    appearance: { age: '120', eyes: 'Blue', description: 'Tall and thin.' },
    ...overrides,
  };
}

describe('buildSheetFieldValues', () => {
  it('fills the header, abilities and combat stats', () => {
    const { text } = buildSheetFieldValues(createTestCharacter(), [], []);

    expect(text['CharacterName']).toBe('Gandara the Wise');
    expect(text['CharacterName 2']).toBe('Gandara the Wise');
    expect(text['ClassLevel']).toBe('Wizard 5');
    expect(text['Race ']).toBe('High Elf');
    expect(text['XP']).toBe('6500');
    expect(text['INT']).toBe('18');
    expect(text['INTmod']).toBe('+4');
    expect(text['STRmod']).toBe('-1');
    expect(text['CHamod']).toBe('+0');
    expect(text['ProfBonus']).toBe('+3');
    expect(text['AC']).toBe('12');
    expect(text['Initiative']).toBe('+2');
    expect(text['Speed']).toBe('30 ft');
    expect(text['HPMax']).toBe('27');
    expect(text['HPCurrent']).toBe('20');
    expect(text['HPTemp']).toBe('3');
    expect(text['HDTotal']).toBe('5d6');
  });

  it('ticks saving throw, skill and death save boxes', () => {
    const { text, checked } = buildSheetFieldValues(createTestCharacter(), [], []);

    expect(checked).toContain('Check Box 20'); // INT save
    expect(checked).toContain('Check Box 21'); // WIS save
    expect(checked).not.toContain('Check Box 11'); // STR save
    expect(checked).toContain('Check Box 25'); // Arcana
    expect(checked).toContain('Check Box 28'); // History
    expect(checked).toEqual(expect.arrayContaining(['Check Box 12', 'Check Box 15', 'Check Box 16']));
    expect(checked).not.toContain('Check Box 13');
    expect(text['Arcana']).toBe('+7');
    expect(text['Stealth ']).toBe('+2'); // not in skills list: falls back to DEX modifier
  });

  it('puts the first three attacks in the table and the rest in the free-text box', () => {
    const { text } = buildSheetFieldValues(createTestCharacter(), [], []);

    expect(text[WEAPON_FIELDS[0].name]).toBe('Quarterstaff');
    expect(text[WEAPON_FIELDS[2].bonus]).toBe('+7');
    expect(text[WEAPON_FIELDS[1].damage]).toBe('1d4+2 piercing');
    expect(text[TEXT_FIELDS.attacksAndSpellcasting]).toContain('Ray of Frost: +7, 2d8 cold');
    expect(text[TEXT_FIELDS.attacksAndSpellcasting]).toContain('Spell save DC 15');
  });

  it('lists feature names on the sheet with a pointer to the appendix', () => {
    const { text } = buildSheetFieldValues(createTestCharacter(), [], [
      { name: 'Arcane Recovery', description: 'Recover slots' },
      { name: 'Evocation Savant' },
    ]);

    expect(text[TEXT_FIELDS.featuresAndTraits]).toContain('Arcane Recovery');
    expect(text[TEXT_FIELDS.featuresAndTraits]).toContain('Evocation Savant');
    expect(text[TEXT_FIELDS.featuresAndTraits]).toContain(APPENDIX_HINT);
    expect(text[TEXT_FIELDS.featuresAndTraits]).not.toContain('Recover slots');
  });

  it('continues long feature lists on page 2', () => {
    const features = Array.from({ length: FEATURES_ON_FIRST_PAGE + 2 }, (_, i) => ({ name: `Feature ${i + 1}` }));
    const { text } = buildSheetFieldValues(createTestCharacter(), [], features);

    expect(text[TEXT_FIELDS.featuresAndTraits]).toContain(`Feature ${FEATURES_ON_FIRST_PAGE}`);
    expect(text[TEXT_FIELDS.featuresAndTraits]).not.toContain(`Feature ${FEATURES_ON_FIRST_PAGE + 1}`);
    expect(text[TEXT_FIELDS.additionalFeatures]).toContain(`Feature ${FEATURES_ON_FIRST_PAGE + 2}`);
  });

  it('fills the spell page per level, with slots', () => {
    const spells: SheetSpell[] = [
      { name: 'Fire Bolt', level: 0 },
      { name: 'Mage Hand', level: 0 },
      { name: 'Shield', level: 1 },
      { name: 'Misty Step', level: 2 },
      { name: 'Fireball', level: 3 },
    ];
    const { text } = buildSheetFieldValues(createTestCharacter(), spells, []);
    const level = (n: number) => SPELL_LEVEL_FIELDS[n];

    expect(text[TEXT_FIELDS.spellcastingClass]).toBe('Wizard');
    expect(text[TEXT_FIELDS.spellcastingAbility]).toBe('INT');
    expect(text[TEXT_FIELDS.spellSaveDc]).toBe('15');
    expect(text[TEXT_FIELDS.spellAttackBonus]).toBe('+7');
    expect(text[level(0).lines[0]]).toBe('Fire Bolt');
    expect(text[level(0).lines[1]]).toBe('Mage Hand');
    expect(text[level(1).lines[0]]).toBe('Shield');
    expect(text[level(2).lines[0]]).toBe('Misty Step');
    expect(text[level(3).lines[0]]).toBe('Fireball');
    expect(text[level(1).slotsTotal!]).toBe('4');
    expect(text[level(1).slotsExpended!]).toBe('1'); // 4 total, 1 expended
    expect(text[level(2).slotsExpended!]).toBe(''); // none expended: left blank for pencil marks
    expect(text[level(3).slotsExpended!]).toBe('2');
    expect(text[level(4).slotsTotal!]).toBeUndefined();
  });

  it('mentions spells without a known level or without a free line in the free-text box', () => {
    const cantrips = Array.from({ length: SPELL_LEVEL_FIELDS[0].lines.length + 1 }, (_, i) => ({ name: `Cantrip ${i}`, level: 0 }));
    const { text } = buildSheetFieldValues(createTestCharacter(), [...cantrips, { name: 'Homebrew Zap' }], []);

    expect(text[TEXT_FIELDS.attacksAndSpellcasting]).toContain(`Other spells: Cantrip ${cantrips.length - 1}, Homebrew Zap`);
  });

  it('leaves the spell page empty for non-casters', () => {
    const { text } = buildSheetFieldValues(createTestCharacter({ class: 'Fighter', spellcasting: undefined }), [], []);
    expect(text[TEXT_FIELDS.spellcastingClass]).toBeUndefined();
  });

  it('combines appearance description and backstory', () => {
    const { text } = buildSheetFieldValues(createTestCharacter(), [], []);
    expect(text[TEXT_FIELDS.backstory]).toBe('Tall and thin.\n\nStudied at Candlekeep.');
  });
});

describe('proficiencyBonus', () => {
  it.each([[1, 2], [4, 2], [5, 3], [9, 4], [13, 5], [17, 6], [20, 6]])('level %i -> +%i', (level, bonus) => {
    expect(proficiencyBonus(level)).toBe(bonus);
  });
});

describe('spellcastingAbility', () => {
  it('derives the ability from the class', () => {
    expect(spellcastingAbility('Wizard')).toBe('INT');
    expect(spellcastingAbility('Cleric')).toBe('WIS');
    expect(spellcastingAbility('Warlock')).toBe('CHA');
    expect(spellcastingAbility('Fighter')).toBe('');
  });
});
