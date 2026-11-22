import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

// ── Mocks ────────────────────────────────────────────────────────────────────

let docs: Record<string, Record<string, unknown> | null> = {};
const txUpdate = vi.fn();
const shareDelete = vi.fn();
const sharesWhere = vi.fn();
const shareDocs = vi.fn<() => { ref: { delete: typeof shareDelete } }[]>(() => []);

const snapshot = (path: string) => ({ exists: !!docs[path], data: () => docs[path] ?? undefined });

const mockDb = {
  doc: vi.fn((path: string) => ({ path, get: () => Promise.resolve(snapshot(path)) })),
  runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      get: (ref: { path: string }) => Promise.resolve(snapshot(ref.path)),
      update: txUpdate,
    })
  ),
  collection: vi.fn(() => ({
    where: (...args: unknown[]) => {
      sharesWhere(...args);
      return { get: () => Promise.resolve({ docs: shareDocs() }) };
    },
  })),
};

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockDb,
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}));
vi.mock('./utils/emulator-helpers', () => ({ ensureAuthForTesting: vi.fn() }));
vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: CallableFn) => handler,
}));
const deleteStorageFiles = vi.fn();
vi.mock('./utils/storage-cleanup', () => ({ deleteStorageFiles: (paths: string[]) => deleteStorageFiles(paths) }));
const markCompleted = vi.fn();
vi.mock('./services/progress-tracker.service', () => ({
  ProgressTrackerService: { markCompleted: (...args: unknown[]) => markCompleted(...args) },
}));

let handler: CallableFn;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, fn: CallableFn) => {
      handler = fn;
      return fn;
    },
  };
});

const request = (data: Record<string, unknown>, uid = 'owner-1') => ({ auth: { uid }, data });

const SESSION = 'campaigns/c1/audioSessions/s1';
const STORY = 'campaigns/c1/campaignStories/v3';
const completed = { version: 1, status: 'completed', audioUrl: 'https://audio/v1.mp3' };
const failed = { version: 2, status: 'failed', error: 'TTS quota exceeded', createdAt: new Date() };

describe('deletePodcast', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await import('./delete-podcast');
    shareDocs.mockReturnValue([]);
    docs = {
      'campaigns/c1': { name: 'Curse of Strahd', ownerId: 'owner-1', members: { 'owner-1': {}, 'member-1': {} } },
      [SESSION]: { title: 'De val van Vallaki', podcasts: [completed, failed], latestPodcastVersion: 2 },
      [STORY]: { title: 'Het verhaal tot nu toe', podcasts: [{ ...completed }] },
    };
  });

  it('removes a session podcast, its audio and its share links', async () => {
    shareDocs.mockReturnValue([{ ref: { delete: shareDelete } }]);

    const result = await handler(request({ campaignId: 'c1', sessionId: 's1', podcastVersion: 1 }));

    expect(result).toEqual({ deleted: true });
    expect(txUpdate).toHaveBeenCalledWith(expect.objectContaining({ path: SESSION }), {
      podcasts: [failed],
      updatedAt: 'SERVER_TIMESTAMP',
    });
    expect(deleteStorageFiles).toHaveBeenCalledWith(['campaigns/c1/podcasts/s1/v1.mp3']);
    expect(sharesWhere).toHaveBeenCalledWith('sourceKey', '==', `${SESSION}#p1`);
    expect(shareDelete).toHaveBeenCalled();
  });

  it('removes a campaign story podcast', async () => {
    await handler(request({ campaignId: 'c1', storyVersion: 3, podcastVersion: 1 }));

    expect(txUpdate).toHaveBeenCalledWith(expect.objectContaining({ path: STORY }), { podcasts: [] });
    expect(deleteStorageFiles).toHaveBeenCalledWith(['campaigns/c1/campaign-story-podcasts/v3/p1.mp3']);
  });

  it('removes a failed podcast and the failure it left on the session', async () => {
    docs[SESSION] = {
      ...docs[SESSION],
      progress: { stage: 'failed', error: 'TTS quota exceeded\n\nDetails: "stack"' },
    };

    await handler(request({ campaignId: 'c1', sessionId: 's1', podcastVersion: 2 }));

    expect(txUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ podcasts: [completed] }));
    expect(markCompleted).toHaveBeenCalledWith('c1', 's1', 'Podcast deleted');
  });

  it('leaves a failure of something else on the session alone', async () => {
    docs[SESSION] = { ...docs[SESSION], progress: { stage: 'failed', error: 'Transcription failed' } };

    await handler(request({ campaignId: 'c1', sessionId: 's1', podcastVersion: 2 }));

    expect(markCompleted).not.toHaveBeenCalled();
  });

  it('lets only the campaign owner delete', async () => {
    await expect(handler(request({ campaignId: 'c1', sessionId: 's1', podcastVersion: 1 }, 'member-1')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(txUpdate).not.toHaveBeenCalled();
    expect(deleteStorageFiles).not.toHaveBeenCalled();
  });

  it('refuses a podcast that is still being made', async () => {
    docs[SESSION] = { podcasts: [{ version: 3, status: 'pending', createdAt: new Date() }] };

    await expect(handler(request({ campaignId: 'c1', sessionId: 's1', podcastVersion: 3 })))
      .rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'podcast-generating' } });
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('deletes a podcast whose generation was abandoned', async () => {
    const abandoned = { version: 3, status: 'pending', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) };
    docs[SESSION] = { podcasts: [abandoned] };

    const result = await handler(request({ campaignId: 'c1', sessionId: 's1', podcastVersion: 3 }));

    expect(result).toEqual({ deleted: true });
  });

  it('reports a podcast that is already gone without touching anything', async () => {
    const result = await handler(request({ campaignId: 'c1', sessionId: 's1', podcastVersion: 9 }));

    expect(result).toEqual({ deleted: false });
    expect(txUpdate).not.toHaveBeenCalled();
    expect(deleteStorageFiles).not.toHaveBeenCalled();
  });

  it('wants exactly one of a session and a story version', async () => {
    await expect(handler(request({ campaignId: 'c1', podcastVersion: 1 })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(handler(request({ campaignId: 'c1', sessionId: 's1', storyVersion: 3, podcastVersion: 1 })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
