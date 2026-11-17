import { CONDITIONS, RECHARGE_LABELS } from '../../../../shared/utils/character-play-state';

/**
 * The D&D game terms of the play components. Like the terms in `shared/dnd-terms.ts`
 * they stay English in every language; the app text around them is translated
 * ("Long rest nemen?").
 */
export const PLAY_TERMS = {
  hitPoints: 'Hit Points',
  temporaryHitPoints: 'Temporary Hit Points',
  temp: 'Temp',
  /** As it follows an amount: "+5 temp". */
  tempAmount: 'temp',
  hitDice: 'Hit Dice',
  spellSlots: 'Spell Slots',
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
  recharge: RECHARGE_LABELS,
  coins: {
    pp: 'Platinum',
    gp: 'Gold',
    ep: 'Electrum',
    sp: 'Silver',
    cp: 'Copper',
  },
} as const;
