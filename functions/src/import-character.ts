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
import { environmentForHost, QuestmindEnvironment } from './config/environments';
import { DndCharacterSchema, DndCharacter } from './schemas/dnd-character.schema';
import { CharacterPlayStateSchema } from './schemas/character-play-state.schema';
import { characterImagePrefix } from './generate-image';
import * as logger from './utils/logger';

const CHARACTER_PATH_PATTERN = /^\/(?:share\/character|characters)\/([\w-]{8,64})\/?$/;
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 30_000;

interface ImportCharacterRequest {
  link: string;
}

interface ImportCharacterResponse {
  characterId: string;
}

export interface CharacterLink {
  environment: QuestmindEnvironment;
  host: string;
  characterId: string;
}

/**
 * Read a link to a character page or a character share page of one of the
 * QuestMind environments. Throws `invalid-argument` for anything else.
 */
export function parseCharacterLink(link: unknown): CharacterLink {
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
  return { environment, host: url.hostname.toLowerCase(), characterId };
}

/**
 * Copies a character from a QuestMind environment (this one or another, such as
 * beta) to the caller's account. Characters are publicly readable, so the source is
 * read without credentials; the copy gets one fresh version, the play state and the
 * portraits. Version history, chat and campaign stay behind.
 */
export async function executeImportCharacter(uid: string, link: unknown): Promise<ImportCharacterResponse> {
  const source = parseCharacterLink(link);
  const { projectId } = source.environment;
  const sourcePath = `characters/${source.characterId}`;

  const sourceDoc = await fetchPublicDocument(projectId, sourcePath);
  if (!sourceDoc) {
    throw new HttpsError('not-found', 'No character was found at that link.');
  }

  const character = await loadCharacter(projectId, sourcePath, sourceDoc);
  const playState = CharacterPlayStateSchema.safeParse(sourceDoc.data['playState']);

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
    ...(playState.success && { playState: playState.data }),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(characterRef.collection('versions').doc(versionId), {
    id: versionId,
    versionNumber: 1,
    // A JSON round trip drops undefined values, which Firestore refuses.
    character: JSON.parse(JSON.stringify(character)),
    commitMessage: `Imported from ${source.host}`,
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
async function copyImages(source: CharacterLink, characterId: string): Promise<number> {
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

async function copyImage(source: CharacterLink, characterId: string, image: PublicDocument): Promise<boolean> {
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
      return executeImportCharacter(uid, request.data?.link);
    }
  )
);
