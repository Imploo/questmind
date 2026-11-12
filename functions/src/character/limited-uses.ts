import { DndCharacter } from '../schemas/dnd-character.schema';

interface NamedEntry {
  name: string;
  uses?: { max: number; recharge: 'shortRest' | 'longRest' | 'manual' };
}

function carryOver<T extends NamedEntry>(previous: (string | NamedEntry)[] | undefined, entry: T): T {
  if (entry.uses) return entry;
  const name = entry.name.toLowerCase();
  const match = previous?.find(
    (candidate): candidate is NamedEntry => typeof candidate !== 'string' && candidate.name?.toLowerCase() === name
  );
  return match?.uses ? { ...entry, uses: match.uses } : entry;
}

/**
 * Keep the uses trackers of features and spells that the generator returned without one.
 * A player can add a tracker by hand, and the generator tends to drop fields it was not
 * asked about; a tracker the generator did return always wins.
 */
export function preserveLimitedUses(previous: DndCharacter, draft: DndCharacter): DndCharacter {
  const result: DndCharacter = {
    ...draft,
    featuresAndTraits: (draft.featuresAndTraits ?? []).map(feature =>
      carryOver(previous.featuresAndTraits as (string | NamedEntry)[] | undefined, feature)
    ),
  };

  const spells = draft.spellcasting?.spells;
  if (draft.spellcasting && spells) {
    result.spellcasting = {
      ...draft.spellcasting,
      spells: spells.map(spell =>
        typeof spell === 'string' ? spell : carryOver(previous.spellcasting?.spells, spell)
      ),
    };
  }
  return result;
}
