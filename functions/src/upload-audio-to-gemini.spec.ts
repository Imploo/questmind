import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockVerifyIdToken = vi.fn().mockResolvedValue({ uid: 'user-123' });
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
  }),
}));

vi.mock('./utils/sentry-error-handler', () => ({
  wrapHttp: (_name: string, handler: Function) => handler,
}));

vi.mock('./utils/logger', () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

let uploadHandler: Function;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onRequest: (_config: unknown, handler: Function) => {
      uploadHandler = handler;
      return handler;
    },
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(overrides: Record<string, unknown> = {}): any {
  return {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
    },
    query: {},
    body: {},
    readableEnded: true,
    rawBody: Buffer.from('audio-data'),
    ...overrides,
  };
}

function makeRes(): any {
  const res: any = {
    statusCode: 0,
    body: null,
    headersSent: false,
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: unknown) => {
    res.body = data;
    return res;
  });
  res.send = vi.fn((data: unknown) => {
    res.body = data;
    return res;
  });
  return res;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('uploadAudioToGemini', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-api-key';
  });

  beforeEach(async () => {
    await import('./upload-audio-to-gemini');
  });

  // ── HTTP Method Tests ──

  it('should handle OPTIONS preflight request', async () => {
    const req = makeReq({ method: 'OPTIONS' });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('should reject non-POST methods', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.body).toEqual(expect.objectContaining({ error: expect.stringContaining('Method not allowed') }));
  });

  // ── Auth Tests ──

  it('should reject requests without authorization header', async () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should reject requests with invalid bearer format', async () => {
    const req = makeReq({ headers: { authorization: 'Basic abc123' } });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should reject invalid Firebase auth token', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));

    const req = makeReq();
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  // ── Action Routing Tests ──

  it('should reject requests without action parameter', async () => {
    const req = makeReq({ query: {} });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(expect.objectContaining({ error: expect.stringContaining('action') }));
  });

  it('should reject invalid action parameter', async () => {
    const req = makeReq({ query: { action: 'invalid' } });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  // ── SSRF Protection Tests ──

  it('should reject upload URLs not pointing to Gemini', async () => {
    const req = makeReq({
      query: { action: 'upload' },
      headers: {
        authorization: 'Bearer valid-token',
        'x-upload-url': 'https://evil-site.com/steal-data',
        'x-upload-offset': '0',
        'x-is-final': 'false',
        'x-mime-type': 'audio/mpeg',
      },
    });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(expect.objectContaining({ error: 'Invalid upload URL' }));
  });

  it('should reject upload URLs pointing to internal networks', async () => {
    const req = makeReq({
      query: { action: 'upload' },
      headers: {
        authorization: 'Bearer valid-token',
        'x-upload-url': 'http://169.254.169.254/metadata',
        'x-upload-offset': '0',
        'x-is-final': 'false',
        'x-mime-type': 'audio/mpeg',
      },
    });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(expect.objectContaining({ error: 'Invalid upload URL' }));
  });

  it('should allow upload URLs pointing to Gemini API', async () => {
    // Mock global fetch for the Gemini upload call
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal('fetch', mockFetch);

    const req = makeReq({
      query: { action: 'upload' },
      headers: {
        authorization: 'Bearer valid-token',
        'x-upload-url': 'https://generativelanguage.googleapis.com/upload/session/abc123',
        'x-upload-offset': '0',
        'x-is-final': 'false',
        'x-mime-type': 'audio/mpeg',
      },
    });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    vi.unstubAllGlobals();
  });

  // ── Init Action Tests ──

  it('should reject init with unsupported mime type', async () => {
    const req = makeReq({
      query: { action: 'init' },
      body: { mimeType: 'video/mp4', fileName: 'video.mp4', fileSize: 1000 },
    });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(expect.objectContaining({
      error: expect.stringContaining('mime type'),
    }));
  });

  it('should reject init with missing fileSize', async () => {
    const req = makeReq({
      query: { action: 'init' },
      body: { mimeType: 'audio/mpeg', fileName: 'audio.mp3' },
    });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(expect.objectContaining({ error: expect.stringContaining('fileSize') }));
  });

  it('should reject init with file exceeding 500MB', async () => {
    const req = makeReq({
      query: { action: 'init' },
      body: { mimeType: 'audio/mpeg', fileName: 'audio.mp3', fileSize: 600 * 1024 * 1024 },
    });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(413);
  });

  // ── Upload Action Validation Tests ──

  it('should reject upload without X-Upload-Url header', async () => {
    const req = makeReq({
      query: { action: 'upload' },
      headers: {
        authorization: 'Bearer valid-token',
      },
    });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(expect.objectContaining({ error: expect.stringContaining('X-Upload-Url') }));
  });

  it('should reject upload without X-Upload-Offset header', async () => {
    const req = makeReq({
      query: { action: 'upload' },
      headers: {
        authorization: 'Bearer valid-token',
        'x-upload-url': 'https://generativelanguage.googleapis.com/upload/session/abc',
      },
    });
    const res = makeRes();

    await uploadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(expect.objectContaining({ error: expect.stringContaining('X-Upload-Offset') }));
  });
});
