import { z } from 'zod';

export const AbilityScoreSchema = z.object({
  score: z.number().min(1).max(30),
  modifier: z.number(),
});

export const SkillSchema = z.object({
  name: z.string(),
  proficient: z.boolean(),
  modifier: z.number(),
});

export const CoinSchema = z.object({
  cp: z.number().default(0),
  sp: z.number().default(0),
  ep: z.number().default(0),
  gp: z.number().default(0),
  pp: z.number().default(0),
});

export const WeaponAttackSchema = z.object({
  name: z.string(),
  bonus: z.number(),
  damage: z.string(), // e.g., "1d8 + 3"
  type: z.string(), // e.g., "Slashing"
});

export const SpellSlotSchema = z.object({
  level: z.number().min(1).max(9),
  total: z.number().min(0),
  expended: z.number().min(0),
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
  attacks: z.array(WeaponAttackSchema),
  spellcasting: z.object({
    spellSaveDc: z.number().optional(),
    spellAttackBonus: z.number().optional(),
    slots: z.array(SpellSlotSchema).optional(),
    spells: z.array(z.string()).optional(), // List of known/prepared spells
  }).optional(),

  // Inventory
  equipment: z.array(z.string()), // Simplified list of items
  coins: CoinSchema,

  // Features & Traits
  featuresAndTraits: z.array(z.object({
    name: z.string(),
    description: z.string(),
    source: z.string().optional(), // e.g., "Racial", "Class", "Feat"
  })),

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
});

export type DndCharacter = z.infer<typeof DndCharacterSchema>;
