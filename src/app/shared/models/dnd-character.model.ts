export interface AbilityScoreBonus {
  source: string;
  amount: number;
}

export interface AbilityScore {
  score: number;
  modifier: number;
  /** Score before racial, ASI and feat bonuses. */
  base?: number;
  bonuses?: AbilityScoreBonus[];
}

/** Bonuses on derived values beyond the standard formulas (Alert, Aura of Protection, magic items, ...). */
export interface DerivedBonuses {
  initiative?: AbilityScoreBonus[];
  passivePerception?: AbilityScoreBonus[];
  /** Applies to all six saving throws. */
  savingThrows?: AbilityScoreBonus[];
  spellSaveDc?: AbilityScoreBonus[];
  spellAttack?: AbilityScoreBonus[];
}

export type AbilityScoreMethod = 'pointBuy' | 'standardArray' | 'rolled' | 'other';

export interface Skill {
  name: string;
  proficient: boolean;
  /** Double proficiency (Rogue, Bard, ...). */
  expertise?: boolean;
  modifier: number;
}

export interface Coins {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface WeaponAttack {
  name: string;
  bonus?: number;
  damage?: string;
  type?: string;
}

export interface SpellSlot {
  level: number;
  total: number;
  expended: number;
}

export interface Spell {
  name: string;
  description?: string;
  usage?: string;
  level?: number;
  school?: string;
}

export type Alignment =
  | 'Lawful Good' | 'Neutral Good' | 'Chaotic Good'
  | 'Lawful Neutral' | 'True Neutral' | 'Chaotic Neutral'
  | 'Lawful Evil' | 'Neutral Evil' | 'Chaotic Evil'
  | 'Unaligned';

export interface DndCharacter {
  // Basic Info
  name: string;
  class: string;
  level: number;
  background?: string;
  playerName?: string;
  race: string;
  alignment?: Alignment;
  experiencePoints: number;

  // Ability Scores
  abilityScoreMethod?: AbilityScoreMethod;
  derivedBonuses?: DerivedBonuses;
  abilities: {
    strength: AbilityScore;
    dexterity: AbilityScore;
    constitution: AbilityScore;
    intelligence: AbilityScore;
    wisdom: AbilityScore;
    charisma: AbilityScore;
  };

  // Skills & Proficiencies
  skills: Skill[];
  savingThrows: {
    strength: { proficient: boolean; modifier: number };
    dexterity: { proficient: boolean; modifier: number };
    constitution: { proficient: boolean; modifier: number };
    intelligence: { proficient: boolean; modifier: number };
    wisdom: { proficient: boolean; modifier: number };
    charisma: { proficient: boolean; modifier: number };
  };
  passiveWisdom: number;
  proficiencies: string[];
  languages: string[];

  // Combat Stats
  armorClass: number;
  initiative: number;
  speed: number;
  hitPoints: {
    max: number;
    current: number;
    temp: number;
  };
  hitDice: {
    total: number;
    current: number;
    die: string;
  };
  deathSaves: {
    successes: number;
    failures: number;
  };

  // Actions
  attacks: WeaponAttack[];
  spellcasting?: {
    ability?: 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
    spellSaveDc?: number;
    spellAttackBonus?: number;
    slots?: SpellSlot[] | Record<string, unknown>;
    spells?: (string | Spell)[];
  };

  // Inventory
  equipment: string[];
  coins: Coins;

  // Features & Traits
  featuresAndTraits: {
    name: string;
    description: string;
    source?: string;
  }[];

  // Flavor
  personalityTraits?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  appearance?: {
    age?: string;
    height?: string;
    weight?: string;
    eyes?: string;
    skin?: string;
    hair?: string;
    description?: string;
  };
  backstory?: string;
}
