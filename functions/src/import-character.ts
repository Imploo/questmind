import { randomUUID } from 'crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { wrapCallable, captureException } from './utils/sentry-error-handler';
import { SHARED_CORS } from './config/cors';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { requireAuthUid } from './utils/access';
import { buildDownloadUrl } from './utils/storage-url';
import { fetchPublicDocument, listPublicDocuments, PublicDocument } from './utils/firestore-rest';
import { environmentForHost, environmentForProject, QuestmindEnvironment } from './config/environments';
import { DndCharacterSchema, DndCharacter } from './schemas/dnd-character.schema';
import { characterImagePrefix } from './generate-image';
import * as logger from './utils/logger';

const CHARACTER_ID_PATTERN = /^[\w-]{8,64}$/;
const CHARACTER_PATH_PATTERN = /^\/(?:share\/character|characters)\/([\w-]{8,64})\/?$/;
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 30_000;

/** Either a link to a character, or the id of a character in this environment (a clone). */
interface ImportCharacterRequest {
  link?: string;
  characterId?: string;
}

interface ImportCharacterResponse {
  characterId: string;
}

/** Where the character to copy lives. */
export interface CharacterSource {
  environment: QuestmindEnvironment;
  characterId: string;
  /** How the copy's first version describes where it came from. */
  origin: string;
}

/**
 * Read a link to a character page or a character share page of one of the
 * QuestMind environments. Throws `invalid-argument` for anything else.
 */
export function parseCharacterLink(link: unknown): CharacterSource {
  if (typeof link !== 'string' || !link.trim()) {
    throw new HttpsError('invalid-argument', 'Paste a link to a character.');
  }
  const text = link.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new HttpsError('invalid-argument', 'That does not look like a link.');
  }

  const environment = environmentForHost(url.hostname);
  if (url.protocol !== 'https:' || !environment) {
    throw new HttpsError('invalid-argument', 'Only links to a QuestMind character can be imported.');
  }
  const characterId = CHARACTER_PATH_PATTERN.exec(url.pathname)?.[1];
  if (!characterId) {
    throw new HttpsError('invalid-argument', 'That link does not point to a character.');
  }
  return { environment, characterId, origin: `Imported from ${url.hostname.toLowerCase()}` };
}

/** A character of this environment, to clone it. Throws `invalid-argument` for a malformed id. */
export function ownCharacterSource(characterId: unknown): CharacterSource {
  if (typeof characterId !== 'string' || !CHARACTER_ID_PATTERN.test(characterId)) {
    throw new HttpsError('invalid-argument', 'Missing or invalid characterId.');
  }
  const projectId = process.env.GCLOUD_PROJECT ?? '';
  const environment = environmentForProject(projectId)
    // An environment that is not in the list (an emulator, a new project): use its default bucket.
    ?? { projectId, bucket: getStorage().bucket().name, domains: [] };
  return { environment, characterId, origin: 'Cloned from a shared character' };
}

/**
 * Copies a character from a QuestMind environment (this one or another, such as
 * beta) to the caller's account. Characters are publicly readable, so the source is
 * read without credentials; the copy gets one fresh version and the portraits.
 *
 * What is public is the character as built. The owner's play state (hit points, spent
 * slots, inventory) is theirs and is not copied, and neither are the version history,
 * the chat and the campaign.
 */
