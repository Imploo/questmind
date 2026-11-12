/**
 * The live table state of a character: what changes while playing.
 *
 * It is stored on the character document, outside the versions, so an AI update
 * or a restored version never resets hit points or spent slots. Every field is
 * optional: a missing field falls back to the value on the active version.
 */
export interface CharacterPlayState {
  hp?: { current: number; temp: number };
  /** Hit dice left to spend. */
  hitDice?: number;
  deathSaves?: { successes: number; failures: number };
  /** Expended spell slots per slot level ("1" to "9"). */
  slotsExpended?: Record<string, number>;
  /** Spent uses per tracker key, see usesKey(). */
  usesSpent?: Record<string, number>;
  conditions?: string[];
  exhaustion?: number;
  /** Name of the spell being concentrated on. */
  concentration?: string | null;
  inspiration?: boolean;
}
