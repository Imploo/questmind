import { CharacterVersion } from '../../core/models/schemas/character.schema';

/**
 * The AI draft waiting to be saved or discarded. `versions` is newest first, and a
 * draft is always the newest version.
 */
export function pendingDraft(versions: CharacterVersion[]): CharacterVersion | null {
  const newest = versions[0];
  return newest?.isDraft ? newest : null;
}

/**
 * The saved version a character is on: the one its `activeVersionId` points at. When
 * that version is missing, the newest saved one takes its place.
 */
export function activeVersionOf(versions: CharacterVersion[], activeVersionId: string | undefined): CharacterVersion | null {
  const saved = versions.filter(version => !version.isDraft);
  return saved.find(version => version.id === activeVersionId) ?? saved[0] ?? null;
}
