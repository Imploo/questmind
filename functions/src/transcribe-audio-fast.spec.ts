import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

// ── Mocks ────────────────────────────────────────────────────────────────────

const CAMPAIGN = 'campaigns/campaign-1';
const SESSION = 'campaigns/campaign-1/audioSessions/session-1';
const docs: Record<string, Record<string, unknown> | undefined> = {};
const mockUpdate = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({
      get: async () => ({ exists: docs[path] !== undefined, data: () => docs[path] }),
      update: (data: unknown) => mockUpdate(data),
    }),
  }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}));

const mockGenerateContent = vi.fn();
const mockFilesGet = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return { models: { generateContent: mockGenerateContent }, files: { get: mockFilesGet } };
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

const mockFetchKankaContext = vi.fn(() => Promise.resolve(undefined));
vi.mock('./services/kanka.service', () => ({
  fetchKankaContext: (...args: unknown[]) => mockFetchKankaContext(...(args as [])),
  kankaCampaignIdFrom: (campaign: { settings?: { kankaCampaignId?: string } } | undefined) =>
    campaign?.settings?.kankaCampaignId,
}));

vi.mock('./utils/emulator-helpers', () => ({ ensureAuthForTesting: vi.fn() }));

const mockCaptureException = vi.fn();
const mockCaptureFunctionError = vi.fn();
vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: CallableFn) => handler,
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureFunctionError: (...args: unknown[]) => mockCaptureFunctionError(...args),
}));

vi.mock('./utils/logger', () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

let transcribeHandler: CallableFn;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: CallableFn) => {
      transcribeHandler = handler;
      return handler;
    },
  };
});

let workerHandler: CallableFn;
vi.mock('firebase-functions/v2/tasks', () => ({
  onTaskDispatched: (_config: unknown, handler: CallableFn) => {
    workerHandler = handler;
    return handler;
  },
}));

