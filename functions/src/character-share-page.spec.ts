import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

// ── Fake Firestore and Storage ───────────────────────────────────────────────

/** Documents by path, and the newest-first listing of a collection by path. */
let documents: Record<string, Record<string, unknown>>;
let listings: Record<string, { id: string }[]>;
let files: Record<string, Buffer>;
const fileSave = vi.fn();

function docRef(path: string) {
  return {
    get: async () => ({ exists: path in documents, id: path.split('/').pop(), data: () => documents[path] }),
    collection: (name: string) => collectionRef(`${path}/${name}`),
  };
}

function collectionRef(path: string) {
  return {
    doc: (id: string) => docRef(`${path}/${id}`),
    orderBy: () => ({ limit: () => ({ get: async () => ({ docs: listings[path] ?? [] }) }) }),
  };
}

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: (name: string) => collectionRef(name) }),
}));
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: (path: string) => ({
        exists: async () => [path in files],
        download: async () => [files[path]],
        save: async (data: Buffer, options: unknown) => {
          fileSave(path, options);
          files[path] = data;
        },
      }),
    }),
  }),
}));
vi.mock('./utils/sentry-error-handler', () => ({ captureException: vi.fn(), wrapCallable: vi.fn() }));
vi.mock('./generate-image', () => ({ characterImagePrefix: (id: string) => `images/${id}/` }));

const renderShareBanner = vi.fn();
vi.mock('./utils/share-banner', () => ({
  BANNER_WIDTH: 1200,
  BANNER_HEIGHT: 630,
  renderShareBanner: (image: Buffer) => renderShareBanner(image),
}));

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

const CHARACTER_ID = '0b5f7c1e-93a4-4f0e-8d26-5a1f2c3d4e5f';
const IMAGE_ID = 'AbCdEfGhIjKlMnOp';
const PAGE = `/share/character/${CHARACTER_ID}`;
const BANNER = `${PAGE}/preview/${IMAGE_ID}.jpg`;
const ORIGINAL_PATH = `images/${CHARACTER_ID}/portrait.png`;
const CACHED_PATH = `share-previews/${CHARACTER_ID}/${IMAGE_ID}.jpg`;

const character = {
  name: 'Vesper "Ash" <Ashborne>',
  class: 'Paladin',
  level: 5,
  race: 'Tiefling',
  background: 'Soldier',
  alignment: 'Lawful Good',
  backstory: 'Raised in the **ashes** of a burned temple,\nVesper swore an oath to the dawn.',
};

function mockResponse() {
  const res = { body: '' as string | Buffer, statusCode: 0, headers: {} as Record<string, string>, redirectedTo: '' };
  return Object.assign(res, {
    set: vi.fn((key: string, value: string) => { res.headers[key] = value; return res; }),
    status: vi.fn((code: number) => { res.statusCode = code; return res; }),
    send: vi.fn((body: string | Buffer) => { res.body = body; return res; }),
    redirect: vi.fn((code: number, url: string) => { res.statusCode = code; res.redirectedTo = url; return res; }),
  });
}

function mockRequest(path: string, host = 'questmind.nl') {
  return { path, hostname: 'internal', get: (name: string) => (name === 'x-forwarded-host' ? host : undefined) };
}

