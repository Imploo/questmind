import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockDoc = vi.fn(() => ({ get: mockGet, update: mockUpdate, collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockGet, update: mockUpdate })) })) }));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: mockCollection, doc: mockDoc }),
}));

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

vi.mock('./utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({
    model: 'gemini-test',
    temperature: 0.3,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 4096,
  })),
}));

vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: Function) => handler,
}));

vi.mock('./index', () => ({
  SHARED_CORS: ['http://localhost:4200'],
}));

vi.mock('./utils/logger', () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

let resolveFeatureHandler: Function;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: Function) => {
      resolveFeatureHandler = handler;
      return handler;
    },
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('resolveFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-api-key';
  });

  beforeEach(async () => {
    await import('./resolve-feature');
  });

  function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
      auth: { uid: 'user-123' },
      data: { characterId: 'char-1', featureName: 'Darkvision' },
      rawRequest: { headers: {} },
      ...overrides,
    };
  }

  // ── Auth Tests ──

  it('should reject unauthenticated callers', async () => {
    const request = makeRequest({ auth: null });

    await expect(resolveFeatureHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  it('should reject callers with no uid', async () => {
    const request = makeRequest({ auth: {} });

    await expect(resolveFeatureHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  // ── Input Validation Tests ──

  it('should reject missing characterId', async () => {
    const request = makeRequest({
      data: { characterId: '', featureName: 'Darkvision' },
    });

    await expect(resolveFeatureHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('should reject missing featureName', async () => {
    const request = makeRequest({
      data: { characterId: 'char-1', featureName: '' },
    });

    await expect(resolveFeatureHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  // ── Ownership Tests ──

  it('should reject if character does not exist', async () => {
    mockGet.mockResolvedValueOnce({ exists: false, data: () => null });

    const request = makeRequest();
    await expect(resolveFeatureHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'permission-denied' })
    );
  });

  it('should reject if caller does not own the character', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ userId: 'other-user' }),
    });

    const request = makeRequest();
    await expect(resolveFeatureHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'permission-denied' })
    );
  });

  // ── API Key Tests ──

  it('should reject if API key is not configured', async () => {
    delete process.env.GOOGLE_AI_API_KEY;

    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ userId: 'user-123' }),
    });

    const request = makeRequest();
    await expect(resolveFeatureHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'failed-precondition' })
    );
  });

  // ── Happy Path Tests ──

  it('should return parsed AI response for a valid request', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ userId: 'user-123', activeVersionId: null }),
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ description: 'You can see in the dark up to 60 feet.' }),
    });

    const request = makeRequest();
    const result = await resolveFeatureHandler(request);

    expect(result).toEqual({
      description: 'You can see in the dark up to 60 feet.',
    });
  });

  it('should pass optional context (source, class, race) to AI prompt', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ userId: 'user-123', activeVersionId: null }),
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ description: 'Test feature description' }),
    });

    const request = makeRequest({
      data: {
        characterId: 'char-1',
        featureName: 'Action Surge',
        featureSource: 'Class Feature',
        characterClass: 'Fighter',
        characterRace: 'Human',
      },
    });

    const result = await resolveFeatureHandler(request);
    expect(result).toEqual({ description: 'Test feature description' });

    // Verify context was included in the AI call
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.stringContaining('source: Class Feature'),
      })
    );
  });

  it('should strip markdown code fences from AI response', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ userId: 'user-123', activeVersionId: null }),
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: '```json\n{"description": "Test"}\n```',
    });

    const request = makeRequest();
    const result = await resolveFeatureHandler(request);

    expect(result).toEqual({ description: 'Test' });
  });

  it('should throw internal error for unparseable AI response', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ userId: 'user-123', activeVersionId: null }),
    });

    mockGenerateContent.mockResolvedValueOnce({ text: 'not json' });

    const request = makeRequest();
    await expect(resolveFeatureHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'internal' })
    );
  });

  it('should throw internal error when description field is missing', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ userId: 'user-123', activeVersionId: null }),
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ name: 'no description field' }),
    });

    const request = makeRequest();
    await expect(resolveFeatureHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'internal' })
    );
  });
});
