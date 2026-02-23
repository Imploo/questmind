import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockCharDocUpdate = vi.fn();
const mockCharDoc = vi.fn(() => ({ update: mockCharDocUpdate }));
const mockCollection = vi.fn(() => ({ doc: mockCharDoc }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: mockCollection }),
}));

vi.mock('firebase-admin/functions', () => ({
  getFunctions: () => ({
    taskQueue: vi.fn(() => ({
      enqueue: vi.fn().mockResolvedValue(undefined),
    })),
  }),
}));

const mockMessagesCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  Anthropic: class {
    messages = { create: mockMessagesCreate };
  },
  RateLimitError: class RateLimitError extends Error {
    constructor() {
      super('rate limit');
      this.name = 'RateLimitError';
    }
  },
}));

vi.mock('./utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({
    model: 'claude-test',
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 512,
  })),
}));

vi.mock('./prompts/character-responder.prompt', () => ({
  CHARACTER_RESPONDER_PROMPT: 'test system prompt',
}));

vi.mock('./schemas/dnd-character.schema', () => ({
  DndCharacterSchema: { parse: vi.fn((x: unknown) => x) },
}));

vi.mock('./generate-character-draft', () => ({
  executeGenerateCharacterDraft: vi.fn(),
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
    process.env.CLAUDE_API_KEY = 'test-api-key';
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

  it('should reject if CLAUDE_API_KEY is not configured', async () => {
    delete process.env.CLAUDE_API_KEY;

    const request = makeRequest();
    await expect(characterChatHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'internal' })
    );
  });

  // ── Happy Path Tests ──

  it('should return AI text response on success', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'You know Fireball and Magic Missile.' }],
    });
    mockCharDocUpdate.mockResolvedValue(undefined);

    const request = makeRequest();
    const result = await characterChatHandler(request);

    expect(result).toEqual({ text: 'You know Fireball and Magic Missile.' });
  });

  it('should throw internal error when AI returns empty response', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'test' }],
    });

    const request = makeRequest();
    await expect(characterChatHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'internal' })
    );
  });

  // ── Rate Limit Handling ──

  it('should throw resource-exhausted on rate limit error', async () => {
    const { RateLimitError } = await import('@anthropic-ai/sdk');
    mockMessagesCreate.mockRejectedValueOnce(new (RateLimitError as unknown as new () => Error)());

    const request = makeRequest();
    await expect(characterChatHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'resource-exhausted' })
    );
  });
});
