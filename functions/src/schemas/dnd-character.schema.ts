import { z } from 'zod';

export const AbilityScoreBonusSchema = z.object({
  source: z.string(), // e.g. "Race", "ASI level 4", "Feat: Resilient"
  amount: z.number(),
});

export const AbilityScoreSchema = z.object({
  score: z.number().min(1).max(30),
  modifier: z.number(),
  base: z.number().min(1).max(30).optional(), // Before racial, ASI and feat bonuses
  bonuses: z.array(AbilityScoreBonusSchema).optional(),
});

/** Bonuses on derived values that the plain formulas do not cover (Alert, Aura of Protection, magic items, ...). */
export const DerivedBonusesSchema = z.object({
  initiative: z.array(AbilityScoreBonusSchema).optional(),
  passivePerception: z.array(AbilityScoreBonusSchema).optional(),
  savingThrows: z.array(AbilityScoreBonusSchema).optional(), // Applies to all six saves
  spellSaveDc: z.array(AbilityScoreBonusSchema).optional(),
  spellAttack: z.array(AbilityScoreBonusSchema).optional(),
});

export const AbilityKeySchema = z.enum(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']);

export const AbilityScoreMethodSchema = z.enum(['pointBuy', 'standardArray', 'rolled', 'other']);

export const SkillSchema = z.object({
  name: z.string(),
  proficient: z.boolean(),
  expertise: z.boolean().optional(), // Double proficiency (Rogue, Bard, ...)
  modifier: z.number(),
});

export const CoinSchema = z.object({
  cp: z.number().default(0),
  sp: z.number().default(0),
  ep: z.number().default(0),
  gp: z.number().default(0),
  pp: z.number().default(0),
});

/** The saving throw a target makes against an attack that has no attack roll (Lightning Bolt, a breath weapon). */
export const AttackSaveSchema = z.object({
  ability: AbilityKeySchema,
  dc: z.number().optional(),
});

/** A weapon attack, or anything else that deals damage: a spell, a breath weapon. */
export const WeaponAttackSchema = z.object({
  name: z.string(),
  bonus: z.number().optional(), // Attack roll bonus; absent when there is no attack roll
  damage: z.string().optional().default(''), // e.g., "1d8 + 3"
  type: z.string().optional().default(''), // e.g., "Slashing"
  save: AttackSaveSchema.optional().catch(undefined), // A malformed save never costs the whole character
});

/** Something the character can do with its bonus action or its reaction. */
export const CharacterActionSchema = z.object({
  name: z.string(), // The spell or feature that gives it
  effect: z.string().optional(), // What it does, in one short line
  source: z.string().optional(), // "Spell", "Class", "Subclass", "Race", "Feat", "Item", "Other"
});

export const SpellSlotSchema = z.object({
  level: z.number().min(1).max(9),
  total: z.number().min(0),
  expended: z.number().min(0),
});

/** A limited number of uses that comes back on a rest (Channel Divinity, a racial spell, Lucky, ...). */
export const LimitedUsesSchema = z.object({
  max: z.number().min(1),
  recharge: z.enum(['shortRest', 'longRest', 'manual']),
});

export const SpellSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  usage: z.string().optional(),
  level: z.number().min(0).max(9).optional(), // 0 for cantrips
  school: z.string().optional(), // e.g., "Evocation", "Abjuration"
  uses: LimitedUsesSchema.optional(), // Uses of its own, apart from spell slots (racial and feat spells)
});

export const DndCharacterSchema = z.object({
  // Basic Info
  name: z.string(),
  class: z.string(),
  level: z.number().min(1).max(20),
  background: z.string().optional(),
  playerName: z.string().optional(),
  race: z.string(),
  alignment: z.enum([
    'Lawful Good', 'Neutral Good', 'Chaotic Good',
    'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
    'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
    'Unaligned'
  ]).optional(),
  experiencePoints: z.number().min(0).default(0),

  // Ability Scores
  abilityScoreMethod: AbilityScoreMethodSchema.optional(),
  derivedBonuses: DerivedBonusesSchema.optional(),
  abilities: z.object({
    strength: AbilityScoreSchema,
    dexterity: AbilityScoreSchema,
    constitution: AbilityScoreSchema,
    intelligence: AbilityScoreSchema,
    wisdom: AbilityScoreSchema,
    charisma: AbilityScoreSchema,
  }),

  // Skills & Proficiencies
  skills: z.array(SkillSchema),
  savingThrows: z.object({
    strength: z.object({ proficient: z.boolean(), modifier: z.number() }),
    dexterity: z.object({ proficient: z.boolean(), modifier: z.number() }),
    constitution: z.object({ proficient: z.boolean(), modifier: z.number() }),
    intelligence: z.object({ proficient: z.boolean(), modifier: z.number() }),
    wisdom: z.object({ proficient: z.boolean(), modifier: z.number() }),
    charisma: z.object({ proficient: z.boolean(), modifier: z.number() }),
  }),
  passiveWisdom: z.number(),
  proficiencies: z.array(z.string()), // Tools, weapons, armor
  languages: z.array(z.string()),

  // Combat Stats
  armorClass: z.number(),
  initiative: z.number(),
  speed: z.number(),
  hitPoints: z.object({
    max: z.number(),
    current: z.number(),
    temp: z.number().default(0),
  }),
  hitDice: z.object({
    total: z.number(),
    current: z.number(),
    die: z.string(), // e.g., "d8"
  }),
  deathSaves: z.object({
    successes: z.number().min(0).max(3).default(0),
    failures: z.number().min(0).max(3).default(0),
  }),

  // Actions
  attacks: z.array(WeaponAttackSchema).default([]),
  // Absent on a character from before these lists were recorded
  bonusActions: z.array(CharacterActionSchema).optional(),
  reactions: z.array(CharacterActionSchema).optional(),
  spellcasting: z.object({
    ability: AbilityKeySchema.optional(), // Spellcasting ability; derived from the class when missing
    spellSaveDc: z.number().optional(),
    spellAttackBonus: z.number().optional(),
    slots: z.union([z.array(SpellSlotSchema), z.record(z.string(), z.any())]).optional(),
    spells: z.array(z.union([z.string(), SpellSchema])).optional(), // Support both old format (strings) and new format (objects)
  }).optional(),

  // Inventory
  equipment: z.array(z.string()).default([]),
  coins: CoinSchema.default({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }),

  // Features & Traits
  featuresAndTraits: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      source: z.string().optional(),
      uses: LimitedUsesSchema.optional(),
    })
  ).default([]),

  // Flavor
  personalityTraits: z.string().optional(),
  ideals: z.string().optional(),
  bonds: z.string().optional(),
  flaws: z.string().optional(),
  appearance: z.object({
    age: z.string().optional(),
    height: z.string().optional(),
    weight: z.string().optional(),
    eyes: z.string().optional(),
    skin: z.string().optional(),
    hair: z.string().optional(),
    description: z.string().optional(), // Full text description
  }).optional(),
  backstory: z.string().optional(),

  // The edition of the rules the character is built with; 2014 when absent.
  rulesVersion: z.enum(['2014', '2024']).optional(),
});

export type DndCharacter = z.infer<typeof DndCharacterSchema>;
