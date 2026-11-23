import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { loadCampaignShare, loadSharedCampaign, toSharedPodcasts } from './load-shared-campaign';

/** Documents by path; a collection is every document directly below its path. */
let documents: Record<string, Record<string, unknown>>;
const selectSpy = vi.fn();

function snapshot(path: string) {
  return { exists: path in documents, id: path.split('/').pop(), data: () => documents[path] };
}

function collection(path: string) {
  const children = () => Object.keys(documents)
    .filter(key => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
    .map(snapshot);
  return {
    doc: (id: string) => ({ get: async () => snapshot(`${path}/${id}`) }),
    select: (...fields: string[]) => {
      selectSpy(path, fields);
      return { get: async () => ({ docs: children() }) };
    },
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({ docs: children().filter(doc => doc.data()?.[field] === value) }),
    }),
  };
}

const db = {
  doc: (path: string) => ({ get: async () => snapshot(path) }),
  collection,
} as unknown as Firestore;

const podcast = (version: number, extra: Record<string, unknown> = {}) => ({
  version,
  status: 'completed',
  audioUrl: `https://audio/p${version}.mp3`,
  duration: 300,
  fileSize: 1000,
  createdAt: new Date('2026-10-21T10:00:00Z'),
  script: { segments: [] },
  ...extra,
});

describe('loadSharedCampaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    documents = {
      'campaigns/c1': {
        name: 'Ansalon',
        ownerId: 'u1',
        ownerEmail: 'dm@example.com',
        members: { u1: {}, u2: {}, u3: {} },
        campaignStory: { latestCompletedVersion: 3 },
      },
      'campaigns/c1/audioSessions/s1': {
        title: 'De draak', sessionDate: '2026-10-20', status: 'completed', content: 'Het verhaal van s1',
        podcasts: [podcast(1), podcast(2), { version: 3, status: 'failed' }],
      },
      'campaigns/c1/audioSessions/s2': { title: 'Begin', sessionDate: '2026-09-01', status: 'completed', content: 'Het begin' },
      'campaigns/c1/audioSessions/s3': { title: 'Bezig', sessionDate: '2026-11-01', status: 'processing', content: '' },
      'campaigns/c1/audioSessions/s4': { title: 'Mislukt', sessionDate: '2026-11-02', status: 'failed', content: 'half' },
      'campaigns/c1/campaignStories/v3': {
        version: 3, status: 'completed', title: 'De zoektocht', content: 'Lang geleden...',
        completedAt: new Date('2026-11-22T01:28:00Z'),
        sourceSessions: [
          { sessionId: 's2', title: 'Begin', sessionDate: '2026-09-01', storyVersion: 1 },
          { sessionId: 's1', title: 'De draak', sessionDate: null, storyVersion: 2 },
        ],
        sourceJournals: [{ journalId: 7, title: 'Verslag', date: '2026-08-01', updatedAt: null }],
        editedAt: new Date('2026-11-22T09:00:00Z'), podcasts: [podcast(1)],
      },
    };
  });

  it('holds the story and the written sessions, newest first, and nothing private', async () => {
    const campaign = await loadSharedCampaign(db, 'c1');

    expect(campaign).toEqual({
      name: 'Ansalon',
      playerCount: 3,
      sessionCount: 2,
      lastPlayed: '2026-10-20',
      story: {
        version: 3,
        title: 'De zoektocht',
        content: 'Lang geleden...',
        completedAt: '2026-11-22T01:28:00.000Z',
        sourceSessions: [
          { sessionId: 's2', title: 'Begin', sessionDate: '2026-09-01', storyVersion: 1 },
          { sessionId: 's1', title: 'De draak', sessionDate: null, storyVersion: 2 },
        ],
        sourceJournals: [{ journalId: 7, title: 'Verslag', date: '2026-08-01', updatedAt: null }],
        editedAt: '2026-11-22T09:00:00.000Z',
        podcasts: [expect.objectContaining({ version: 1, audioUrl: 'https://audio/p1.mp3' })],
      },
      sessions: [
        expect.objectContaining({ id: 's1', title: 'De draak', sessionDate: '2026-10-20', content: 'Het verhaal van s1' }),
        expect.objectContaining({ id: 's2', title: 'Begin', podcasts: [] }),
      ],
    });
    expect(JSON.stringify(campaign)).not.toContain('dm@example.com');
    // Transcripts and recordings are never even read.
    expect(selectSpy).toHaveBeenCalledWith('campaigns/c1/audioSessions', ['title', 'sessionDate', 'content', 'status', 'podcasts']);
  });

  it('finds the newest finished story of a campaign without the pointer', async () => {
    documents['campaigns/c1'] = { name: 'Ansalon', members: ['u1'] };
    documents['campaigns/c1/campaignStories/v1'] = { version: 1, status: 'completed', content: 'Oud' };
    documents['campaigns/c1/campaignStories/v4'] = { version: 4, status: 'failed', content: '' };

    const campaign = await loadSharedCampaign(db, 'c1');

    expect(campaign?.story?.version).toBe(3);
    expect(campaign?.playerCount).toBe(1);
  });

  it('has no story when none is finished', async () => {
    delete documents['campaigns/c1/campaignStories/v3'];
    expect((await loadSharedCampaign(db, 'c1'))?.story).toBeNull();
  });

  it('returns null for a campaign that is gone', async () => {
    expect(await loadSharedCampaign(db, 'missing')).toBeNull();
  });
});

describe('toSharedPodcasts', () => {
  it('keeps finished podcasts with audio, newest first, without the script', () => {
    const podcasts = toSharedPodcasts([podcast(1), podcast(2), { version: 3, status: 'pending' }, podcast(4, { audioUrl: '' })]);

    expect(podcasts.map(p => p.version)).toEqual([2, 1]);
    expect(podcasts[0]).toEqual({
      version: 2, status: 'completed', audioUrl: 'https://audio/p2.mp3', duration: 300, fileSize: 1000,
      createdAt: '2026-10-21T10:00:00.000Z',
    });
  });

  it('is empty without podcasts', () => {
    expect(toSharedPodcasts(undefined)).toEqual([]);
  });
});

describe('loadCampaignShare', () => {
  it('ignores a malformed id without reading', async () => {
    documents = { 'campaignShares/../x': { campaignId: 'c1' } };
    expect(await loadCampaignShare(db, '../x')).toBeNull();
  });

  it('loads a share by id', async () => {
    documents = { 'campaignShares/AbCdEfGhIjKlMnOpQrStUv': { campaignId: 'c1' } };
    expect(await loadCampaignShare(db, 'AbCdEfGhIjKlMnOpQrStUv')).toEqual({ campaignId: 'c1' });
  });
});
