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

// Mock logger
vi.mock('./utils/logger', () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

// Mock firebase-functions to capture the handler
let resolveSpellHandler: CallableFn;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: CallableFn) => {
      resolveSpellHandler = handler;
      return handler;
    },
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('resolveSpell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-api-key';
  });

  // Import after mocks are set up
  beforeEach(async () => {
    await import('./resolve-spell');
  });

  function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
      auth: { uid: 'user-123' },
      data: { characterId: 'char-1', spellName: 'Fireball' },
      rawRequest: { headers: {} },
      ...overrides,
    };
  }

  // ── Auth Tests ──

  it('should reject unauthenticated callers', async () => {
    const request = makeRequest({ auth: null });

    await expect(resolveSpellHandler(request)).rejects.toThrow(
      expect.objectContaining({
        code: 'unauthenticated',
      })
    );
  });

  it('should reject callers with no uid', async () => {
    const request = makeRequest({ auth: {} });

    await expect(resolveSpellHandler(request)).rejects.toThrow(
      expect.objectContaining({
        code: 'unauthenticated',
      })
    );
  });

  // ── Input Validation Tests ──

  it('should reject missing characterId', async () => {
    const request = makeRequest({
      data: { characterId: '', spellName: 'Fireball' },
    });

    await expect(resolveSpellHandler(request)).rejects.toThrow(
      expect.objectContaining({
        code: 'invalid-argument',
      })
    );
  });

  it('should reject missing spellName', async () => {
    const request = makeRequest({
      data: { characterId: 'char-1', spellName: '' },
    });

    await expect(resolveSpellHandler(request)).rejects.toThrow(
      expect.objectContaining({
        code: 'invalid-argument',
      })
    );
  });

  // ── Delegation ──

  it('delegates to resolveCharacterEntry with the spell list and prompt', async () => {
    mockResolve.mockResolvedValueOnce({ description: 'Boom', usage: 'U' });

    const result = await resolveSpellHandler(makeRequest({
      data: { characterId: 'char-1', spellName: 'Fireball', spellLevel: 3, spellSchool: 'Evocation' },
    }));

    expect(result).toEqual({ description: 'Boom', usage: 'U' });
    expect(mockResolve).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'user-123',
      characterId: 'char-1',
      featureKey: 'spellResolution',
      listPath: 'spellcasting.spells',
      matchName: 'Fireball',
      fields: ['description', 'usage'],
      prompt: expect.stringContaining('"Fireball" (level 3 spell (Evocation))'),
    }));
  });
});
