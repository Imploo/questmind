import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;
import type { DndCharacter } from './schemas/dnd-character.schema';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDocRef = { id: 'new-doc-id', set: mockSet };
const mockOrderBy = vi.fn(() => ({
  limit: vi.fn(() => ({
    get: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  })),
}));
const mockVersionsCollection = vi.fn(() => ({
  orderBy: mockOrderBy,
  doc: vi.fn(() => mockDocRef),
}));
const mockCharDoc = vi.fn(() => ({
  update: mockUpdate,
  collection: mockVersionsCollection,
}));
const mockCollection = vi.fn(() => ({ doc: mockCharDoc }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: mockCollection }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
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
    maxOutputTokens: 8192,
  })),
}));

const mockSchemaParse = vi.fn((x: unknown) => x);
vi.mock('./schemas/dnd-character.schema', () => ({
  DndCharacterSchema: { parse: mockSchemaParse },
  DndCharacter: {},
}));

vi.mock('./prompts/character-json-generator.prompt', () => ({
  CHARACTER_JSON_GENERATOR_PROMPT: 'test system prompt',
}));

vi.mock('./utils/sentry-error-handler', () => ({
  captureFunctionError: vi.fn(),
  wrapCallable: (_name: string, handler: CallableFn) => handler,
}));

const mockAssertCharacterOwner = vi.fn();
vi.mock('./utils/access', async () => {
  const actual = await vi.importActual<typeof import('./utils/access')>('./utils/access');
  return { ...actual, assertCharacterOwner: (...args: unknown[]) => mockAssertCharacterOwner(...args) };
});

let callableHandler: CallableFn;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: CallableFn) => {
      callableHandler = handler;
      return handler;
    },
  };
});

vi.mock('./utils/logger', () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('executeGenerateCharacterDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-api-key';
  });

  function makePayload(overrides: Record<string, unknown> = {}) {
    return {
      characterId: 'char-1',
      currentCharacter: { name: 'Gandalf', class: 'Wizard' } as DndCharacter,
      chatHistory: [
        { role: 'user' as const, content: 'Make me stronger' },
        { role: 'assistant' as const, content: 'Updating strength' },
      ],
      ai1Response: 'I will increase your strength score.',
      ...overrides,
    };
  }

  it('should return early when required payload fields are missing', async () => {
    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');

    await executeGenerateCharacterDraft({
      characterId: '',
      currentCharacter: null as unknown as DndCharacter,
      chatHistory: [],
      ai1Response: '',
    });

    // Should not have called AI
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('should call AI with conversation context and update Firestore', async () => {
    const character = { name: 'Gandalf', class: 'Wizard', strength: 18 };
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(character),
    });
    mockSchemaParse.mockReturnValueOnce(character);

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    await executeGenerateCharacterDraft(makePayload());

    // Should have called AI
    expect(mockGenerateContent).toHaveBeenCalledOnce();

    // Should have cleared isGenerating flag
    expect(mockUpdate).toHaveBeenCalledWith({ isGenerating: false });
  });

  it('should throw when AI returns empty response', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '' });

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');

    await expect(executeGenerateCharacterDraft(makePayload())).rejects.toThrow(
      'No response from AI model'
    );
  });

  it('should throw when AI returns invalid JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'not valid json' });

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');

    await expect(executeGenerateCharacterDraft(makePayload())).rejects.toThrow();
  });

  it('should throw when Zod validation fails', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ invalid: 'data' }),
    });
    mockSchemaParse.mockImplementationOnce(() => {
      throw new Error('Zod validation failed');
    });

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');

    await expect(executeGenerateCharacterDraft(makePayload())).rejects.toThrow(
      'Zod validation failed'
    );
  });
});

describe('generateCharacterDraftCallable', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-api-key';
    await import('./generate-character-draft');
  });

  const request = (overrides: Record<string, unknown> = {}) => ({
    auth: { uid: 'user-123' },
    data: {
      characterId: 'char-1',
      currentCharacter: { name: 'Gandalf' },
      chatHistory: [{ role: 'user', content: 'Hi' }],
      ai1Response: 'Ok',
    },
    ...overrides,
  });

  it('rejects unauthenticated callers', async () => {
    await expect(callableHandler(request({ auth: null }))).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  it('rejects non-owners without touching the character', async () => {
    const { HttpsError } = await import('firebase-functions/v2/https');
    mockAssertCharacterOwner.mockRejectedValueOnce(new HttpsError('permission-denied', 'Not authorized'));

    await expect(callableHandler(request())).rejects.toThrow(
      expect.objectContaining({ code: 'permission-denied' })
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('generates the draft for the owner', async () => {
    mockAssertCharacterOwner.mockResolvedValueOnce({ userId: 'user-123' });
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ name: 'Gandalf' }) });

    await expect(callableHandler(request())).resolves.toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith({ isGenerating: true });
    expect(mockUpdate).toHaveBeenCalledWith({ isGenerating: false });
  });
});
