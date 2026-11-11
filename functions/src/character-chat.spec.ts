import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;
import { HttpsError } from 'firebase-functions/v2/https';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Non-stream responses from `mockGenerateContent` are replayed as a one-chunk stream;
// `mockStreamChunks` queues multi-chunk streams instead.
const mockGenerateContent = vi.fn();
const mockStreamChunks: Record<string, unknown>[][] = [];
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
      generateContentStream: async (...args: unknown[]) => {
        const chunks = mockStreamChunks.shift() ?? [await mockGenerateContent(...args)];
        return (async function* () {
          yield* chunks;
        })();
      },
    };
  },
  Part: {},
}));

vi.mock('./utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({
    model: 'gemini-test',
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
  wrapCallable: (_name: string, handler: CallableFn) => handler,
}));

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));

const mockAssertCharacterOwner = vi.fn();
vi.mock('./utils/access', async () => {
  const actual = await vi.importActual<typeof import('./utils/access')>('./utils/access');
  return { ...actual, assertCharacterOwner: (...args: unknown[]) => mockAssertCharacterOwner(...args) };
});

vi.mock('./utils/logger', () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

let characterChatHandler: CallableFn;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: CallableFn) => {
      characterChatHandler = handler;
      return handler;
    },
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('characterChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContent.mockReset();
    mockStreamChunks.length = 0;
    process.env.GOOGLE_AI_API_KEY = 'test-google-key';
    mockAssertCharacterOwner.mockResolvedValue({ userId: 'user-123' });
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
      expect.objectContaining({ code: 'failed-precondition' })
    );
  });

  // ── Ownership ──

  it('should reject callers who do not own the character, before calling Gemini', async () => {
    mockAssertCharacterOwner.mockRejectedValueOnce(new HttpsError('permission-denied', 'Not authorized'));

    await expect(characterChatHandler(makeRequest())).rejects.toThrow(
      expect.objectContaining({ code: 'permission-denied' })
    );
    expect(mockAssertCharacterOwner).toHaveBeenCalledWith(expect.anything(), 'char-1', 'user-123');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('should throw internal when the AI returns invalid JSON twice', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"text": "cut off' });

    await expect(characterChatHandler(makeRequest())).rejects.toThrow(
      expect.objectContaining({ code: 'internal' })
    );
  });

  it('should recover when a truncated response succeeds on retry', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: '{"text": "cut off', candidates: [{ finishReason: 'MAX_TOKENS' }] })
      .mockResolvedValueOnce({ text: JSON.stringify({ text: 'Charisma is nu 15.', shouldUpdateCharacter: true }) });

    const result = await characterChatHandler(makeRequest());

    expect(result).toEqual({ text: 'Charisma is nu 15.', shouldUpdateCharacter: true });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
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

  // ── Streaming ──

  function streamingRequest() {
    const chunks: unknown[] = [];
    const response = { sendChunk: vi.fn(async (chunk: unknown) => { chunks.push(chunk); return true; }) };
    return { request: makeRequest({ acceptsStreaming: true }), response, chunks };
  }

  it('streams the reply text as deltas while the JSON is generated', async () => {
    mockStreamChunks.push([
      { text: '{"text": "Je Cha' },
      { text: 'risma is nu 15.\\nKlaar' },
      { text: '", "shouldUpdateCharacter": true}', candidates: [{ finishReason: 'STOP' }] },
    ]);
    const { request, response, chunks } = streamingRequest();

    const result = await characterChatHandler(request, response);

    expect(result).toEqual({ text: 'Je Charisma is nu 15.\nKlaar', shouldUpdateCharacter: true });
    expect(chunks).toEqual([
      { type: 'text', text: 'Je Cha' },
      { type: 'text', text: 'risma is nu 15.\nKlaar' },
    ]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('sends a reset before the retry streams its reply again', async () => {
    mockStreamChunks.push(
      [{ text: '{"text": "Half antw', candidates: [{ finishReason: 'MAX_TOKENS' }] }],
      [{ text: '{"text": "Heel antwoord", "shouldUpdateCharacter": false}' }],
    );
    const { request, response, chunks } = streamingRequest();

    const result = await characterChatHandler(request, response);

    expect(result).toEqual({ text: 'Heel antwoord', shouldUpdateCharacter: false });
    expect(chunks).toEqual([
      { type: 'text', text: 'Half antw' },
      { type: 'reset' },
      { type: 'text', text: 'Heel antwoord' },
    ]);
  });

  it('does not send chunks to clients that do not accept streaming', async () => {
    mockStreamChunks.push([{ text: '{"text": "Hoi", "shouldUpdateCharacter": false}' }]);
    const response = { sendChunk: vi.fn() };

    const result = await characterChatHandler(makeRequest({ acceptsStreaming: false }), response);

    expect(result).toEqual({ text: 'Hoi', shouldUpdateCharacter: false });
    expect(response.sendChunk).not.toHaveBeenCalled();
  });
});
