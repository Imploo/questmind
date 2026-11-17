/**
 * D&D game terms. They stay English in every language, like at the table and
 * in the rules data: "Armor Class" is "Armor Class" for a Dutch player too.
 *
 * A template takes its game terms from here (`terms.armorClass`) instead of
 * writing them out, so the only loose text left in a template is text that
 * still needs a translation. The app text around a term does get translated
 * and lives in the translations ("Long rest nemen?").
 *
 * Skill names and alignments are also stored on a character: their spelling
 * here is the spelling in Firestore and must not change.
 */
export const DND_TERMS = {
  level: 'Level',
  xp: 'XP',

  /** The six abilities in the order of the sheet; `key` is the field on a character. */
  abilities: [
    { key: 'strength', abbreviation: 'STR', name: 'Strength' },
    { key: 'dexterity', abbreviation: 'DEX', name: 'Dexterity' },
    { key: 'constitution', abbreviation: 'CON', name: 'Constitution' },
    { key: 'intelligence', abbreviation: 'INT', name: 'Intelligence' },
    { key: 'wisdom', abbreviation: 'WIS', name: 'Wisdom' },
    { key: 'charisma', abbreviation: 'CHA', name: 'Charisma' },
  ],

  /** The 18 skills with the ability they are rolled with. */
  skills: [
    { name: 'Acrobatics', ability: 'dexterity' },
    { name: 'Animal Handling', ability: 'wisdom' },
    { name: 'Arcana', ability: 'intelligence' },
    { name: 'Athletics', ability: 'strength' },
    { name: 'Deception', ability: 'charisma' },
    { name: 'History', ability: 'intelligence' },
    { name: 'Insight', ability: 'wisdom' },
    { name: 'Intimidation', ability: 'charisma' },
    { name: 'Investigation', ability: 'intelligence' },
    { name: 'Medicine', ability: 'wisdom' },
    { name: 'Nature', ability: 'intelligence' },
    { name: 'Perception', ability: 'wisdom' },
    { name: 'Performance', ability: 'charisma' },
    { name: 'Persuasion', ability: 'charisma' },
    { name: 'Religion', ability: 'intelligence' },
    { name: 'Sleight of Hand', ability: 'dexterity' },
    { name: 'Stealth', ability: 'dexterity' },
    { name: 'Survival', ability: 'wisdom' },
  ],

  alignments: [
    'Lawful Good',
    'Neutral Good',
    'Chaotic Good',
    'Lawful Neutral',
    'True Neutral',
    'Chaotic Neutral',
    'Lawful Evil',
    'Neutral Evil',
    'Chaotic Evil',
    'Unaligned',
  ],

  // The labels of the character sheet, as the official sheet prints them.
  abilityScores: 'Ability scores',
  armorClass: 'Armor Class',
  initiative: 'Initiative',
  speed: 'Speed',
  feet: 'ft',
  hitDice: 'Hit Dice',
  passivePerception: 'Passive Perception',
  savingThrows: 'Saving Throws',
  skillsTitle: 'Skills',
  proficient: 'proficient',
  expertise: 'expertise',
  proficienciesAndLanguages: 'Proficiencies & Languages',
  attacks: 'Attacks',
  bonusActions: 'Bonus Actions',
  reactions: 'Reactions',
  spellcasting: 'Spellcasting',
  spellcastingAbility: 'Ability',
  spellSaveDc: 'Save DC',
  spellAttack: 'Spell Attack',
  spells: 'Spells',
  cantrip: 'Cantrip',
  cantrips: 'Cantrips',
  spellSlots: 'Spell Slots',
  featuresAndTraits: 'Features & Traits',
  inventory: 'Inventory',
  shortRest: 'Short rest',
  longRest: 'Long rest',

  // The story side of the sheet.
  personality: 'Personality',
  personalityTraits: 'Personality Traits',
  ideals: 'Ideals',
  bonds: 'Bonds',
  flaws: 'Flaws',
  appearance: 'Appearance',
  age: 'Age',
  height: 'Height',
  weight: 'Weight',
  eyes: 'Eyes',
  skin: 'Skin',
  hair: 'Hair',
  backstory: 'Backstory',

  /** The tabs along the edge of the sheet, by the section they jump to. */
  sections: {
    abilities: 'Abilities',
    attacks: 'Attacks',
    spells: 'Spells',
    traits: 'Traits',
    inventory: 'Inventory',
  },
} as const;

export type DndTerms = typeof DND_TERMS;

/** The conditions a character can have. Stored in the play state and matched by name: these values never change. */
export const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
] as const;

/**
 * The game terms of playing a character: hit points, rests, conditions, coins.
 * English in every language, like the terms above.
 */
export const PLAY_TERMS = {
  hitPoints: 'Hit Points',
  temporaryHitPoints: 'Temporary Hit Points',
  temp: 'Temp',
  /** As it follows an amount: "+5 temp". */
  tempAmount: 'temp',
  hitDice: DND_TERMS.hitDice,
  spellSlots: DND_TERMS.spellSlots,
  features: 'Features',
  deathSaves: 'Death Saves',
  successes: 'Successes',
  failures: 'Failures',
  dead: 'Dead',
  stable: 'Stable',
  inspiration: 'Inspiration',
  concentration: 'Concentration',
  conditions: 'Conditions',
  exhaustion: 'Exhaustion',
  /** Also stored in the play state and matched by name: these values never change. */
  conditionNames: CONDITIONS,
  /** A tracker can also be reset by hand; that is app text and comes from the translations. */
  recharge: { shortRest: DND_TERMS.shortRest, longRest: DND_TERMS.longRest },
  coins: {
    pp: 'Platinum',
    gp: 'Gold',
    ep: 'Electrum',
    sp: 'Silver',
    cp: 'Copper',
  },
} as const;
