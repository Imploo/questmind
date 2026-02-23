import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    temperature: 0.1,
    topP: 0.95,
    topK: 40,
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
  wrapCallable: (_name: string, handler: Function) => handler,
}));

vi.mock('./index', () => ({
  SHARED_CORS: ['http://localhost:4200'],
}));

vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: Function) => handler,
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
      currentCharacter: null as any,
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
