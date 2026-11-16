import { Coins } from './dnd-character.model';

/** Something the player added to the inventory by hand. */
export interface InventoryItem {
  id: string;
  name: string;
  /** Free text: a count, a worth, charges left ("20", "50 gp"). */
  value: string;
  description: string;
}

/**
 * The live table state of a character: what changes while playing.
 *
 * It is stored on the character document, outside the versions, so an AI update
 * or a switch to another version never resets hit points, spent slots or the purse.
 * Every field is optional: a missing field falls back to the value on the active version.
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
  /** Items the player added by hand, next to the equipment of the build. */
  inventory?: InventoryItem[];
  /** The purse. Like the inventory it is the player's, whichever version is active. */
  coins?: Coins;
}
