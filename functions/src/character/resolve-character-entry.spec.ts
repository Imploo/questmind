import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const docs: Record<string, Record<string, unknown> | undefined> = {};
const mockUpdate = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({
      get: async () => ({ exists: docs[path] !== undefined, data: () => docs[path] }),
      update: (data: unknown) => mockUpdate(path, data),
    }),
  }),
}));

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

vi.mock('../utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({ model: 'gemini-test', maxOutputTokens: 4096 })),
}));

vi.mock('../utils/logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import { resolveCharacterEntry } from './resolve-character-entry';

// ── Tests ────────────────────────────────────────────────────────────────────

const spellOptions = (overrides: Record<string, unknown> = {}) => ({
  label: 'resolveSpell',
  uid: 'user-123',
  characterId: 'char-1',
  featureKey: 'spellResolution' as const,
  prompt: 'Describe Fireball',
  listPath: 'spellcasting.spells',
  matchName: 'Fireball',
  fields: ['description', 'usage'] as ('description' | 'usage')[],
  ...overrides,
});

describe('resolveCharacterEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(docs)) delete docs[key];
    process.env.GOOGLE_AI_API_KEY = 'test-api-key';
    docs['characters/char-1'] = { userId: 'user-123', activeVersionId: null };
  });

  it('rejects a missing character', async () => {
    delete docs['characters/char-1'];
    await expect(resolveCharacterEntry(spellOptions())).rejects.toThrow(expect.objectContaining({ code: 'not-found' }));
  });

  it('rejects a caller who does not own the character', async () => {
    docs['characters/char-1'] = { userId: 'other-user' };
    await expect(resolveCharacterEntry(spellOptions())).rejects.toThrow(
      expect.objectContaining({ code: 'permission-denied' })
    );
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('rejects a character id with a slash', async () => {
    await expect(resolveCharacterEntry(spellOptions({ characterId: 'a/b' }))).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('rejects when the API key is not configured', async () => {
    delete process.env.GOOGLE_AI_API_KEY;
    await expect(resolveCharacterEntry(spellOptions())).rejects.toThrow(
      expect.objectContaining({ code: 'failed-precondition' })
    );
  });

  it('returns the parsed fields (code fences stripped)', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: '```json\n' + JSON.stringify({ description: 'Boom', usage: 'Casting Time: 1 action', extra: 'x' }) + '\n```',
    });

    await expect(resolveCharacterEntry(spellOptions())).resolves.toEqual({
      description: 'Boom',
      usage: 'Casting Time: 1 action',
    });
    expect(mockGenerateContent).toHaveBeenCalledWith(expect.objectContaining({ contents: 'Describe Fireball' }));
  });

  it('throws internal for unparseable output or missing fields', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'not json' });
    await expect(resolveCharacterEntry(spellOptions())).rejects.toThrow(expect.objectContaining({ code: 'internal' }));

    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ description: 'no usage' }) });
    await expect(resolveCharacterEntry(spellOptions())).rejects.toThrow(expect.objectContaining({ code: 'internal' }));
  });

  it('patches the matching entry of the active version', async () => {
    docs['characters/char-1'] = { userId: 'user-123', activeVersionId: 'v1' };
    docs['characters/char-1/versions/v1'] = {
      character: { spellcasting: { spells: ['Light', { name: 'fireball' }, { name: 'Shield' }] } },
    };
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ description: 'Boom', usage: 'U' }) });

    await resolveCharacterEntry(spellOptions());

    expect(mockUpdate).toHaveBeenCalledWith('characters/char-1/versions/v1', {
      'character.spellcasting.spells': ['Light', { name: 'fireball', description: 'Boom', usage: 'U' }, { name: 'Shield' }],
    });
  });

  it('does not fail the request when the patch fails', async () => {
    docs['characters/char-1'] = { userId: 'user-123', activeVersionId: 'v1' };
    docs['characters/char-1/versions/v1'] = { character: { featuresAndTraits: [{ name: 'Darkvision' }] } };
    mockUpdate.mockRejectedValueOnce(new Error('write failed'));
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ description: 'See in the dark' }) });

    await expect(resolveCharacterEntry(spellOptions({
      featureKey: 'featureResolution',
      listPath: 'featuresAndTraits',
      matchName: 'Darkvision',
      fields: ['description'],
    }))).resolves.toEqual({ description: 'See in the dark' });
  });
});
