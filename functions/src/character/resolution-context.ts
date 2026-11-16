/**
 * The character a spell or feature text is looked up for. The rules text depends on
 * it: Spellcasting reads differently for a druid than for a wizard, and what a
 * feature does grows with the character's level.
 */
export interface ResolutionCharacterFields {
  characterClass?: string;
  characterRace?: string;
  characterLevel?: number;
}

export interface ResolutionCharacter {
  class: string | null;
  race: string | null;
  /** 1-20, or null when the caller sent none (or nonsense). */
  level: number | null;
}

const MAX_NAME_LENGTH = 80;
const MAX_FEATURES = 60;

/** One line of plain text: the value ends up inside a prompt. */
function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/["\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return text || null;
}

/** A whole number from `min` to `max`, or null. */
export function levelInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/** The names of the character's features, as plain one-line texts. */
export function readFeatureNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(clean).filter((name): name is string => name !== null).slice(0, MAX_FEATURES);
}

export function readResolutionCharacter(data: ResolutionCharacterFields): ResolutionCharacter {
  return {
    class: clean(data.characterClass),
    race: clean(data.characterRace),
    level: levelInRange(data.characterLevel, 1, 20),
  };
}

/** "a level 5 Wood Elf Druid", or null when nothing is known about the character. */
export function describeCharacter(character: ResolutionCharacter): string | null {
  const who = [character.race, character.class].filter(Boolean).join(' ');
  if (!who && !character.level) return null;
  return character.level ? `a level ${character.level} ${who || 'character'}` : `a ${who}`;
}
