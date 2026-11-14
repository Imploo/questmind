/**
 * Field map of the official, form-fillable D&D 5e character sheet
 * (public/templates/dnd-5e-character-sheet.pdf, from
 * https://media.dndbeyond.com/compendium-images/marketing/dnd_5e_charactersheet_formfillable.pdf).
 *
 * The field names come from the PDF and are not tidy. Some have trailing spaces
 * ("Race ", "DEXmod "), one has a lowercase letter ("CHamod"), and the spell
 * lines and checkboxes are not numbered top to bottom. The spell lines below were
 * sorted by their position on the page, so they are listed top to bottom.
 * `character-sheet-template.spec.ts` checks every name against the real template.
 */

export const CHARACTER_SHEET_TEMPLATE_URL = '/templates/dnd-5e-character-sheet.pdf';

/** Page 2's "Character Appearance" box: a button field that shows a picture. */
export const CHARACTER_IMAGE_FIELD = 'CHARACTER IMAGE';

export type AbilityKey = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

export const ABILITY_FIELDS: Record<AbilityKey, { score: string; modifier: string; save: string; saveProficient: string }> = {
  strength: { score: 'STR', modifier: 'STRmod', save: 'ST Strength', saveProficient: 'Check Box 11' },
  dexterity: { score: 'DEX', modifier: 'DEXmod ', save: 'ST Dexterity', saveProficient: 'Check Box 18' },
  constitution: { score: 'CON', modifier: 'CONmod', save: 'ST Constitution', saveProficient: 'Check Box 19' },
  intelligence: { score: 'INT', modifier: 'INTmod', save: 'ST Intelligence', saveProficient: 'Check Box 20' },
  wisdom: { score: 'WIS', modifier: 'WISmod', save: 'ST Wisdom', saveProficient: 'Check Box 21' },
  charisma: { score: 'CHA', modifier: 'CHamod', save: 'ST Charisma', saveProficient: 'Check Box 22' },
};

/** All 18 skills in sheet order, with their modifier field and proficiency checkbox. */
export const SKILL_FIELDS: { name: string; ability: AbilityKey; field: string; proficient: string }[] = [
  { name: 'Acrobatics', ability: 'dexterity', field: 'Acrobatics', proficient: 'Check Box 23' },
  { name: 'Animal Handling', ability: 'wisdom', field: 'Animal', proficient: 'Check Box 24' },
  { name: 'Arcana', ability: 'intelligence', field: 'Arcana', proficient: 'Check Box 25' },
  { name: 'Athletics', ability: 'strength', field: 'Athletics', proficient: 'Check Box 26' },
  { name: 'Deception', ability: 'charisma', field: 'Deception ', proficient: 'Check Box 27' },
  { name: 'History', ability: 'intelligence', field: 'History ', proficient: 'Check Box 28' },
  { name: 'Insight', ability: 'wisdom', field: 'Insight', proficient: 'Check Box 29' },
  { name: 'Intimidation', ability: 'charisma', field: 'Intimidation', proficient: 'Check Box 30' },
  { name: 'Investigation', ability: 'intelligence', field: 'Investigation ', proficient: 'Check Box 31' },
  { name: 'Medicine', ability: 'wisdom', field: 'Medicine', proficient: 'Check Box 32' },
  { name: 'Nature', ability: 'intelligence', field: 'Nature', proficient: 'Check Box 33' },
  { name: 'Perception', ability: 'wisdom', field: 'Perception ', proficient: 'Check Box 34' },
  { name: 'Performance', ability: 'charisma', field: 'Performance', proficient: 'Check Box 35' },
  { name: 'Persuasion', ability: 'charisma', field: 'Persuasion', proficient: 'Check Box 36' },
  { name: 'Religion', ability: 'intelligence', field: 'Religion', proficient: 'Check Box 37' },
  { name: 'Sleight of Hand', ability: 'dexterity', field: 'SleightofHand', proficient: 'Check Box 38' },
  { name: 'Stealth', ability: 'dexterity', field: 'Stealth ', proficient: 'Check Box 39' },
  { name: 'Survival', ability: 'wisdom', field: 'Survival', proficient: 'Check Box 40' },
];

export const WEAPON_FIELDS: { name: string; bonus: string; damage: string }[] = [
  { name: 'Wpn Name', bonus: 'Wpn1 AtkBonus', damage: 'Wpn1 Damage' },
  { name: 'Wpn Name 2', bonus: 'Wpn2 AtkBonus ', damage: 'Wpn2 Damage ' },
  { name: 'Wpn Name 3', bonus: 'Wpn3 AtkBonus  ', damage: 'Wpn3 Damage ' },
];

export const DEATH_SAVE_SUCCESS_FIELDS = ['Check Box 12', 'Check Box 13', 'Check Box 14'];
export const DEATH_SAVE_FAILURE_FIELDS = ['Check Box 15', 'Check Box 16', 'Check Box 17'];

