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
  buildRawStoryPrompt: vi.fn((_kanka: unknown, options?: { hasVoiceIntro?: boolean }) =>
    options?.hasVoiceIntro ? 'test-prompt-voice-intro' : 'test-prompt'
  ),
  buildSegmentRawStoryPrompt: vi.fn(() => 'test-segment-prompt'),
}));

const mockLoadVoiceIntroAudio = vi.fn();
vi.mock('./audio/voice-intro.service', () => ({
  loadVoiceIntroAudio: (...args: unknown[]) => mockLoadVoiceIntroAudio(...args),
}));

const mockPrepareSegmentsFromStorage = vi.fn();
vi.mock('./audio/stored-audio.service', async () => {
  const actual = await vi.importActual<typeof import('./audio/stored-audio.service')>('./audio/stored-audio.service');
  return {
    ...actual,
    prepareSegmentsFromStorage: (...args: unknown[]) => mockPrepareSegmentsFromStorage(...args),
  };
});

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

let workerHandler: Function;
vi.mock('firebase-functions/v2/tasks', () => ({
  onTaskDispatched: (_config: unknown, handler: Function) => {
    workerHandler = handler;
    return handler;
  },
}));

const mockEnqueue = vi.fn();
const mockTaskQueue = vi.fn((_name: string) => ({ enqueue: mockEnqueue }));
vi.mock('firebase-admin/functions', () => ({
  getFunctions: () => ({ taskQueue: mockTaskQueue }),
}));

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

  /** Call the callable, then run the task it enqueued (as Cloud Tasks would). */
  async function runTranscription(request = makeRequest()) {
    await transcribeHandler(request);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    await workerHandler({ data: mockEnqueue.mock.calls[0][0] });
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

  it('should enqueue the transcription task and return immediately', async () => {
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
    expect(mockTaskQueue).toHaveBeenCalledWith('locations/europe-west1/functions/transcribeAudioFastWorker');
    expect(mockEnqueue).toHaveBeenCalledWith(
      {
        campaignId: 'campaign-1',
        sessionId: 'session-1',
        segments: [{ index: 0, fileUri: 'https://generativelanguage.googleapis.com/files/abc123' }],
        recording: null,
        audioFileName: 'recording.mp3',
        kankaEnabled: false,
        voiceIntro: null,
        voiceIntroRoster: null,
        userCorrections: null,
      },
      { dispatchDeadlineSeconds: 1800 }
    );
    // Work happens in the task, not after the callable has responded.
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('should fail the callable when the task cannot be enqueued', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ settings: { kankaEnabled: false } }) });
    mockUpdate.mockResolvedValue(undefined);
    mockEnqueue.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));

    await expect(transcribeHandler(makeRequest())).rejects.toThrow('PERMISSION_DENIED');
  });

  it('should enqueue story generation as its own task after transcribing', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ settings: { kankaEnabled: false } }) });
    mockUpdate.mockResolvedValue(undefined);
    mockGenerateContent.mockResolvedValue({ text: 'DM [rustig]: Welkom terug, avonturiers. Jullie staan voor de poort.' });

    await runTranscription(makeRequest({
      auth: { uid: 'user-123' },
      data: {
        campaignId: 'campaign-1',
        sessionId: 'session-1',
        fileUri: 'https://generativelanguage.googleapis.com/files/abc123',
        audioFileName: 'recording.mp3',
        userCorrections: 'Thalia, niet Talia',
      },
    }));

    expect(mockTaskQueue).toHaveBeenLastCalledWith('locations/europe-west1/functions/storyGenerationTaskWorker');
    expect(mockEnqueue).toHaveBeenLastCalledWith(
      {
        campaignId: 'campaign-1',
        sessionId: 'session-1',
        enableKankaContext: false,
        userCorrections: 'Thalia, niet Talia',
      },
      { dispatchDeadlineSeconds: 1800 }
    );
  });

  // ── Stored recording ──

  const recording = {
    storagePath: 'campaigns/campaign-1/audio/session-1/recording.mp3',
    fileName: 'recording.mp3',
    mimeType: 'audio/mpeg',
    sizeBytes: 1000,
    durationSec: 3600,
    uploadedAt: '2026-10-27T00:00:00.000Z',
  };

  function makeStorageRequest(storagePath = recording.storagePath) {
    return makeRequest({
      data: { campaignId: 'campaign-1', sessionId: 'session-1', storagePath, audioFileName: 'recording.mp3' },
    });
  }

  function sessionWithRecording(stored: unknown = recording) {
    return { exists: true, data: () => ({ audioRecording: stored }), get: () => stored };
  }

  it('should reject a storagePath outside this session', async () => {
    const foreign = 'campaigns/other/audio/session-9/recording.mp3';
    mockGet.mockResolvedValueOnce(sessionWithRecording({ ...recording, storagePath: foreign }));

    await expect(transcribeHandler(makeStorageRequest(foreign))).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('should reject a storagePath that is not the session recording', async () => {
    mockGet.mockResolvedValueOnce(sessionWithRecording());

    await expect(
      transcribeHandler(makeStorageRequest('campaigns/campaign-1/audio/session-1/other.mp3'))
    ).rejects.toThrow(expect.objectContaining({ code: 'invalid-argument' }));
  });

  it('should transcribe segments prepared from the stored recording', async () => {
    mockGet.mockResolvedValueOnce(sessionWithRecording());
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ settings: { kankaEnabled: false } }) });
    mockUpdate.mockResolvedValue(undefined);
    mockPrepareSegmentsFromStorage.mockResolvedValue([
      { index: 0, fileUri: 'https://generativelanguage.googleapis.com/files/stored1', startSec: 0, endSec: 3600 },
    ]);
    mockGenerateContent.mockResolvedValue({ text: 'DM [rustig]: Welkom terug, avonturiers. Jullie staan voor de poort.' });

    await runTranscription(makeStorageRequest());

    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({ segments: [], recording });
    expect(mockPrepareSegmentsFromStorage).toHaveBeenCalledWith(
      expect.anything(), recording, expect.anything(), expect.any(Function)
    );
    const parts = mockGenerateContent.mock.calls[0][0].contents[0].parts;
    expect(parts.at(-1).fileData).toEqual({
      mimeType: 'audio/mpeg',
      fileUri: 'https://generativelanguage.googleapis.com/files/stored1',
    });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      'transcriptionFast.segmentCount': 1,
    }));
  });

  // ── Voice Intro (ticket #68) ──

  it('should send the campaign voice intro before the prompt in each segment call', async () => {
    const voiceIntro = { storagePath: 'campaigns/campaign-1/voice-intro/intro.mp3', mimeType: 'audio/mpeg' };
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ settings: { kankaEnabled: false, voiceIntro } }) });
    mockUpdate.mockResolvedValue(undefined);
    mockLoadVoiceIntroAudio.mockResolvedValue({ mimeType: 'audio/mpeg', data: 'BASE64' });
    mockGenerateContent.mockResolvedValue({ text: 'DM [rustig]: Welkom terug, avonturiers. Jullie staan voor de poort.' });

    await runTranscription();

    expect(mockLoadVoiceIntroAudio).toHaveBeenCalledWith('campaign-1', voiceIntro);
    const parts = mockGenerateContent.mock.calls[0][0].contents[0].parts;
    expect(parts).toHaveLength(4);
    expect(parts[0].text).toContain('VOICE REFERENCE');
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'audio/mpeg', data: 'BASE64' } });
    expect(parts[2]).toEqual({ text: 'test-prompt-voice-intro' });
    expect(parts[3].fileData.fileUri).toBe('https://generativelanguage.googleapis.com/files/abc123');
    expect(mockUpdate).toHaveBeenCalledWith({ 'transcriptionFast.voiceIntroUsed': true });
  });

  it('should transcribe without reference parts when no voice intro is available', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ settings: { kankaEnabled: false } }) });
    mockUpdate.mockResolvedValue(undefined);
    mockGenerateContent.mockResolvedValue({ text: 'DM [rustig]: Welkom terug, avonturiers. Jullie staan voor de poort.' });

    await runTranscription();

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

    await runTranscription();

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ 'transcriptionFast.status': 'completed' }));
    const partCounts = mockGenerateContent.mock.calls.map((call) => call[0].contents[0].parts.length);
    expect(partCounts).toEqual([4, 2]);
    // The retry without the intro audio must not use the voice-intro prompt.
    expect(mockGenerateContent.mock.calls[1][0].contents[0].parts[0]).toEqual({ text: 'test-prompt' });
    expect(mockUpdate).toHaveBeenCalledWith({ 'transcriptionFast.voiceIntroFallbackSegments': [1] });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ feature: 'voiceIntro' })
    );
  });

  it('should include the campaign speaking order in the voice reference text', async () => {
    const voiceIntro = { storagePath: 'campaigns/campaign-1/voice-intro/intro.mp3', mimeType: 'audio/mpeg' };
    const voiceIntroRoster = '1. DM (Matt)\n2. Thorin (Jan)';
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ settings: { kankaEnabled: false, voiceIntro, voiceIntroRoster } }),
    });
    mockUpdate.mockResolvedValue(undefined);
    mockLoadVoiceIntroAudio.mockResolvedValue({ mimeType: 'audio/mpeg', data: 'BASE64' });
    mockGenerateContent.mockResolvedValue({ text: 'DM [rustig]: Welkom terug, avonturiers. Jullie staan voor de poort.' });

    await runTranscription();

    const parts = mockGenerateContent.mock.calls[0][0].contents[0].parts;
    expect(parts[0].text).toContain('SPEAKING ORDER OF THE INTRODUCTION ROUND');
    expect(parts[0].text).toContain(voiceIntroRoster);
  });
});
