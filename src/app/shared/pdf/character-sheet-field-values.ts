import { DndCharacter, SpellSlot } from '../models/dnd-character.model';
import {
  ABILITY_FIELDS,
  AbilityKey,
  DEATH_SAVE_FAILURE_FIELDS,
  DEATH_SAVE_SUCCESS_FIELDS,
  SKILL_FIELDS,
  SPELL_LEVEL_FIELDS,
  TEXT_FIELDS,
  WEAPON_FIELDS,
} from './character-sheet-template';

/** A spell as it goes on the sheet: always an object, with the level looked up where possible. */
export interface SheetSpell {
  name: string;
  level?: number;
  school?: string;
  description?: string;
  usage?: string;
}

export interface SheetFeature {
  name: string;
  description?: string;
  source?: string;
}

export interface SheetFieldValues {
  /** Text field name -> value. */
  text: Record<string, string>;
  /** Checkbox field names to tick. */
  checked: string[];
}

/** Feature names that fit in page 1's Features & Traits box; the rest go to page 2. */
export const FEATURES_ON_FIRST_PAGE = 30;

export const APPENDIX_HINT = 'Full descriptions: see the pages at the end of this sheet.';

const SPELLCASTING_ABILITY_BY_CLASS: [RegExp, string][] = [
  [/wizard|artificer|eldritch knight|arcane trickster/i, 'INT'],
  [/cleric|druid|ranger/i, 'WIS'],
  [/bard|sorcerer|warlock|paladin/i, 'CHA'],
];

const signed = (n: number | undefined): string => {
  const value = n ?? 0;
  return value >= 0 ? `+${value}` : `${value}`;
};

const str = (value: string | number | undefined | null): string =>
  value === undefined || value === null ? '' : `${value}`;

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function spellcastingAbility(characterClass: string): string {
  return SPELLCASTING_ABILITY_BY_CLASS.find(([pattern]) => pattern.test(characterClass))?.[1] ?? '';
}

export function normalizeSpellSlots(slots: SpellSlot[] | Record<string, unknown> | undefined): SpellSlot[] {
  if (!slots) return [];
  if (Array.isArray(slots)) return [...slots].sort((a, b) => a.level - b.level);
  return Object.entries(slots)
    .map(([level, data]) => {
      const slotData = data as { total?: number; expended?: number };
      return { level: parseInt(level, 10), total: slotData.total || 0, expended: slotData.expended || 0 };
    })
    .filter(slot => !Number.isNaN(slot.level))
    .sort((a, b) => a.level - b.level);
}

