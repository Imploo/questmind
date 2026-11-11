import type { DndCharacter } from '../schemas/dnd-character.schema';
import { ABILITY_KEYS, AbilityKey, abilityModifier } from './ability-score-validation';

/**
 * Recomputes every value that follows directly from the ability modifiers and the
 * proficiency bonus (D&D 5e, PHB 2014):
 *
 * - saving throws: modifier + proficiency (if proficient) + derivedBonuses.savingThrows
 * - skills: modifier + proficiency (x2 with expertise, half with Jack of All Trades)
 * - initiative: DEX modifier (+ half proficiency with Jack of All Trades) + derivedBonuses.initiative
 * - passive perception: 10 + Perception + derivedBonuses.passivePerception
 * - spell save DC: 8 + proficiency + casting modifier + derivedBonuses.spellSaveDc
 * - spell attack: proficiency + casting modifier + derivedBonuses.spellAttack
 *
 * AC, hit points and weapon attacks depend on equipment and choices the model does
 * not record, so they are left alone.
 */

export const SKILL_ABILITIES: Readonly<Record<string, AbilityKey>> = {
  'acrobatics': 'dexterity',
  'animal handling': 'wisdom',
  'arcana': 'intelligence',
  'athletics': 'strength',
  'deception': 'charisma',
  'history': 'intelligence',
  'insight': 'wisdom',
  'intimidation': 'charisma',
  'investigation': 'intelligence',
  'medicine': 'wisdom',
  'nature': 'intelligence',
  'perception': 'wisdom',
  'performance': 'charisma',
  'persuasion': 'charisma',
  'religion': 'intelligence',
  'sleight of hand': 'dexterity',
  'stealth': 'dexterity',
  'survival': 'wisdom',
};

const SPELLCASTING_ABILITY_BY_CLASS: [RegExp, AbilityKey][] = [
  [/wizard|artificer|eldritch knight|arcane trickster/i, 'intelligence'],
  [/cleric|druid|ranger/i, 'wisdom'],
  [/bard|sorcerer|warlock|paladin/i, 'charisma'],
];

const LABEL: Record<AbilityKey, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

interface Bonus { source: string; amount: number }

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.min(20, Math.max(1, level)) - 1) / 4);
}

export function spellcastingAbility(character: Pick<DndCharacter, 'class' | 'spellcasting'>): AbilityKey | null {
  if (character.spellcasting?.ability) return character.spellcasting.ability;
  return SPELLCASTING_ABILITY_BY_CLASS.find(([pattern]) => pattern.test(character.class ?? ''))?.[1] ?? null;
}

function hasFeature(character: DndCharacter, name: RegExp): boolean {
  return (character.featuresAndTraits ?? []).some(f => name.test(typeof f === 'string' ? f : f.name));
}

const sum = (bonuses: Bonus[] | undefined): number => (bonuses ?? []).reduce((total, b) => total + (b.amount ?? 0), 0);
const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

export interface DerivedStatsResult {
  character: DndCharacter;
  /** Human-readable list of corrected values, e.g. "Initiative +4 -> +2". */
  corrections: string[];
}

/** Returns a new character with all derived values recomputed. The input is not changed. */
export function recalculateDerivedStats(input: DndCharacter): DerivedStatsResult {
  const abilities = input.abilities;
  if (!abilities || ABILITY_KEYS.some(key => !abilities[key])) {
    return { character: input, corrections: [] };
  }

  const character: DndCharacter = structuredClone(input);
  const corrections: string[] = [];
  const pb = proficiencyBonus(character.level);
  const mod = (key: AbilityKey) => abilityModifier(abilities[key].score);
  const jackOfAllTrades = hasFeature(character, /jack of all trades/i);
  const set = (label: string, current: number | undefined, expected: number, apply: (v: number) => void) => {
    if (current !== expected) {
      corrections.push(`${label} ${current === undefined ? '(empty)' : signed(current)} -> ${signed(expected)}`);
      apply(expected);
    }
  };

  // Saving throws
  if (character.savingThrows) {
    const saveBonus = sum(character.derivedBonuses?.savingThrows);
    for (const key of ABILITY_KEYS) {
      const save = character.savingThrows[key];
      if (!save) continue;
      const expected = mod(key) + (save.proficient ? pb : 0) + saveBonus;
      set(`${LABEL[key]} save`, save.modifier, expected, v => (save.modifier = v));
    }
  }

  // Skills. A proficient skill that is exactly at double proficiency is taken as expertise.
  const skillModifier = (name: string): number | null => {
    const ability = SKILL_ABILITIES[name.toLowerCase()];
    if (!ability) return null;
    const skill = (character.skills ?? []).find(s => s.name.toLowerCase() === name.toLowerCase());
    if (skill?.expertise) return mod(ability) + 2 * pb;
    if (skill?.proficient) return mod(ability) + pb;
    return mod(ability) + (jackOfAllTrades ? Math.floor(pb / 2) : 0);
  };
  for (const skill of character.skills ?? []) {
    const ability = SKILL_ABILITIES[skill.name.toLowerCase()];
    if (!ability) continue; // Unknown or homebrew skill: leave as is
    if (skill.proficient && !skill.expertise && skill.modifier === mod(ability) + 2 * pb) {
      skill.expertise = true;
    }
    set(skill.name, skill.modifier, skillModifier(skill.name)!, v => (skill.modifier = v));
  }

  // Initiative (a DEX check, so Jack of All Trades applies)
  set(
    'Initiative',
    character.initiative,
    mod('dexterity') + (jackOfAllTrades ? Math.floor(pb / 2) : 0) + sum(character.derivedBonuses?.initiative),
    v => (character.initiative = v)
  );

  // Passive Wisdom (Perception)
  const passive = 10 + skillModifier('Perception')! + sum(character.derivedBonuses?.passivePerception);
  if (character.passiveWisdom !== passive) {
    corrections.push(`Passive Perception ${character.passiveWisdom ?? '(empty)'} -> ${passive}`);
    character.passiveWisdom = passive;
  }

  // Spellcasting
  const casting = character.spellcasting;
  const castingAbility = casting ? spellcastingAbility(character) : null;
  if (casting && castingAbility) {
    const dc = 8 + pb + mod(castingAbility) + sum(character.derivedBonuses?.spellSaveDc);
    if (casting.spellSaveDc !== dc) {
      corrections.push(`Spell save DC ${casting.spellSaveDc ?? '(empty)'} -> ${dc}`);
      casting.spellSaveDc = dc;
    }
    set('Spell attack', casting.spellAttackBonus, pb + mod(castingAbility) + sum(character.derivedBonuses?.spellAttack),
      v => (casting.spellAttackBonus = v));
  }

  return { character: corrections.length ? character : input, corrections };
}
