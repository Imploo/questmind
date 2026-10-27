import { DocumentData, Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { sessionDocPath } from './session-ref';

/**
 * Shared access checks for all callables. Membership follows the same rules as
 * `isCampaignMember` in firestore.rules, so the backend never grants (or denies)
 * more than the client could do directly.
 */

/** The caller's uid, or `unauthenticated` when the request carries no auth. */
export function requireAuthUid(request: { auth?: { uid?: string } | null }): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  return uid;
}

/**
 * Validate an id that ends up in a Firestore or Storage path: a non-empty
 * string without '/', so it can never point at another document or folder.
 */
export function assertValidId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('/')) {
    throw new HttpsError('invalid-argument', `Missing or invalid ${field}.`);
  }
  return value;
}

/**
 * Campaign document check: owner, or listed in `members`. `members` is a uid
 * list in newer documents and a uid map in older ones.
 */
export function isListedCampaignMember(campaign: DocumentData, uid: string): boolean {
  if (campaign.ownerId === uid) return true;
  const members = campaign.members;
  if (Array.isArray(members)) return members.includes(uid);
  return !!members && typeof members === 'object' && !!(members as Record<string, unknown>)[uid];
}

/**
 * Load a campaign and check the caller may use it. Without `requireOwner` any
 * member passes; the `users/{uid}.campaigns` fallback (an extra read) only runs
 * when the campaign document itself doesn't list the caller.
 */
export async function loadCampaignForUser(
  db: Firestore,
  campaignId: string,
  uid: string,
  opts: { requireOwner?: boolean } = {}
): Promise<DocumentData> {
  assertValidId(campaignId, 'campaignId');
  const snap = await db.doc(`campaigns/${campaignId}`).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Campaign not found.');
  }
  const campaign = snap.data() ?? {};

  if (opts.requireOwner) {
    if (campaign.ownerId !== uid) {
      throw new HttpsError('permission-denied', 'Only the campaign owner can do this.');
    }
    return campaign;
  }

  if (isListedCampaignMember(campaign, uid) || (await profileListsCampaign(db, uid, campaignId))) {
    return campaign;
  }
  throw new HttpsError('permission-denied', 'User is not a campaign member.');
}

export function assertCampaignMember(db: Firestore, campaignId: string, uid: string): Promise<DocumentData> {
  return loadCampaignForUser(db, campaignId, uid);
}

export function assertCampaignOwner(db: Firestore, campaignId: string, uid: string): Promise<DocumentData> {
  return loadCampaignForUser(db, campaignId, uid, { requireOwner: true });
}

/** Membership check plus an existing session. Returns the session data. */
export async function loadSessionForMember(
  db: Firestore,
  campaignId: string,
  sessionId: string,
  uid: string
): Promise<DocumentData> {
  assertValidId(sessionId, 'sessionId');
  await assertCampaignMember(db, campaignId, uid);
  const snap = await db.doc(sessionDocPath(campaignId, sessionId)).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Session not found.');
  }
  return snap.data() ?? {};
}

/** Membership check plus session ownership (`ownerId`). Returns the session data. */
export async function assertSessionOwner(
  db: Firestore,
  campaignId: string,
  sessionId: string,
  uid: string
): Promise<DocumentData> {
  const session = await loadSessionForMember(db, campaignId, sessionId, uid);
  if (session.ownerId !== uid) {
    throw new HttpsError('permission-denied', 'Only the session owner can do this.');
  }
  return session;
}

/** Same rule as firestore.rules for characters: `characters/{id}.userId === uid`. */
export async function assertCharacterOwner(
  db: Firestore,
  characterId: string,
  uid: string
): Promise<DocumentData> {
  assertValidId(characterId, 'characterId');
  const snap = await db.doc(`characters/${characterId}`).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Character not found.');
  }
  const character = snap.data() ?? {};
  if (character.userId !== uid) {
    throw new HttpsError('permission-denied', 'Not authorized for this character.');
  }
  return character;
}

async function profileListsCampaign(db: Firestore, uid: string, campaignId: string): Promise<boolean> {
  const profile = await db.doc(`users/${uid}`).get();
  const campaigns = profile.exists ? profile.data()?.campaigns : undefined;
  return Array.isArray(campaigns) && campaigns.includes(campaignId);
}