describe('characterSharePage', () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.GCLOUD_PROJECT = 'questmind-beta';
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(INDEX_HTML) });

    documents = {
      [`characters/${CHARACTER_ID}`]: { name: 'Vesper', activeVersionId: 'v2' },
      [`characters/${CHARACTER_ID}/versions/v2`]: { character },
      [`characters/${CHARACTER_ID}/images/${IMAGE_ID}`]: { storagePath: ORIGINAL_PATH },
    };
    listings = { [`characters/${CHARACTER_ID}/images`]: [{ id: IMAGE_ID }] };
    files = { [ORIGINAL_PATH]: Buffer.from('original') };
    renderShareBanner.mockResolvedValue(Buffer.from('banner'));

    await import('./character-share-page');
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('page', () => {
    it('injects escaped Open Graph tags for the character into the app shell', async () => {
      const res = mockResponse();
      await handler(mockRequest(PAGE), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('<title>Vesper &quot;Ash&quot; &lt;Ashborne&gt; · QuestMind</title>');
      expect(res.body).toContain('<meta property="og:title" content="Vesper &quot;Ash&quot; &lt;Ashborne&gt;">');
      expect(res.body).toContain(
        '<meta property="og:description" content="⚔️ Level 5 Tiefling Paladin · Soldier · Lawful Good — ' +
        'Raised in the ashes of a burned temple, Vesper swore an oath to the dawn.">'
      );
      expect(res.body).toContain(`<meta property="og:url" content="https://questmind.nl${PAGE}">`);
      expect(res.body).toContain(`<meta property="og:image" content="https://questmind.nl${BANNER}">`);
      expect(res.body).toContain('<meta property="og:image:width" content="1200">');
      expect(res.body).not.toContain('Default description');
      expect(res.body).toContain('<app-root></app-root>');
    });

    it('uses the default banner for a character without a portrait', async () => {
      listings = {};
      const res = mockResponse();
      await handler(mockRequest(PAGE), res);

      expect(res.body).toContain('<meta property="og:image" content="https://questmind.nl/og/character-share.png">');
    });

    it('cuts a long backstory at a word boundary', async () => {
      documents[`characters/${CHARACTER_ID}/versions/v2`] = {
        character: { ...character, backstory: 'word '.repeat(80) },
      };
      const res = mockResponse();
      await handler(mockRequest(PAGE), res);

      const description = /og:description" content="([^"]*)"/.exec(res.body as string)?.[1] ?? '';
      expect(description.endsWith('word…')).toBe(true);
      expect(description.length).toBeLessThan(230);
    });

    it('falls back to the name on the character document and a call to action', async () => {
      delete documents[`characters/${CHARACTER_ID}/versions/v2`];
      const res = mockResponse();
      await handler(mockRequest(PAGE), res);

      expect(res.body).toContain('<meta property="og:title" content="Vesper">');
      expect(res.body).toContain('og:description" content="⚔️ bekijk de character sheet"');
    });

    it('uses the project domain for links when the host is not allowed', async () => {
      const res = mockResponse();
      await handler(mockRequest(PAGE, 'evil.example.com'), res);

      expect(res.body).toContain(`content="https://questmind-beta.web.app${PAGE}"`);
    });

    it('serves the unchanged app shell with 404 for an unknown character', async () => {
      documents = {};
      const res = mockResponse();
      await handler(mockRequest(PAGE), res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toBe(INDEX_HTML);
    });

    it('serves the app shell with 404 for a malformed id', async () => {
      const res = mockResponse();
      await handler(mockRequest('/share/character/x'), res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toBe(INDEX_HTML);
    });

    it('falls back to a minimal page when the app shell is unavailable', async () => {
      fetchMock.mockRejectedValue(new Error('network'));
      const res = mockResponse();
      await handler(mockRequest(PAGE), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('og:title');
      expect(res.body).toContain(`<a href="/characters/${CHARACTER_ID}">`);
    });
  });

  describe('banner image', () => {
    it('renders the portrait once, caches it and serves it as an immutable JPEG', async () => {
      const res = mockResponse();
      await handler(mockRequest(BANNER), res);

      expect(renderShareBanner).toHaveBeenCalledWith(Buffer.from('original'));
      expect(fileSave).toHaveBeenCalledWith(CACHED_PATH, expect.objectContaining({
        metadata: expect.objectContaining({ contentType: 'image/jpeg' }),
      }));
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('image/jpeg');
      expect(res.headers['Cache-Control']).toContain('immutable');
      expect(res.body).toEqual(Buffer.from('banner'));
    });

    it('serves a cached banner without rendering again', async () => {
      files[CACHED_PATH] = Buffer.from('cached');
      const res = mockResponse();
      await handler(mockRequest(BANNER), res);

      expect(renderShareBanner).not.toHaveBeenCalled();
      expect(res.body).toEqual(Buffer.from('cached'));
    });

    it('redirects to the default banner for an unknown portrait', async () => {
      delete documents[`characters/${CHARACTER_ID}/images/${IMAGE_ID}`];
      const res = mockResponse();
      await handler(mockRequest(BANNER), res);

      expect(res.statusCode).toBe(302);
      expect(res.redirectedTo).toBe('https://questmind.nl/og/character-share.png');
    });

    it('refuses a portrait whose file is outside the folder of the character', async () => {
      documents[`characters/${CHARACTER_ID}/images/${IMAGE_ID}`] = { storagePath: 'audio/someone-else.mp3' };
      files['audio/someone-else.mp3'] = Buffer.from('secret');
      const res = mockResponse();
      await handler(mockRequest(BANNER), res);

      expect(renderShareBanner).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(302);
    });

    it('redirects to the default banner when rendering fails', async () => {
      renderShareBanner.mockRejectedValue(new Error('ffmpeg'));
      const res = mockResponse();
      await handler(mockRequest(BANNER), res);

      expect(res.statusCode).toBe(302);
    });

    it('does not touch Storage for malformed ids', async () => {
      const res = mockResponse();
      await handler(mockRequest(`/share/character/${CHARACTER_ID}/preview/x.jpg`), res);

      expect(res.statusCode).toBe(302);
      expect(fileSave).not.toHaveBeenCalled();
    });
  });
});