/** Plain one-to-one text fields of pages 1 and 2. */
export const TEXT_FIELDS = {
  characterName: 'CharacterName',
  characterName2: 'CharacterName 2',
  classLevel: 'ClassLevel',
  background: 'Background',
  playerName: 'PlayerName',
  race: 'Race ',
  alignment: 'Alignment',
  xp: 'XP',
  proficiencyBonus: 'ProfBonus',
  passivePerception: 'Passive',
  armorClass: 'AC',
  initiative: 'Initiative',
  speed: 'Speed',
  hpMax: 'HPMax',
  hpCurrent: 'HPCurrent',
  hpTemp: 'HPTemp',
  hitDiceTotal: 'HDTotal',
  hitDice: 'HD',
  personalityTraits: 'PersonalityTraits ',
  ideals: 'Ideals',
  bonds: 'Bonds',
  flaws: 'Flaws',
  attacksAndSpellcasting: 'AttacksSpellcasting',
  proficienciesAndLanguages: 'ProficienciesLang',
  equipment: 'Equipment',
  featuresAndTraits: 'Features and Traits',
  cp: 'CP',
  sp: 'SP',
  ep: 'EP',
  gp: 'GP',
  pp: 'PP',
  age: 'Age',
  height: 'Height',
  weight: 'Weight',
  eyes: 'Eyes',
  skin: 'Skin',
  hair: 'Hair',
  backstory: 'Backstory',
  additionalFeatures: 'Feat+Traits',
  spellcastingClass: 'Spellcasting Class 2',
  spellcastingAbility: 'SpellcastingAbility 2',
  spellSaveDc: 'SpellSaveDC  2',
  spellAttackBonus: 'SpellAtkBonus 2',
} as const;

/** Multi-line fields get an explicit font size that fits their text (the template's "auto" size is too large). */
export const MULTILINE_FIELDS: readonly string[] = [
  TEXT_FIELDS.personalityTraits,
  TEXT_FIELDS.ideals,
  TEXT_FIELDS.bonds,
  TEXT_FIELDS.flaws,
  TEXT_FIELDS.attacksAndSpellcasting,
  TEXT_FIELDS.proficienciesAndLanguages,
  TEXT_FIELDS.equipment,
  TEXT_FIELDS.featuresAndTraits,
  TEXT_FIELDS.backstory,
  TEXT_FIELDS.additionalFeatures,
];

export interface SpellLevelFields {
  /** Spell level, 0 = cantrips. */
  level: number;
  /** "SlotsTotal N" / "SlotsRemaining N"; cantrips have none. Despite its name, the sheet labels the second "Slots Expended". */
  slotsTotal?: string;
  slotsExpended?: string;
  /** Spell name lines, top to bottom. */
  lines: string[];
}

/** Page 3 (spellcasting), per spell level. */
export const SPELL_LEVEL_FIELDS: SpellLevelFields[] = [
  {
    level: 0,
    lines: ['Spells 1014', 'Spells 1016', 'Spells 1017', 'Spells 1018', 'Spells 1019', 'Spells 1020', 'Spells 1021', 'Spells 1022'],
  },
  {
    level: 1, slotsTotal: 'SlotsTotal 19', slotsExpended: 'SlotsRemaining 19',
    lines: ['Spells 1015', 'Spells 1023', 'Spells 1024', 'Spells 1025', 'Spells 1026', 'Spells 1027', 'Spells 1028',
      'Spells 1029', 'Spells 1030', 'Spells 1031', 'Spells 1032', 'Spells 1033'],
  },
  {
    level: 2, slotsTotal: 'SlotsTotal 20', slotsExpended: 'SlotsRemaining 20',
    lines: ['Spells 1046', 'Spells 1034', 'Spells 1035', 'Spells 1036', 'Spells 1037', 'Spells 1038', 'Spells 1039',
      'Spells 1040', 'Spells 1041', 'Spells 1042', 'Spells 1043', 'Spells 1044', 'Spells 1045'],
  },
  {
    level: 3, slotsTotal: 'SlotsTotal 21', slotsExpended: 'SlotsRemaining 21',
    lines: ['Spells 1048', 'Spells 1047', 'Spells 1049', 'Spells 1050', 'Spells 1051', 'Spells 1052', 'Spells 1053',
      'Spells 1054', 'Spells 1055', 'Spells 1056', 'Spells 1057', 'Spells 1058', 'Spells 1059'],
  },
  {
    level: 4, slotsTotal: 'SlotsTotal 22', slotsExpended: 'SlotsRemaining 22',
    lines: ['Spells 1061', 'Spells 1060', 'Spells 1062', 'Spells 1063', 'Spells 1064', 'Spells 1065', 'Spells 1066',
      'Spells 1067', 'Spells 1068', 'Spells 1069', 'Spells 1070', 'Spells 1071', 'Spells 1072'],
  },
  {
    level: 5, slotsTotal: 'SlotsTotal 23', slotsExpended: 'SlotsRemaining 23',
    lines: ['Spells 1074', 'Spells 1073', 'Spells 1075', 'Spells 1076', 'Spells 1077', 'Spells 1078', 'Spells 1079',
      'Spells 1080', 'Spells 1081'],
  },
  {
    level: 6, slotsTotal: 'SlotsTotal 24', slotsExpended: 'SlotsRemaining 24',
    lines: ['Spells 1083', 'Spells 1082', 'Spells 1084', 'Spells 1085', 'Spells 1086', 'Spells 1087', 'Spells 1088',
      'Spells 1089', 'Spells 1090'],
  },
  {
    level: 7, slotsTotal: 'SlotsTotal 25', slotsExpended: 'SlotsRemaining 25',
    lines: ['Spells 1092', 'Spells 1091', 'Spells 1093', 'Spells 1094', 'Spells 1095', 'Spells 1096', 'Spells 1097',
      'Spells 1098', 'Spells 1099'],
  },
  {
    level: 8, slotsTotal: 'SlotsTotal 26', slotsExpended: 'SlotsRemaining 26',
    lines: ['Spells 10101', 'Spells 10100', 'Spells 10102', 'Spells 10103', 'Spells 10104', 'Spells 10105', 'Spells 10106'],
  },
  {
    level: 9, slotsTotal: 'SlotsTotal 27', slotsExpended: 'SlotsRemaining 27',
    lines: ['Spells 10108', 'Spells 10107', 'Spells 10109', 'Spells 101010', 'Spells 101011', 'Spells 101012', 'Spells 101013'],
  },
];