/** Maps a character onto the fields of the official sheet. Pure: no PDF or network access. */
export function buildSheetFieldValues(
  c: DndCharacter,
  spells: SheetSpell[],
  features: SheetFeature[]
): SheetFieldValues {
  const text: Record<string, string> = {};
  const checked: string[] = [];

  // Page 1: header
  text[TEXT_FIELDS.characterName] = c.name;
  text[TEXT_FIELDS.characterName2] = c.name;
  text[TEXT_FIELDS.classLevel] = `${c.class} ${c.level}`;
  text[TEXT_FIELDS.background] = str(c.background);
  text[TEXT_FIELDS.playerName] = str(c.playerName);
  text[TEXT_FIELDS.race] = c.race;
  text[TEXT_FIELDS.alignment] = str(c.alignment);
  text[TEXT_FIELDS.xp] = str(c.experiencePoints);

  // Abilities and saving throws
  for (const [key, fields] of Object.entries(ABILITY_FIELDS) as [AbilityKey, (typeof ABILITY_FIELDS)[AbilityKey]][]) {
    text[fields.score] = str(c.abilities[key]?.score);
    text[fields.modifier] = signed(c.abilities[key]?.modifier);
    text[fields.save] = signed(c.savingThrows[key]?.modifier);
    if (c.savingThrows[key]?.proficient) checked.push(fields.saveProficient);
  }
  text[TEXT_FIELDS.proficiencyBonus] = signed(proficiencyBonus(c.level));

  // Skills
  for (const skill of SKILL_FIELDS) {
    const own = c.skills.find(s => s.name.toLowerCase() === skill.name.toLowerCase());
    text[skill.field] = signed(own ? own.modifier : c.abilities[skill.ability]?.modifier);
    if (own?.proficient) checked.push(skill.proficient);
  }
  text[TEXT_FIELDS.passivePerception] = str(c.passiveWisdom);

  // Combat
  text[TEXT_FIELDS.armorClass] = str(c.armorClass);
  text[TEXT_FIELDS.initiative] = signed(c.initiative);
  text[TEXT_FIELDS.speed] = `${c.speed} ft`;
  text[TEXT_FIELDS.hpMax] = str(c.hitPoints.max);
  text[TEXT_FIELDS.hpCurrent] = str(c.hitPoints.current);
  text[TEXT_FIELDS.hpTemp] = c.hitPoints.temp ? str(c.hitPoints.temp) : '';
  text[TEXT_FIELDS.hitDiceTotal] = `${c.hitDice.total}${c.hitDice.die}`;
  text[TEXT_FIELDS.hitDice] = `${c.hitDice.current}${c.hitDice.die}`;
  DEATH_SAVE_SUCCESS_FIELDS.slice(0, c.deathSaves?.successes ?? 0).forEach(f => checked.push(f));
  DEATH_SAVE_FAILURE_FIELDS.slice(0, c.deathSaves?.failures ?? 0).forEach(f => checked.push(f));

  // Attacks: the first three get the table rows, the rest the free-text box
  const attackLine = (a: DndCharacter['attacks'][number]) => `${a.name}: ${signed(a.bonus)}, ${`${a.damage ?? ''} ${a.type ?? ''}`.trim()}`;
  c.attacks.slice(0, WEAPON_FIELDS.length).forEach((attack, i) => {
    text[WEAPON_FIELDS[i].name] = attack.name;
    text[WEAPON_FIELDS[i].bonus] = signed(attack.bonus);
    text[WEAPON_FIELDS[i].damage] = `${attack.damage ?? ''} ${attack.type ?? ''}`.trim();
  });
  const attackNotes: string[] = c.attacks.slice(WEAPON_FIELDS.length).map(attackLine);
  if (c.spellcasting) {
    const parts: string[] = [];
    if (c.spellcasting.spellSaveDc) parts.push(`Spell save DC ${c.spellcasting.spellSaveDc}`);
    if (c.spellcasting.spellAttackBonus !== undefined) parts.push(`spell attack ${signed(c.spellcasting.spellAttackBonus)}`);
    if (parts.length) attackNotes.push(`${parts.join(', ')} (see spell sheet)`);
  }
  text[TEXT_FIELDS.attacksAndSpellcasting] = attackNotes.join('\n');

  // Personality
  text[TEXT_FIELDS.personalityTraits] = str(c.personalityTraits);
  text[TEXT_FIELDS.ideals] = str(c.ideals);
  text[TEXT_FIELDS.bonds] = str(c.bonds);
  text[TEXT_FIELDS.flaws] = str(c.flaws);

  // Proficiencies, equipment, coins
  const profLines: string[] = [];
  if (c.languages.length) profLines.push(`Languages: ${c.languages.join(', ')}`);
  if (c.proficiencies.length) profLines.push(`Proficiencies: ${c.proficiencies.join(', ')}`);
  text[TEXT_FIELDS.proficienciesAndLanguages] = profLines.join('\n\n');
  text[TEXT_FIELDS.equipment] = c.equipment.join('\n');
  text[TEXT_FIELDS.cp] = str(c.coins.cp);
  text[TEXT_FIELDS.sp] = str(c.coins.sp);
  text[TEXT_FIELDS.ep] = str(c.coins.ep);
  text[TEXT_FIELDS.gp] = str(c.coins.gp);
  text[TEXT_FIELDS.pp] = str(c.coins.pp);

  // Features: names on the sheet, descriptions in the appendix
  const featureNames = features.map(f => `• ${f.name}`);
  const hint = features.length ? `\n\n${APPENDIX_HINT}` : '';
  if (featureNames.length > FEATURES_ON_FIRST_PAGE) {
    text[TEXT_FIELDS.featuresAndTraits] = `${featureNames.slice(0, FEATURES_ON_FIRST_PAGE).join('\n')}\n(continued on page 2)`;
    text[TEXT_FIELDS.additionalFeatures] = featureNames.slice(FEATURES_ON_FIRST_PAGE).join('\n') + hint;
  } else {
    text[TEXT_FIELDS.featuresAndTraits] = featureNames.join('\n') + hint;
  }

  // Page 2: appearance and backstory
  const a = c.appearance;
  text[TEXT_FIELDS.age] = str(a?.age);
  text[TEXT_FIELDS.height] = str(a?.height);
  text[TEXT_FIELDS.weight] = str(a?.weight);
  text[TEXT_FIELDS.eyes] = str(a?.eyes);
  text[TEXT_FIELDS.skin] = str(a?.skin);
  text[TEXT_FIELDS.hair] = str(a?.hair);
  text[TEXT_FIELDS.backstory] = [a?.description, c.backstory].filter(Boolean).join('\n\n');

  // Page 3: spellcasting
  if (c.spellcasting) {
    fillSpellPage(c, spells, text);
  }

  return { text, checked };
}

function fillSpellPage(c: DndCharacter, spells: SheetSpell[], text: Record<string, string>): void {
  const sc = c.spellcasting!;
  text[TEXT_FIELDS.spellcastingClass] = c.class;
  text[TEXT_FIELDS.spellcastingAbility] = sc.ability ? sc.ability.slice(0, 3).toUpperCase() : spellcastingAbility(c.class);
  text[TEXT_FIELDS.spellSaveDc] = str(sc.spellSaveDc);
  text[TEXT_FIELDS.spellAttackBonus] = sc.spellAttackBonus !== undefined ? signed(sc.spellAttackBonus) : '';

  const slots = normalizeSpellSlots(sc.slots);
  const unplaced: string[] = [];
  for (const levelFields of SPELL_LEVEL_FIELDS) {
    const slot = slots.find(s => s.level === levelFields.level);
    if (slot && slot.total > 0 && levelFields.slotsTotal && levelFields.slotsExpended) {
      text[levelFields.slotsTotal] = str(slot.total);
      // The sheet labels this column "Slots Expended"; leave it blank when none are used.
      text[levelFields.slotsExpended] = slot.expended > 0 ? str(slot.expended) : '';
    }
    const atLevel = spells.filter(s => s.level === levelFields.level);
    atLevel.slice(0, levelFields.lines.length).forEach((spell, i) => (text[levelFields.lines[i]] = spell.name));
    unplaced.push(...atLevel.slice(levelFields.lines.length).map(s => s.name));
  }
  unplaced.push(...spells.filter(s => s.level === undefined || s.level < 0 || s.level > 9).map(s => s.name));

  if (unplaced.length) {
    const box = TEXT_FIELDS.attacksAndSpellcasting;
    text[box] = [text[box], `Other spells: ${unplaced.join(', ')}`].filter(Boolean).join('\n');
  }
}
