import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

// ── Mocks ────────────────────────────────────────────────────────────────────

const shareGet = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: shareGet }) }) }),
}));
vi.mock('./utils/sentry-error-handler', () => ({ captureException: vi.fn(), wrapCallable: vi.fn() }));
vi.mock('./index', () => ({ SHARED_CORS: [] }));

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

const share = {
  title: 'De val van "Vallaki" <$&>',
  subtitle: 'Curse of Strahd · 2026-10-20 · Podcast 2',
  audioUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/v2.mp3?alt=media&token=abc',
  durationSec: 420,
};

const SHARE_ID = 'AbCdEfGhIjKlMnOpQrStUv';

function mockResponse() {
  const res = { body: '', statusCode: 0, headers: {} as Record<string, string> };
  return Object.assign(res, {
    set: vi.fn((key: string, value: string) => { res.headers[key] = value; return res; }),
    status: vi.fn((code: number) => { res.statusCode = code; return res; }),
    send: vi.fn((body: string) => { res.body = body; return res; }),
  });
}

function mockRequest(path: string, host = 'questmind.nl') {
  return { path, hostname: 'internal', get: (name: string) => (name === 'x-forwarded-host' ? host : undefined) };
}

describe('podcastSharePage', () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.GCLOUD_PROJECT = 'questmind-beta';
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(INDEX_HTML) });
    shareGet.mockResolvedValue({ exists: true, data: () => share });
    await import('./podcast-share-page');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('injects escaped Open Graph tags into the app shell', async () => {
    const res = mockResponse();
    await handler(mockRequest(`/share/podcast/${SHARE_ID}`), res);

    expect(fetchMock).toHaveBeenCalledWith('https://questmind-beta.web.app/index.html');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>De val van &quot;Vallaki&quot; &lt;$&amp;&gt; · QuestMind</title>');
    expect(res.body).toContain('<meta property="og:title" content="De val van &quot;Vallaki&quot; &lt;$&amp;&gt;">');
    expect(res.body).toContain(`<meta property="og:url" content="https://questmind.nl/share/podcast/${SHARE_ID}">`);
    expect(res.body).toContain('<meta property="og:image" content="https://questmind.nl/og/podcast-share.png">');
    expect(res.body).toContain('og:audio" content="https://firebasestorage.googleapis.com/v0/b/x/o/v2.mp3?alt=media&amp;token=abc"');
    expect(res.body).not.toContain('Default description');
    expect(res.body).toContain('<app-root></app-root>');
  });

  it('uses the project domain for links when the host is not allowed', async () => {
    const res = mockResponse();
    await handler(mockRequest(`/share/podcast/${SHARE_ID}`, 'evil.example.com'), res);

    expect(res.body).toContain(`content="https://questmind-beta.web.app/share/podcast/${SHARE_ID}"`);
  });

  it('serves the unchanged app shell with 404 for an unknown share', async () => {
    shareGet.mockResolvedValue({ exists: false, data: () => undefined });
    const res = mockResponse();
    await handler(mockRequest(`/share/podcast/${SHARE_ID}`), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toBe(INDEX_HTML);
  });

  it('does not query Firestore for a malformed share id', async () => {
    const res = mockResponse();
    await handler(mockRequest('/share/podcast/x'), res);

    expect(shareGet).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it('falls back to a minimal player page when the app shell is unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const res = mockResponse();
    await handler(mockRequest(`/share/podcast/${SHARE_ID}`), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<audio controls');
    expect(res.body).toContain('og:title');
  });
});
