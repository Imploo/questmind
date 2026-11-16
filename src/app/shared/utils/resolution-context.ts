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
}

export function resolutionContextOf(
  character: Pick<DndCharacter, 'class' | 'race' | 'level' | 'spellcasting'>
): ResolutionContext {
  const slotLevels = normalizeSpellSlots(character.spellcasting?.slots)
    .filter(slot => slot.total > 0)
    .map(slot => slot.level);
  return {
    class: character.class ?? '',
    race: character.race ?? '',
    level: character.level,
    maxSpellSlotLevel: slotLevels.length ? Math.max(...slotLevels) : undefined,
  };
}

/**
 * Names the context a text was looked up for. It is stored next to the text, so a
 * text that was looked up for another class or level can be recognised and redone.
 */
export function resolutionKey(context: ResolutionContext): string {
  return [context.class, context.race, context.level, context.maxSpellSlotLevel ?? '-']
    .map(part => String(part).trim().toLowerCase())
    .join('|');
}
