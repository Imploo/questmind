import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockResolve = vi.fn();
vi.mock('./character/resolve-character-entry', () => ({
  resolveCharacterEntry: (...args: unknown[]) => mockResolve(...args),
}));

vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: CallableFn) => handler,
}));

vi.mock('./utils/logger', () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

let resolveFeatureHandler: CallableFn;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: CallableFn) => {
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

  // ── Delegation ──

  it('delegates to resolveCharacterEntry with optional context in the prompt', async () => {
    mockResolve.mockResolvedValueOnce({ description: 'Test feature description' });

    const result = await resolveFeatureHandler(makeRequest({
      data: {
        characterId: 'char-1',
        featureName: 'Action Surge',
        featureSource: 'Class Feature',
        characterClass: 'Fighter',
        characterRace: 'Human',
      },
    }));

    expect(result).toEqual({ description: 'Test feature description' });
    expect(mockResolve).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'featureResolution',
      listPath: 'featuresAndTraits',
      matchName: 'Action Surge',
      fields: ['description'],
      prompt: expect.stringContaining('source: Class Feature, class: Fighter, race: Human'),
    }));
  });
});