const mockEnqueue = vi.fn();
const mockTaskQueue = vi.fn<(name: string) => { enqueue: typeof mockEnqueue }>(() => ({ enqueue: mockEnqueue }));
vi.mock('firebase-admin/functions', () => ({
  getFunctions: () => ({ taskQueue: mockTaskQueue }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

const recording = {
  storagePath: 'campaigns/campaign-1/audio/session-1/recording.mp3',
  fileName: 'recording.mp3',
  mimeType: 'audio/mpeg',
  sizeBytes: 1000,
  durationSec: 3600,
  uploadedAt: '2026-10-27T00:00:00.000Z',
};

const LOG_TEXT = 'DM [rustig]: Welkom terug, avonturiers. Jullie staan voor de poort.';
const SEGMENT = {
  index: 0,
  fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
  fileName: 'files/abc123',
  startSec: 0,
  endSec: 3600,
};

describe('transcribeAudioFast', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    for (const key of Object.keys(docs)) delete docs[key];
    process.env.GOOGLE_AI_API_KEY = 'test-api-key';
    process.env.KANKA_API_TOKEN = 'test-kanka-token';
    docs[CAMPAIGN] = { ownerId: 'dm', members: ['user-123'], settings: { kankaEnabled: false } };
    docs[SESSION] = { ownerId: 'dm', audioRecording: recording };
    mockUpdate.mockResolvedValue(undefined);
    mockLoadVoiceIntroAudio.mockResolvedValue(null);
    mockFilesGet.mockResolvedValue({ name: 'files/abc123', state: 'ACTIVE' });
    mockPrepareSegmentsFromStorage.mockResolvedValue([SEGMENT]);
    mockGenerateContent.mockResolvedValue({ text: LOG_TEXT });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch must not be used'))));
    await import('./transcribe-audio-fast');
  });

  function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
      auth: { uid: 'user-123' },
      data: {
        campaignId: 'campaign-1',
        sessionId: 'session-1',
        storagePath: recording.storagePath,
        audioFileName: 'recording.mp3',
      },
      rawRequest: { headers: {} },
      ...overrides,
    };
  }

  function withData(data: Record<string, unknown>) {
    return makeRequest({ data: { ...makeRequest().data, ...data } });
  }

  /** Call the callable, then run the task it enqueued (as Cloud Tasks would). */
  async function runTranscription(request = makeRequest()) {
    await transcribeHandler(request);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    await workerHandler({ data: mockEnqueue.mock.calls[0][0] });
  }

  const code = (c: string) => expect.objectContaining({ code: c });

  // ── Auth & access ──

  it('should reject unauthenticated callers', async () => {
    await expect(transcribeHandler(makeRequest({ auth: null }))).rejects.toThrow(code('unauthenticated'));
    await expect(transcribeHandler(makeRequest({ auth: {} }))).rejects.toThrow(code('unauthenticated'));
  });

  it('should reject callers who are not a campaign member', async () => {
    docs[CAMPAIGN] = { ownerId: 'dm', members: ['someone-else'] };

    await expect(transcribeHandler(makeRequest())).rejects.toThrow(code('permission-denied'));
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('should let any member (not only the session owner) retry', async () => {
    await expect(transcribeHandler(makeRequest())).resolves.toEqual({
      success: true,
      message: 'Fast transcription started',
    });
  });

  // ── Input Validation ──

  it('should reject missing or invalid ids', async () => {
    await expect(transcribeHandler(withData({ campaignId: '' }))).rejects.toThrow(code('invalid-argument'));
    await expect(transcribeHandler(withData({ sessionId: '' }))).rejects.toThrow(code('invalid-argument'));
    await expect(transcribeHandler(withData({ sessionId: '../session-2' }))).rejects.toThrow(code('invalid-argument'));
  });

  it('should reject a request without storagePath (legacy fileUri is no longer accepted)', async () => {
    const request = makeRequest({
      data: {
        campaignId: 'campaign-1',
        sessionId: 'session-1',
        fileUri: 'https://attacker.example/x',
        audioFileName: 'file.mp3',
      },
    });

    await expect(transcribeHandler(request)).rejects.toThrow(code('invalid-argument'));
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('should reject if Google AI API key is not configured', async () => {
    delete process.env.GOOGLE_AI_API_KEY;
    await expect(transcribeHandler(makeRequest())).rejects.toThrow(code('failed-precondition'));
  });

  it('should reject if audio session does not exist', async () => {
    delete docs[SESSION];
    await expect(transcribeHandler(makeRequest())).rejects.toThrow(code('not-found'));
  });

  it('should reject a storagePath outside this session', async () => {
    const foreign = 'campaigns/other/audio/session-9/recording.mp3';
    docs[SESSION] = { audioRecording: { ...recording, storagePath: foreign } };

    await expect(transcribeHandler(withData({ storagePath: foreign }))).rejects.toThrow(code('invalid-argument'));
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('should reject a storagePath that is not the session recording', async () => {
    await expect(
      transcribeHandler(withData({ storagePath: 'campaigns/campaign-1/audio/session-1/other.mp3' }))
    ).rejects.toThrow(code('invalid-argument'));
  });

  // ── Happy Path ──

  it('should enqueue the transcription task and return immediately', async () => {
    docs[CAMPAIGN] = { ...docs[CAMPAIGN], settings: { kankaEnabled: true, kankaCampaignId: 'kanka-1' } };

    await transcribeHandler(makeRequest());

    expect(mockTaskQueue).toHaveBeenCalledWith('locations/europe-west1/functions/transcribeAudioFastWorker');
    expect(mockEnqueue).toHaveBeenCalledWith(
      {
        campaignId: 'campaign-1',
        sessionId: 'session-1',
        recording,
        audioFileName: 'recording.mp3',
        kankaEnabled: true,
        kankaCampaignId: 'kanka-1',
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
    mockEnqueue.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    await expect(transcribeHandler(makeRequest())).rejects.toThrow('PERMISSION_DENIED');
  });

  it('should transcribe segments prepared from the stored recording without putting the key in a URL', async () => {
    await runTranscription();

    expect(mockPrepareSegmentsFromStorage).toHaveBeenCalledWith(
      expect.anything(), recording, expect.anything(), expect.any(Function)
    );
    expect(mockFilesGet).toHaveBeenCalledWith({ name: 'files/abc123' });
    expect(fetch).not.toHaveBeenCalled();
    const parts = mockGenerateContent.mock.calls[0][0].contents[0].parts;
    expect(parts.at(-1).fileData).toEqual({ mimeType: 'audio/mpeg', fileUri: SEGMENT.fileUri });
    expect(mockUpdate).toHaveBeenCalledWith({ 'transcriptionFast.segmentCount': 1 });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ 'transcriptionFast.status': 'completed' }));
  });

  it('should use the Kanka campaign id from the task payload instead of re-reading the campaign', async () => {
    docs[CAMPAIGN] = { ...docs[CAMPAIGN], settings: { kankaEnabled: true, kankaCampaignId: 'kanka-1' } };

    await runTranscription();

    expect(mockFetchKankaContext).toHaveBeenCalledWith('campaign-1', 'kanka-1');
  });

  it('should enqueue story generation as its own task after transcribing', async () => {
    await runTranscription(withData({ userCorrections: 'Thalia, niet Talia' }));

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

  it('should mark the session failed and report the error to Sentry once', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'kort' });

    await runTranscription();

    expect(mockCaptureFunctionError).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ 'transcriptionFast.status': 'failed' }));
  });

  // ── Voice Intro (ticket #68) ──

  it('should send the campaign voice intro before the prompt in each segment call', async () => {
    const voiceIntro = { storagePath: 'campaigns/campaign-1/voice-intro/intro.mp3', mimeType: 'audio/mpeg' };
    docs[CAMPAIGN] = { ...docs[CAMPAIGN], settings: { kankaEnabled: false, voiceIntro } };
    mockLoadVoiceIntroAudio.mockResolvedValue({ mimeType: 'audio/mpeg', data: 'BASE64' });

    await runTranscription();

    expect(mockLoadVoiceIntroAudio).toHaveBeenCalledWith('campaign-1', voiceIntro);
    const parts = mockGenerateContent.mock.calls[0][0].contents[0].parts;
    expect(parts).toHaveLength(4);
    expect(parts[0].text).toContain('VOICE REFERENCE');
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'audio/mpeg', data: 'BASE64' } });
    expect(parts[2]).toEqual({ text: 'test-prompt-voice-intro' });
    expect(parts[3].fileData.fileUri).toBe(SEGMENT.fileUri);
    expect(mockUpdate).toHaveBeenCalledWith({ 'transcriptionFast.voiceIntroUsed': true });
  });

  it('should transcribe without reference parts when no voice intro is available', async () => {
    await runTranscription();

    expect(mockLoadVoiceIntroAudio).toHaveBeenCalledWith('campaign-1', undefined);
    const parts = mockGenerateContent.mock.calls[0][0].contents[0].parts;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ text: 'test-prompt' });
    expect(mockUpdate).toHaveBeenCalledWith({ 'transcriptionFast.voiceIntroUsed': false });
  });

  it('should fall back to transcribing without the voice intro when Gemini rejects it', async () => {
    const voiceIntro = { storagePath: 'campaigns/campaign-1/voice-intro/intro.m4a', mimeType: 'audio/x-m4a' };
    docs[CAMPAIGN] = { ...docs[CAMPAIGN], settings: { kankaEnabled: false, voiceIntro } };
    mockLoadVoiceIntroAudio.mockResolvedValue({ mimeType: 'audio/x-m4a', data: 'BASE64' });
    mockGenerateContent.mockImplementation((request: { contents: { parts: unknown[] }[] }) =>
      request.contents[0].parts.length === 4
        ? Promise.reject(new Error('400 Unsupported MIME type'))
        : Promise.resolve({ text: LOG_TEXT })
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
    docs[CAMPAIGN] = { ...docs[CAMPAIGN], settings: { kankaEnabled: false, voiceIntro, voiceIntroRoster } };
    mockLoadVoiceIntroAudio.mockResolvedValue({ mimeType: 'audio/mpeg', data: 'BASE64' });

    await runTranscription();

    const parts = mockGenerateContent.mock.calls[0][0].contents[0].parts;
    expect(parts[0].text).toContain('SPEAKING ORDER OF THE INTRODUCTION ROUND');
    expect(parts[0].text).toContain(voiceIntroRoster);
  });
});
