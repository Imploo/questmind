import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  assertCampaignMember,
  assertCampaignOwner,
  assertCharacterOwner,
  assertSessionOwner,
  assertValidId,
  loadSessionForMember,
  requireAuthUid,
} from './access';

/** Minimal Firestore fake: documents by path. */
function fakeDb(docs: Record<string, Record<string, unknown>>) {
  const reads: string[] = [];
  const db = {
    doc: vi.fn((path: string) => ({
      get: vi.fn(async () => {
        reads.push(path);
        const data = docs[path];
        return { exists: data !== undefined, data: () => data };
      }),
    })),
  };
  return { db: db as unknown as Firestore, reads };
}

const code = (c: string) => expect.objectContaining({ code: c });

describe('requireAuthUid', () => {
  it('returns the uid or throws unauthenticated', () => {
    expect(requireAuthUid({ auth: { uid: 'u1' } })).toBe('u1');
    expect(() => requireAuthUid({ auth: null })).toThrow(code('unauthenticated'));
    expect(() => requireAuthUid({ auth: {} })).toThrow(code('unauthenticated'));
  });
});

describe('assertValidId', () => {
  it('accepts a plain id', () => {
    expect(assertValidId('abc-123', 'campaignId')).toBe('abc-123');
  });

  it('rejects slashes, empty strings and non-strings', () => {
    for (const bad of ['a/b', '', '   ', undefined, null, 42, {}]) {
      expect(() => assertValidId(bad, 'campaignId')).toThrow(code('invalid-argument'));
    }
  });
});

describe('assertCampaignMember', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts the owner', async () => {
    const { db } = fakeDb({ 'campaigns/c1': { ownerId: 'u1' } });
    await expect(assertCampaignMember(db, 'c1', 'u1')).resolves.toEqual({ ownerId: 'u1' });
  });

  it('accepts a member in the members array', async () => {
    const { db, reads } = fakeDb({ 'campaigns/c1': { ownerId: 'o', members: ['u1'] } });
    await expect(assertCampaignMember(db, 'c1', 'u1')).resolves.toBeDefined();
    // No profile read needed when the campaign document lists the caller
    expect(reads).toEqual(['campaigns/c1']);
  });

  it('accepts a member in the (legacy) members map', async () => {
    const { db } = fakeDb({ 'campaigns/c1': { ownerId: 'o', members: { u1: true } } });
    await expect(assertCampaignMember(db, 'c1', 'u1')).resolves.toBeDefined();
  });

  it('falls back to users/{uid}.campaigns', async () => {
    const { db, reads } = fakeDb({
      'campaigns/c1': { ownerId: 'o', members: [] },
      'users/u1': { campaigns: ['c1'] },
    });
    await expect(assertCampaignMember(db, 'c1', 'u1')).resolves.toBeDefined();
    expect(reads).toEqual(['campaigns/c1', 'users/u1']);
  });

  it('rejects a non-member', async () => {
    const { db } = fakeDb({
      'campaigns/c1': { ownerId: 'o', members: ['someone'] },
      'users/u1': { campaigns: ['other'] },
    });
    await expect(assertCampaignMember(db, 'c1', 'u1')).rejects.toThrow(code('permission-denied'));
  });

  it('rejects a missing campaign', async () => {
    const { db } = fakeDb({});
    await expect(assertCampaignMember(db, 'c1', 'u1')).rejects.toThrow(code('not-found'));
  });

  it('rejects an invalid id before reading', async () => {
    const { db, reads } = fakeDb({});
    await expect(assertCampaignMember(db, 'c1/../c2', 'u1')).rejects.toThrow(code('invalid-argument'));
    expect(reads).toEqual([]);
  });
});

describe('assertCampaignOwner', () => {
  it('accepts only the owner, not members', async () => {
    const { db } = fakeDb({ 'campaigns/c1': { ownerId: 'o', members: ['u1'] } });
    await expect(assertCampaignOwner(db, 'c1', 'o')).resolves.toBeDefined();
    await expect(assertCampaignOwner(db, 'c1', 'u1')).rejects.toThrow(code('permission-denied'));
  });
});

describe('session checks', () => {
  const docs = {
    'campaigns/c1': { ownerId: 'o', members: ['u1', 'u2'] },
    'campaigns/c1/audioSessions/s1': { ownerId: 'u1', title: 'Sessie' },
  };

  it('loadSessionForMember returns the session for any member', async () => {
    const { db } = fakeDb(docs);
    await expect(loadSessionForMember(db, 'c1', 's1', 'u2')).resolves.toEqual(docs['campaigns/c1/audioSessions/s1']);
  });

  it('loadSessionForMember rejects a missing session and a bad session id', async () => {
    const { db } = fakeDb(docs);
    await expect(loadSessionForMember(db, 'c1', 's2', 'u1')).rejects.toThrow(code('not-found'));
    await expect(loadSessionForMember(db, 'c1', 's/1', 'u1')).rejects.toThrow(code('invalid-argument'));
  });

  it('assertSessionOwner requires the session owner', async () => {
    const { db } = fakeDb(docs);
    await expect(assertSessionOwner(db, 'c1', 's1', 'u1')).resolves.toBeDefined();
    await expect(assertSessionOwner(db, 'c1', 's1', 'u2')).rejects.toThrow(code('permission-denied'));
  });

  it('assertSessionOwner rejects a session owner who is no longer a member', async () => {
    const { db } = fakeDb({ ...docs, 'campaigns/c1': { ownerId: 'o', members: [] } });
    await expect(assertSessionOwner(db, 'c1', 's1', 'u1')).rejects.toThrow(code('permission-denied'));
  });
});

describe('assertCharacterOwner', () => {
  it('requires characters/{id}.userId to be the caller', async () => {
    const { db } = fakeDb({ 'characters/ch1': { userId: 'u1' } });
    await expect(assertCharacterOwner(db, 'ch1', 'u1')).resolves.toEqual({ userId: 'u1' });
    await expect(assertCharacterOwner(db, 'ch1', 'u2')).rejects.toThrow(code('permission-denied'));
    await expect(assertCharacterOwner(db, 'ch2', 'u1')).rejects.toThrow(code('not-found'));
    await expect(assertCharacterOwner(db, 'ch/1', 'u1')).rejects.toThrow(code('invalid-argument'));
  });
});
