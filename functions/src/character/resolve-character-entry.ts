import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAiFeatureConfig } from '../utils/ai-settings';
import { generateJson } from '../utils/gemini-client';
import { assertCharacterOwner } from '../utils/access';
import * as logger from '../utils/logger';

/**
 * Shared implementation of resolveSpell and resolveFeature: look up the rules
 * text of one entry of the caller's character via Gemini, and store it on the
 * matching entry of the character's active version (best-effort).
 */
export interface ResolveCharacterEntryOptions<T extends { [K in keyof T]: string }> {
  /** Callable name, for logs and error messages. */
  label: string;
  uid: string;
  characterId: string;
  /** AI settings feature key (model + token settings). */
  featureKey: 'spellResolution' | 'featureResolution';
  prompt: string;
  /** Dot-path of the entry list inside `character`, e.g. 'spellcasting.spells'. */
  listPath: string;
  /** Entry name to patch (case-insensitive). */
  matchName: string;
  /** Response fields that must be non-empty; they are also the fields copied onto the entry. */
  fields: (keyof T & string)[];
}

export async function resolveCharacterEntry<T extends { [K in keyof T]: string }>(
  opts: ResolveCharacterEntryOptions<T>
): Promise<T> {
  const db = getFirestore();
  const character = await assertCharacterOwner(db, opts.characterId, opts.uid);
  const config = await getAiFeatureConfig(opts.featureKey);

  let details: T;
  try {
    details = await generateJson<T>({ config, label: opts.label, contents: opts.prompt });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.warn(`${opts.label}: Gemini call or JSON parse failed`, error);
    throw new HttpsError('internal', `Failed to parse ${entryKind(opts)} details from AI response`);
  }
  if (!details || opts.fields.some(field => !details[field])) {
    throw new HttpsError('internal', `Failed to parse ${entryKind(opts)} details from AI response`);
  }

  const result = Object.fromEntries(opts.fields.map(field => [field, details[field]])) as unknown as T;
  await patchActiveVersion(opts, character.activeVersionId, result);
  return result;
}

function entryKind(opts: { featureKey: string }): string {
  return opts.featureKey === 'spellResolution' ? 'spell' : 'feature';
}

/** Copy the resolved fields onto the named entry of the active version. Never throws. */
async function patchActiveVersion<T extends { [K in keyof T]: string }>(
  opts: ResolveCharacterEntryOptions<T>,
  activeVersionId: unknown,
  fields: T
): Promise<void> {
  if (typeof activeVersionId !== 'string' || !activeVersionId || activeVersionId.includes('/')) {
    return;
  }
  try {
    const versionRef = getFirestore().doc(`characters/${opts.characterId}/versions/${activeVersionId}`);
    const versionSnap = await versionRef.get();
    if (!versionSnap.exists) {
      return;
    }

    const list = (getPath(versionSnap.data()?.character, opts.listPath) ?? []) as (string | Record<string, unknown>)[];
    const name = opts.matchName.toLowerCase();
    const updated = list.map(entry => {
      if (typeof entry === 'string') return entry;
      if ((entry['name'] as string)?.toLowerCase() === name) {
        return { ...entry, ...fields };
      }
      return entry;
    });
    await versionRef.update({ [`character.${opts.listPath}`]: updated });
  } catch (error) {
    logger.warn(`${opts.label}: Firestore patch failed (non-fatal)`, error);
  }
}

function getPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (current, key) => (current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined),
    value
  );
}
