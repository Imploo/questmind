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

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return { models: { generateContent: mockGenerateContent } };
  }),
}));

vi.mock('./utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({
    model: 'gemini-test',
    maxOutputTokens: 128000,
  })),
  getTranscriptionSegmentationConfig: vi.fn(() => Promise.resolve({
    concurrency: 1,
    maxAttempts: 1,
    onSegmentFailure: 'fail',
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
  buildSegmentRawStoryPrompt: vi.fn(() => 'test-segment-prompt'),
}));

const mockLoadVoiceIntroAudio = vi.fn();
vi.mock('./audio/voice-intro.service', () => ({
  loadVoiceIntroAudio: (...args: unknown[]) => mockLoadVoiceIntroAudio(...args),
}));

vi.mock('./services/kanka.service', () => ({
  fetchKankaContextForTranscription: vi.fn(() => Promise.resolve(undefined)),
}));

const mockCaptureException = vi.fn();
vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: Function) => handler,
  captureException: (...args: unknown[]) => mockCaptureException(...args),
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
    mockLoadVoiceIntroAudio.mockResolvedValue(null);
    // Gemini file-state polling: report the session file as ACTIVE immediately.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ state: 'ACTIVE' }),
    })));
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

  // ── Voice Intro (ticket #68) ──

  it('should send the campaign voice intro before the prompt in each segment call', async () => {
    const voiceIntro = { storagePath: 'campaigns/campaign-1/voice-intro/intro.mp3', mimeType: 'audio/mpeg' };
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ settings: { kankaEnabled: false, voiceIntro } }) });
    mockUpdate.mockResolvedValue(undefined);
    mockLoadVoiceIntroAudio.mockResolvedValue({ mimeType: 'audio/mpeg', data: 'BASE64' });
    mockGenerateContent.mockResolvedValue({ text: 'DM [rustig]: Welkom terug, avonturiers. Jullie staan voor de poort.' });

    await transcribeHandler(makeRequest());

    await vi.waitFor(() => expect(mockGenerateContent).toHaveBeenCalled());
    expect(mockLoadVoiceIntroAudio).toHaveBeenCalledWith('campaign-1', voiceIntro);
    const parts = mockGenerateContent.mock.calls[0][0].contents[0].parts;
    expect(parts).toHaveLength(4);
    expect(parts[0].text).toContain('VOICE REFERENCE');
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'audio/mpeg', data: 'BASE64' } });
    expect(parts[2]).toEqual({ text: 'test-prompt' });
    expect(parts[3].fileData.fileUri).toBe('https://generativelanguage.googleapis.com/files/abc123');
    expect(mockUpdate).toHaveBeenCalledWith({ 'transcriptionFast.voiceIntroUsed': true });
  });

  it('should transcribe without reference parts when no voice intro is available', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ settings: { kankaEnabled: false } }) });
    mockUpdate.mockResolvedValue(undefined);
    mockGenerateContent.mockResolvedValue({ text: 'DM [rustig]: Welkom terug, avonturiers. Jullie staan voor de poort.' });

    await transcribeHandler(makeRequest());

    await vi.waitFor(() => expect(mockGenerateContent).toHaveBeenCalled());
    expect(mockLoadVoiceIntroAudio).toHaveBeenCalledWith('campaign-1', undefined);
    const parts = mockGenerateContent.mock.calls[0][0].contents[0].parts;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ text: 'test-prompt' });
    expect(mockUpdate).toHaveBeenCalledWith({ 'transcriptionFast.voiceIntroUsed': false });
  });

  it('should fall back to transcribing without the voice intro when Gemini rejects it', async () => {
    const voiceIntro = { storagePath: 'campaigns/campaign-1/voice-intro/intro.m4a', mimeType: 'audio/x-m4a' };
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ settings: { kankaEnabled: false, voiceIntro } }) });
    mockUpdate.mockResolvedValue(undefined);
    mockLoadVoiceIntroAudio.mockResolvedValue({ mimeType: 'audio/x-m4a', data: 'BASE64' });
    mockGenerateContent.mockImplementation((request: { contents: { parts: unknown[] }[] }) =>
      request.contents[0].parts.length === 4
        ? Promise.reject(new Error('400 Unsupported MIME type'))
        : Promise.resolve({ text: 'DM [rustig]: Welkom terug, avonturiers. Jullie staan voor de poort.' })
    );

    await transcribeHandler(makeRequest());

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ 'transcriptionFast.status': 'completed' }))
    );
    const partCounts = mockGenerateContent.mock.calls.map((call) => call[0].contents[0].parts.length);
    expect(partCounts).toEqual([4, 2]);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ feature: 'voiceIntro' })
    );
  });
});
