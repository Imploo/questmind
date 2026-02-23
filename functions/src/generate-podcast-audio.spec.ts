import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockDoc = vi.fn(() => ({ get: mockGet, update: mockUpdate }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ doc: mockDoc }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ file: vi.fn(() => ({ save: vi.fn() })), name: 'test-bucket' }) }),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    models: { generateContent: vi.fn() },
  })),
}));

vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: vi.fn(() => ({
    textToDialogue: { convert: vi.fn() },
  })),
}));

vi.mock('./utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({
    model: 'gemini-test',
    temperature: 0.9,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 4096,
  })),
  getPodcastVoiceConfig: vi.fn(() => Promise.resolve({
    model: 'eleven_v3',
    maxCharacters: 5000,
    host1VoiceId: 'voice-1',
    host2VoiceId: 'voice-2',
  })),
}));

vi.mock('./prompts/podcast-script-generator.prompt', () => ({
  getPodcastScriptPrompt: vi.fn(() => 'test-prompt'),
}));

vi.mock('./utils/emulator-helpers', () => ({
  ensureAuthForTesting: vi.fn(),
}));

vi.mock('./services/progress-tracker.service', () => ({
  ProgressTrackerService: {
    updateProgress: vi.fn(),
    markFailed: vi.fn(),
    markCompleted: vi.fn(),
  },
}));

vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: Function) => handler,
  captureFunctionError: vi.fn(),
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

let generatePodcastHandler: Function;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: Function) => {
      generatePodcastHandler = handler;
      return handler;
    },
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generatePodcastAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-api-key';
    process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
  });

  beforeEach(async () => {
    await import('./generate-podcast-audio');
  });

  function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
      auth: { uid: 'user-123' },
      data: {
        campaignId: 'campaign-1',
        sessionId: 'session-1',
        version: 1,
        story: 'The heroes fought valiantly...',
        sessionTitle: 'Session 5: The Battle',
      },
      rawRequest: { headers: {} },
      ...overrides,
    };
  }

  // ── Auth Tests ──

  it('should reject unauthenticated callers', async () => {
    const request = makeRequest({ auth: null });

    await expect(generatePodcastHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  it('should reject callers with no uid', async () => {
    const request = makeRequest({ auth: {} });

    await expect(generatePodcastHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  // ── Input Validation Tests ──

  it('should reject missing campaignId', async () => {
    const request = makeRequest({
      data: { campaignId: '', sessionId: 'session-1', version: 1, story: 'text', sessionTitle: 'title' },
    });

    await expect(generatePodcastHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('should reject missing sessionId', async () => {
    const request = makeRequest({
      data: { campaignId: 'campaign-1', sessionId: '', version: 1, story: 'text', sessionTitle: 'title' },
    });

    await expect(generatePodcastHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('should reject missing version', async () => {
    const request = makeRequest({
      data: { campaignId: 'campaign-1', sessionId: 'session-1', story: 'text', sessionTitle: 'title' },
    });

    await expect(generatePodcastHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('should reject missing story when no script provided', async () => {
    const request = makeRequest({
      data: { campaignId: 'campaign-1', sessionId: 'session-1', version: 1, sessionTitle: 'title' },
    });

    await expect(generatePodcastHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('should reject missing sessionTitle when no script provided', async () => {
    const request = makeRequest({
      data: { campaignId: 'campaign-1', sessionId: 'session-1', version: 1, story: 'text' },
    });

    await expect(generatePodcastHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('should reject invalid script with empty segments', async () => {
    const request = makeRequest({
      data: {
        campaignId: 'campaign-1',
        sessionId: 'session-1',
        version: 1,
        script: { segments: [] },
      },
    });

    await expect(generatePodcastHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  // ── Campaign Membership Test ──

  it('should reject if campaign does not exist', async () => {
    mockGet.mockResolvedValueOnce({ exists: false, data: () => null });

    const request = makeRequest();
    await expect(generatePodcastHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'not-found' })
    );
  });

  it('should reject if user is not a campaign member', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ members: { 'other-user': true } }),
    });

    const request = makeRequest();
    await expect(generatePodcastHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'permission-denied' })
    );
  });

  // ── Session Ownership Test ──

  it('should reject if session does not exist', async () => {
    // Campaign exists + user is member
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ members: { 'user-123': true } }),
    });
    // Session not found
    mockGet.mockResolvedValueOnce({ exists: false, data: () => null });

    const request = makeRequest();
    await expect(generatePodcastHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'not-found' })
    );
  });

  it('should reject if caller is not the session owner', async () => {
    // Campaign exists + user is member
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ members: { 'user-123': true } }),
    });
    // Session exists but different owner
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ownerId: 'other-user', podcasts: [] }),
    });

    const request = makeRequest();
    await expect(generatePodcastHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'permission-denied' })
    );
  });
});
