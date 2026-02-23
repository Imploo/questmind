import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
  Part: {},
}));

vi.mock('./utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({
    model: 'gemini-test',
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 4096,
  })),
}));

vi.mock('./prompts/character-responder.prompt', () => ({
  CHARACTER_RESPONDER_PROMPT: 'test system prompt',
}));

vi.mock('./schemas/dnd-character.schema', () => ({
  DndCharacterSchema: { parse: vi.fn((x: unknown) => x) },
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

let characterChatHandler: Function;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: Function) => {
      characterChatHandler = handler;
      return handler;
    },
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('characterChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-google-key';
  });

  beforeEach(async () => {
    await import('./character-chat');
  });

  const mockCharacter = { name: 'Gandalf', class: 'Wizard' };

  function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
      auth: { uid: 'user-123' },
      data: {
        characterId: 'char-1',
        currentCharacter: mockCharacter,
        chatHistory: [{ role: 'user', content: 'What spells do I know?' }],
      },
      rawRequest: { headers: {} },
      ...overrides,
    };
  }

  // ── Auth Tests ──

  it('should reject unauthenticated callers', async () => {
    const request = makeRequest({ auth: null });

    await expect(characterChatHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  // ── Input Validation Tests ──

  it('should reject missing characterId', async () => {
    const request = makeRequest({
      data: { characterId: '', currentCharacter: mockCharacter, chatHistory: [{ role: 'user', content: 'hi' }] },
    });

    await expect(characterChatHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('should reject empty chatHistory', async () => {
    const request = makeRequest({
      data: { characterId: 'char-1', currentCharacter: mockCharacter, chatHistory: [] },
    });

    await expect(characterChatHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('should reject missing currentCharacter', async () => {
    const request = makeRequest({
      data: { characterId: 'char-1', currentCharacter: null, chatHistory: [{ role: 'user', content: 'hi' }] },
    });

    await expect(characterChatHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  // ── API Key Tests ──

  it('should reject if GOOGLE_AI_API_KEY is not configured', async () => {
    delete process.env.GOOGLE_AI_API_KEY;

    const request = makeRequest();
    await expect(characterChatHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'internal' })
    );
  });

  // ── Happy Path Tests ──

  it('should return AI text response with shouldUpdateCharacter on success', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ text: 'You know Fireball and Magic Missile.', shouldUpdateCharacter: false }),
    });

    const request = makeRequest();
    const result = await characterChatHandler(request);

    expect(result).toEqual({ text: 'You know Fireball and Magic Missile.', shouldUpdateCharacter: false });
  });

  it('should return shouldUpdateCharacter true when AI indicates update needed', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ text: 'Ik heb je class veranderd naar Rogue.', shouldUpdateCharacter: true }),
    });

    const request = makeRequest();
    const result = await characterChatHandler(request);

    expect(result).toEqual({ text: 'Ik heb je class veranderd naar Rogue.', shouldUpdateCharacter: true });
  });

  it('should throw internal error when AI returns empty response', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: '',
    });

    const request = makeRequest();
    await expect(characterChatHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'internal' })
    );
  });

  // ── Attachment Tests ──

  it('should accept and forward attachments to Gemini', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ text: 'I see a level 5 Fighter named Thorin.', shouldUpdateCharacter: true }),
    });

    const request = makeRequest({
      data: {
        characterId: 'char-1',
        currentCharacter: mockCharacter,
        chatHistory: [{ role: 'user', content: 'Import this character' }],
        attachments: [{
          type: 'pdf',
          fileName: 'character-sheet.pdf',
          mimeType: 'application/pdf',
          data: 'JVBERi0xLjQ=', // minimal base64
        }],
      },
    });

    const result = await characterChatHandler(request);

    expect(result).toEqual({ text: 'I see a level 5 Fighter named Thorin.', shouldUpdateCharacter: true });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            parts: expect.arrayContaining([
              expect.objectContaining({
                inlineData: { mimeType: 'application/pdf', data: 'JVBERi0xLjQ=' },
              }),
            ]),
          }),
        ]),
      })
    );
  });

  it('should reject attachments exceeding 10 MB', async () => {
    // Create a base64 string that exceeds 10 MB
    const largeData = Buffer.alloc(11 * 1024 * 1024).toString('base64');

    const request = makeRequest({
      data: {
        characterId: 'char-1',
        currentCharacter: mockCharacter,
        chatHistory: [{ role: 'user', content: 'Import this' }],
        attachments: [{
          type: 'pdf',
          fileName: 'huge.pdf',
          mimeType: 'application/pdf',
          data: largeData,
        }],
      },
    });

    await expect(characterChatHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  // ── Rate Limit Handling ──

  it('should throw resource-exhausted on 429 error', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('429 Resource has been exhausted'));

    const request = makeRequest();
    await expect(characterChatHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'resource-exhausted' })
    );
  });
});
