import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SharedCampaign } from './campaign-share/campaign-share.types';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

const loadCampaignShare = vi.fn();
const loadSharedCampaign = vi.fn();
vi.mock('./campaign-share/load-shared-campaign', () => ({
  loadCampaignShare: (...args: unknown[]) => loadCampaignShare(...args),
  loadSharedCampaign: (...args: unknown[]) => loadSharedCampaign(...args),
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('./utils/sentry-error-handler', () => ({ captureException: vi.fn(), wrapCallable: vi.fn() }));

let handler: CallableFn;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onRequest: (_config: unknown, fn: CallableFn) => {
      handler = fn;
      return fn;
    },
  };
});

const INDEX_HTML = `<!doctype html><html><head>
  <title>Questmind</title>
  <meta name="description" content="Default description">
</head><body><app-root></app-root></body></html>`;

const SHARE_ID = 'AbCdEfGhIjKlMnOpQrStUv';
const PAGE = `/share/campaign/${SHARE_ID}`;

const campaign: SharedCampaign = {
  name: 'Ansalon <Krynn>',
  playerCount: 7,
  sessionCount: 18,
  lastPlayed: '2026-10-20',
  story: {
    version: 3, title: 'De zoektocht naar de Dragonlance', content: '# Hoofdstuk 1\n\nHet **begon** in Solace.',
    completedAt: null, sourceSessions: [], sourceJournals: [], editedAt: null, podcasts: [],
  },
  sessions: [],
};

function mockResponse() {
  const res = { body: '', statusCode: 0, headers: {} as Record<string, string> };
  return Object.assign(res, {
    set: vi.fn((key: string, value: string) => { res.headers[key] = value; return res; }),
    status: vi.fn((code: number) => { res.statusCode = code; return res; }),
    send: vi.fn((body: string) => { res.body = body; return res; }),
  });
}

function mockRequest(path: string, host = 'questmind.nl') {
  const headers: Record<string, string | undefined> = { 'x-forwarded-host': host };
  return { path, hostname: 'internal', get: (name: string) => headers[name.toLowerCase()] };
}

describe('campaignSharePage', () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.GCLOUD_PROJECT = 'questmind-beta';
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(INDEX_HTML) });
    loadCampaignShare.mockResolvedValue({ campaignId: 'c1', language: 'nl' });
    loadSharedCampaign.mockResolvedValue(campaign);
    await import('./campaign-share-page');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('injects a preview with the name, the facts and the start of the story', async () => {
    const res = mockResponse();
    await handler(mockRequest(PAGE), res);

    expect(loadCampaignShare).toHaveBeenCalledWith({}, SHARE_ID);
    expect(loadSharedCampaign).toHaveBeenCalledWith({}, 'c1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Ansalon &lt;Krynn&gt; · QuestMind</title>');
    expect(res.body).toContain('<meta property="og:title" content="Ansalon &lt;Krynn&gt;">');
    expect(res.body).toContain(
      '<meta property="og:description" content="📜 18 sessies · 7 spelers · laatst gespeeld op 20 okt 2026 — ' +
      'De zoektocht naar de Dragonlance: Het begon in Solace.">'
    );
    expect(res.body).toContain(`<meta property="og:url" content="https://questmind.nl${PAGE}">`);
    expect(res.body).toContain('<meta property="og:image" content="https://questmind.nl/og/campaign-share.png">');
    expect(res.body).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(res.body).not.toContain('Default description');
  });

  it('writes the preview in the language of the sharer', async () => {
    loadCampaignShare.mockResolvedValue({ campaignId: 'c1', language: 'en' });
    loadSharedCampaign.mockResolvedValue({ ...campaign, story: null, playerCount: 1, sessionCount: 1 });
    const res = mockResponse();
    await handler(mockRequest(PAGE), res);

    expect(res.body).toContain(
      '<meta property="og:description" content="📜 1 session · 1 player · last played on 20 Oct 2026 — ' +
      'Read the stories of the sessions and listen to the podcasts.">'
    );
  });

  it('gives a page deeper in the campaign the preview of the campaign', async () => {
    const res = mockResponse();
    await handler(mockRequest(`${PAGE}/sessions/s1`), res);

    expect(loadCampaignShare).toHaveBeenCalledWith({}, SHARE_ID);
    expect(res.body).toContain(`<meta property="og:url" content="https://questmind.nl${PAGE}">`);
  });

  it('serves the unchanged app shell with 404 for an unknown share', async () => {
    loadCampaignShare.mockResolvedValue(null);
    const res = mockResponse();
    await handler(mockRequest(PAGE), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('Default description');
    expect(res.body).not.toContain('og:title');
  });
});