export async function executeImportCharacter(uid: string, source: CharacterSource): Promise<ImportCharacterResponse> {
  const { projectId } = source.environment;
  const sourcePath = `characters/${source.characterId}`;

  const sourceDoc = await fetchPublicDocument(projectId, sourcePath);
  if (!sourceDoc) {
    throw new HttpsError('not-found', 'No character was found at that link.');
  }

  const character = await loadCharacter(projectId, sourcePath, sourceDoc);

  const db = getFirestore();
  const characterId = randomUUID();
  const versionId = randomUUID();
  const characterRef = db.collection('characters').doc(characterId);

  const batch = db.batch();
  batch.set(characterRef, {
    id: characterId,
    userId: uid,
    name: character.name,
    activeVersionId: versionId,
    campaignId: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(characterRef.collection('versions').doc(versionId), {
    id: versionId,
    versionNumber: 1,
    // A JSON round trip drops undefined values, which Firestore refuses.
    character: JSON.parse(JSON.stringify(character)),
    commitMessage: source.origin,
    source: 'manual',
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  const copied = await copyImages(source, characterId);
  logger.info('importCharacter: character imported', { characterId, from: projectId, images: copied });
  return { characterId };
}

/** The character of the active version, or of the newest committed version when that is missing. */
async function loadCharacter(projectId: string, sourcePath: string, sourceDoc: PublicDocument): Promise<DndCharacter> {
  const activeVersionId = sourceDoc.data['activeVersionId'];
  let version = typeof activeVersionId === 'string' && activeVersionId && !activeVersionId.includes('/')
    ? await fetchPublicDocument(projectId, `${sourcePath}/versions/${activeVersionId}`)
    : null;
  if (!version) {
    const newest = await listPublicDocuments(projectId, `${sourcePath}/versions`, { orderBy: 'versionNumber desc', pageSize: 5 });
    version = newest.find(candidate => candidate.data['isDraft'] !== true) ?? null;
  }

  const parsed = DndCharacterSchema.safeParse(version?.data['character']);
  if (!parsed.success) {
    throw new HttpsError('failed-precondition', 'The character at that link could not be read.');
  }
  return parsed.data;
}

/** Copy the portraits to this project's bucket, newest first. A portrait that fails is skipped. */
async function copyImages(source: CharacterSource, characterId: string): Promise<number> {
  let images: PublicDocument[];
  try {
    images = await listPublicDocuments(source.environment.projectId, `characters/${source.characterId}/images`, {
      orderBy: 'createdAt desc',
      pageSize: MAX_IMAGES,
    });
  } catch (error) {
    captureException(error as Error, { function: 'importCharacter', characterId });
    return 0;
  }

  const results = await Promise.allSettled(images.map(image => copyImage(source, characterId, image)));
  results.forEach(result => {
    if (result.status === 'rejected') {
      captureException(result.reason as Error, { function: 'importCharacter', characterId });
    }
  });
  return results.filter(result => result.status === 'fulfilled' && result.value).length;
}

async function copyImage(source: CharacterSource, characterId: string, image: PublicDocument): Promise<boolean> {
  const storagePath = image.data['storagePath'];
  // Only fetch files from the source character's own image folder.
  if (
    typeof storagePath !== 'string' ||
    !storagePath.startsWith(characterImagePrefix(source.characterId)) ||
    storagePath.includes('..')
  ) {
    return false;
  }

  const response = await fetch(buildDownloadUrl(source.environment.bucket, storagePath), {
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > MAX_IMAGE_BYTES) return false;

  const mimeType = typeof image.data['mimeType'] === 'string' && image.data['mimeType'].startsWith('image/')
    ? image.data['mimeType']
    : response.headers.get('content-type') ?? 'image/png';
  const extension = /\.([a-z0-9]{1,5})$/i.exec(storagePath)?.[1]?.toLowerCase() ?? 'png';
  const targetPath = `${characterImagePrefix(characterId)}${randomUUID()}.${extension}`;
  await getStorage().bucket().file(targetPath).save(data, { metadata: { contentType: mimeType } });

  // Keep the original moment, so the newest portrait stays the one the sheet shows.
  const createdAt = typeof image.data['createdAt'] === 'string' ? new Date(image.data['createdAt']) : null;
  const imageRef = getFirestore().collection('characters').doc(characterId).collection('images').doc();
  await imageRef.set({
    id: imageRef.id,
    characterId,
    mimeType,
    storagePath: targetPath,
    createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? Timestamp.fromDate(createdAt) : FieldValue.serverTimestamp(),
  });
  return true;
}

export const importCharacter = onCall(
  { cors: SHARED_CORS, memory: '512MiB', timeoutSeconds: 120 },
  wrapCallable<ImportCharacterRequest, ImportCharacterResponse>(
    'importCharacter',
    async (request): Promise<ImportCharacterResponse> => {
      ensureAuthForTesting(request);
      const uid = requireAuthUid(request);
      const { link, characterId } = request.data ?? {};
      const source = characterId !== undefined ? ownCharacterSource(characterId) : parseCharacterLink(link);
      return executeImportCharacter(uid, source);
    }
  )
);
