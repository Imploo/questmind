import { DndCharacter } from '../models/dnd-character.model';
import { normalizeSpellSlots } from '../pdf/character-sheet-field-values';

/** What the rules text of a spell or feature depends on, besides its name. */
export interface ResolutionContext {
  /** As on the sheet: "Druid", "Druid (Circle of the Land)", "Warlock 3 / Sorcerer 2". */
  class: string;
  race: string;
  /** Total character level. */
  level: number;
  /** Highest spell slot level the character has; undefined when it has no slots on record. */
  maxSpellSlotLevel?: number;
  /**
   * Names of the character's features. They tell which options of a feature with a
   * choice it has: "Quickened Spell", "Fighting Style: Defense".
   */
  features?: string[];
}

/**
 * Raise this when texts are made differently, so that the stored ones are redone.
 * 2: features with a choice show only the options the character has.
 */
const TEXT_VERSION = 2;

export function resolutionContextOf(
  character: Pick<DndCharacter, 'class' | 'race' | 'level' | 'spellcasting'> & Partial<Pick<DndCharacter, 'featuresAndTraits'>>
): ResolutionContext {
  const features = (character.featuresAndTraits ?? []) as (string | { name: string })[];
  const slotLevels = normalizeSpellSlots(character.spellcasting?.slots)
    .filter(slot => slot.total > 0)
    .map(slot => slot.level);
  return {
    class: character.class ?? '',
    race: character.race ?? '',
    level: character.level,
    maxSpellSlotLevel: slotLevels.length ? Math.max(...slotLevels) : undefined,
    features: features.map(feature => (typeof feature === 'string' ? feature : feature.name)).filter(Boolean),
  };
}

/**
 * Names the context a text was looked up for. It is stored next to the text, so a
 * text that was looked up for another class or level can be recognised and redone.
 * The features are not part of it: they only change with a new version of the
 * character, and that starts without texts.
 */
export function resolutionKey(context: ResolutionContext): string {
  return [`v${TEXT_VERSION}`, context.class, context.race, context.level, context.maxSpellSlotLevel ?? '-']
    .map(part => String(part).trim().toLowerCase())
    .join('|');
}
