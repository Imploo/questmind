import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockSessionDoc = vi.fn(() => ({ get: mockGet, update: mockUpdate }));
const mockSessionsCollection = vi.fn(() => ({ doc: mockSessionDoc }));
const mockCampaignDoc = vi.fn(() => ({
  get: mockGet,
  collection: mockSessionsCollection,
}));
const mockCollection = vi.fn(() => ({ doc: mockCampaignDoc }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: mockCollection }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    models: { generateContent: vi.fn() },
  })),
}));

vi.mock('./utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({
    model: 'gemini-test',
    temperature: 0.1,
    topP: 1,
    topK: 40,
    maxOutputTokens: 128000,
  })),
}));

vi.mock('./services/progress-tracker.service', () => ({
  ProgressTrackerService: {
    updateProgress: vi.fn(),
    markFailed: vi.fn(),
    markCompleted: vi.fn(),
  },
}));

vi.mock('./services/worker-queue.service', () => ({
  WorkerQueueService: {
    triggerWorker: vi.fn(),
  },
}));

vi.mock('./audio/transcription-prompt', () => ({
  buildRawStoryPrompt: vi.fn(() => 'test-prompt'),
}));

vi.mock('./services/kanka.service', () => ({
  fetchKankaContextForTranscription: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: Function) => handler,
}));

vi.mock('./utils/logger', () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

let transcribeHandler: Function;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: Function) => {
      transcribeHandler = handler;
      return handler;
    },
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('transcribeAudioFast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-api-key';
    process.env.KANKA_API_TOKEN = 'test-kanka-token';
  });

  beforeEach(async () => {
    await import('./transcribe-audio-fast');
  });

  function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
      auth: { uid: 'user-123' },
      data: {
        campaignId: 'campaign-1',
        sessionId: 'session-1',
        fileUri: 'https://generativelanguage.googleapis.com/files/abc123',
        audioFileName: 'recording.mp3',
      },
      rawRequest: { headers: {} },
      ...overrides,
    };
  }

  // ── Auth Tests ──

  it('should reject unauthenticated callers', async () => {
    const request = makeRequest({ auth: null });

    await expect(transcribeHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  it('should reject callers with no uid', async () => {
    const request = makeRequest({ auth: {} });

    await expect(transcribeHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    );
  });

  // ── Input Validation Tests ──

  it('should reject missing campaignId', async () => {
    const request = makeRequest({
      data: { campaignId: '', sessionId: 'session-1', fileUri: 'uri', audioFileName: 'file.mp3' },
    });

    await expect(transcribeHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('should reject missing sessionId', async () => {
    const request = makeRequest({
      data: { campaignId: 'campaign-1', sessionId: '', fileUri: 'uri', audioFileName: 'file.mp3' },
    });

    await expect(transcribeHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('should reject missing fileUri', async () => {
    const request = makeRequest({
      data: { campaignId: 'campaign-1', sessionId: 'session-1', fileUri: '', audioFileName: 'file.mp3' },
    });

    await expect(transcribeHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('should reject missing audioFileName', async () => {
    const request = makeRequest({
      data: { campaignId: 'campaign-1', sessionId: 'session-1', fileUri: 'uri', audioFileName: '' },
    });

    await expect(transcribeHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  // ── API Key Tests ──

  it('should reject if Google AI API key is not configured', async () => {
    delete process.env.GOOGLE_AI_API_KEY;

    const request = makeRequest();
    await expect(transcribeHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'failed-precondition' })
    );
  });

  // ── Session Validation ──

  it('should reject if audio session does not exist', async () => {
    // First call: campaign doc for kanka check, Second call: session doc
    mockGet.mockResolvedValueOnce({ exists: false });

    const request = makeRequest();
    await expect(transcribeHandler(request)).rejects.toThrow(
      expect.objectContaining({ code: 'not-found' })
    );
  });

  // ── Happy Path ──

  it('should return success immediately for fire-and-forget pattern', async () => {
    // Session exists
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    // Campaign kanka check
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ settings: { kankaEnabled: false } }) });
    mockUpdate.mockResolvedValue(undefined);

    const request = makeRequest();
    const result = await transcribeHandler(request);

    expect(result).toEqual({
      success: true,
      message: 'Fast transcription started',
    });
  });
});
