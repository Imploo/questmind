import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const docGet = vi.fn();
const existingGet = vi.fn();
const shareCreate = vi.fn();
const shareDoc = vi.fn((_id: string) => ({ create: shareCreate }));

const mockDb = {
  doc: vi.fn((path: string) => ({ get: () => docGet(path) })),
  collection: vi.fn(() => ({
    where: vi.fn(() => ({ limit: vi.fn(() => ({ get: existingGet })) })),
    doc: shareDoc,
  })),
};

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('./utils/emulator-helpers', () => ({ ensureAuthForTesting: vi.fn() }));
vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: Function) => handler,
}));
vi.mock('./index', () => ({ SHARED_CORS: [] }));

let handler: Function;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, fn: Function) => {
      handler = fn;
      return fn;
    },
  };
});

const request = (data: Record<string, unknown>, uid = 'member-1') => ({ auth: { uid }, data });

const completedPodcast = { version: 2, status: 'completed', audioUrl: 'https://audio/v2.mp3', duration: 420 };

function mockDocs(docs: Record<string, Record<string, unknown> | null>): void {
  docGet.mockImplementation((path: string) => {
    const data = docs[path];
    return Promise.resolve({ exists: !!data, data: () => data ?? undefined });
  });
}

describe('createPodcastShare', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await import('./create-podcast-share');
    existingGet.mockResolvedValue({ empty: true, docs: [] });
    mockDocs({
      'campaigns/c1': { name: 'Curse of Strahd', ownerId: 'owner-1', members: { 'member-1': { role: 'player' } } },
      'campaigns/c1/audioSessions/s1': { title: 'De val van Vallaki', sessionDate: '2026-10-20', podcasts: [completedPodcast] },
      'campaigns/c1/campaignStories/v3': { title: 'Het verhaal tot nu toe', podcasts: [{ ...completedPodcast, version: 1 }] },
    });
  });

  it('creates a share for a session podcast with a random id', async () => {
    const result = await handler(request({ campaignId: 'c1', sessionId: 's1', podcastVersion: 2 }));

    expect(result.shareId).toMatch(/^[\w-]{22}$/);
    expect(shareDoc).toHaveBeenCalledWith(result.shareId);
    expect(shareCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'De val van Vallaki',
      subtitle: 'Curse of Strahd · 2026-10-20 · Podcast 2',
      audioUrl: 'https://audio/v2.mp3',
      durationSec: 420,
      sourceKey: 'campaigns/c1/audioSessions/s1#p2',
      campaignId: 'c1',
      createdBy: 'member-1',
    }));
  });

  it('creates a share for a campaign story podcast', async () => {
    await handler(request({ campaignId: 'c1', storyVersion: 3, podcastVersion: 1 }));

    expect(shareCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Het verhaal tot nu toe',
      subtitle: 'Curse of Strahd · Podcast 1',
      sourceKey: 'campaigns/c1/campaignStories/v3#p1',
    }));
  });

  it('returns the existing share instead of creating a new one', async () => {
    existingGet.mockResolvedValue({ empty: false, docs: [{ id: 'existing-share' }] });

    const result = await handler(request({ campaignId: 'c1', sessionId: 's1', podcastVersion: 2 }));

    expect(result).toEqual({ shareId: 'existing-share' });
    expect(shareCreate).not.toHaveBeenCalled();
  });

  it('rejects users outside the campaign', async () => {
    await expect(handler(request({ campaignId: 'c1', sessionId: 's1', podcastVersion: 2 }, 'stranger')))
      .rejects.toThrow(expect.objectContaining({ code: 'permission-denied' }));
  });

  it('rejects a podcast that is not completed', async () => {
    await expect(handler(request({ campaignId: 'c1', sessionId: 's1', podcastVersion: 9 })))
      .rejects.toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('requires exactly one of sessionId and storyVersion', async () => {
    await expect(handler(request({ campaignId: 'c1', podcastVersion: 2 })))
      .rejects.toThrow(expect.objectContaining({ code: 'invalid-argument' }));
    await expect(handler(request({ campaignId: 'c1', sessionId: 's1', storyVersion: 3, podcastVersion: 2 })))
      .rejects.toThrow(expect.objectContaining({ code: 'invalid-argument' }));
  });
});
