import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

// ── Mocks ────────────────────────────────────────────────────────────────────

const docs: Record<string, Record<string, unknown> | undefined> = {};
const mockDb = {
  doc: vi.fn((path: string) => ({ path, get: async () => ({ exists: docs[path] !== undefined, data: () => docs[path] }) })),
  runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
    get: async (ref: { path: string }) => ({ exists: docs[ref.path] !== undefined, data: () => docs[ref.path] }),
    update: (ref: { path: string }, patch: Record<string, unknown>) => {
      docs[ref.path] = { ...docs[ref.path], ...patch };
    },
  })),
};
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockDb,
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}));
vi.mock('firebase-admin/storage', () => ({ getStorage: () => ({ bucket: () => ({ name: 'test-bucket' }) }) }));

const generateScript = vi.fn();
const uploadMp3 = vi.fn();
vi.mock('./podcast/podcast-pipeline', async () => {
  const actual = await vi.importActual<typeof import('./podcast/podcast-pipeline')>('./podcast/podcast-pipeline');
  return {
    ...actual,
    generatePodcastScript: (...args: unknown[]) => generateScript(...args),
    uploadPodcastMp3: (...args: unknown[]) => uploadMp3(...args),
  };
});
vi.mock('./utils/podcast-tts', () => ({ generatePodcastAudioBuffer: vi.fn(() => Promise.resolve(Buffer.from('mp3'))) }));
vi.mock('./utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({ model: 'gemini-test', maxOutputTokens: 4096 })),
  getPodcastVoiceConfig: vi.fn(() => Promise.resolve({ maxCharacters: 5000, geminiModel: 'tts', host1VoiceName: 'Puck', host2VoiceName: 'Leda' })),
}));
vi.mock('./utils/emulator-helpers', () => ({ ensureAuthForTesting: vi.fn() }));

const progress = vi.hoisted(() => ({ updateProgress: vi.fn(), markFailed: vi.fn(), markCompleted: vi.fn() }));
vi.mock('./services/progress-tracker.service', () => ({ ProgressTrackerService: progress }));

vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: CallableFn) => handler,
  captureFunctionError: vi.fn(),
}));
vi.mock('./utils/logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

let generatePodcastHandler: CallableFn;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: CallableFn) => {
      generatePodcastHandler = handler;
      return handler;
    },
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

const CAMPAIGN = 'campaigns/campaign-1';
const SESSION = 'campaigns/campaign-1/audioSessions/session-1';

describe('generatePodcastAudio', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    for (const key of Object.keys(docs)) delete docs[key];
    process.env.GOOGLE_AI_API_KEY = 'test-api-key';
    docs[CAMPAIGN] = { ownerId: 'dm', members: ['user-123'] };
    docs[SESSION] = {
      ownerId: 'user-123',
      title: 'Session 5: The Battle',
      sessionDate: '2026-10-01',
      content: 'The heroes fought valiantly...',
      podcasts: [{ version: 1, status: 'completed' }],
      latestPodcastVersion: 1,
    };
    generateScript.mockResolvedValue({ segments: [{ speaker: 'host1', text: 'Hoi' }], estimatedDuration: 60 });
    uploadMp3.mockResolvedValue({ audioUrl: 'https://audio', fileSize: 3 });
    await import('./generate-podcast-audio');
  });

  function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
      auth: { uid: 'user-123' },
      data: { campaignId: 'campaign-1', sessionId: 'session-1', sessionTitle: 'Client title' },
      rawRequest: { headers: {} },
      ...overrides,
    };
  }

  const code = (c: string) => expect.objectContaining({ code: c });

  it('rejects unauthenticated callers', async () => {
    await expect(generatePodcastHandler(makeRequest({ auth: null }))).rejects.toThrow(code('unauthenticated'));
    await expect(generatePodcastHandler(makeRequest({ auth: {} }))).rejects.toThrow(code('unauthenticated'));
  });

  it('rejects missing or invalid ids', async () => {
    await expect(generatePodcastHandler(makeRequest({ data: { campaignId: '', sessionId: 'session-1' } })))
      .rejects.toThrow(code('invalid-argument'));
    await expect(generatePodcastHandler(makeRequest({ data: { campaignId: 'campaign-1', sessionId: 'a/b' } })))
      .rejects.toThrow(code('invalid-argument'));
  });

  it('rejects a missing campaign or session', async () => {
    delete docs[SESSION];
    await expect(generatePodcastHandler(makeRequest())).rejects.toThrow(code('not-found'));
    delete docs[CAMPAIGN];
    await expect(generatePodcastHandler(makeRequest())).rejects.toThrow(code('not-found'));
  });

  it('rejects non-members', async () => {
    docs[CAMPAIGN] = { ownerId: 'dm', members: ['someone-else'] };
    await expect(generatePodcastHandler(makeRequest())).rejects.toThrow(code('permission-denied'));
  });

  it('rejects members who do not own the session', async () => {
    docs[SESSION] = { ...docs[SESSION], ownerId: 'other-user' };
    await expect(generatePodcastHandler(makeRequest())).rejects.toThrow(code('permission-denied'));
  });

  it('rejects a session without a story', async () => {
    docs[SESSION] = { ...docs[SESSION], content: '' };
    await expect(generatePodcastHandler(makeRequest())).rejects.toThrow(code('failed-precondition'));
  });

  it('reads the story from the session, allocates the version and ignores client version/story/script', async () => {
    const result = await generatePodcastHandler(makeRequest({
      data: {
        campaignId: 'campaign-1',
        sessionId: 'session-1',
        version: 7,
        story: 'Injected story',
        script: { segments: [{ speaker: 'host1', text: 'Injected' }], estimatedDuration: 1 },
      },
    }));

    expect(result).toEqual({ success: true, message: 'Podcast generation complete', version: 2 });
    expect(generateScript).toHaveBeenCalledWith(
      { kind: 'session', title: 'Session 5: The Battle', date: '2026-10-01', body: 'The heroes fought valiantly...' },
      expect.anything(),
      5000
    );
    expect(uploadMp3).toHaveBeenCalledWith(
      expect.anything(),
      'campaigns/campaign-1/podcasts/session-1/v2.mp3',
      expect.any(Buffer),
      expect.objectContaining({ version: '2', userId: 'user-123' })
    );
    const podcasts = docs[SESSION]?.podcasts as Record<string, unknown>[];
    expect(podcasts.map(p => p.version)).toEqual([1, 2]);
    expect(podcasts[1]).toMatchObject({ status: 'completed', audioUrl: 'https://audio' });
  });

  it('keeps writing the generating-podcast-* stages to the session progress, in Dutch', async () => {
    await generatePodcastHandler(makeRequest());

    expect(progress.updateProgress).toHaveBeenCalledWith(
      'campaign-1', 'session-1', 'generating-podcast-script', 10, 'Podcast script schrijven...'
    );
    expect(progress.updateProgress).toHaveBeenCalledWith(
      'campaign-1', 'session-1', 'generating-podcast-audio', 50, 'Audio genereren...'
    );
    expect(progress.markCompleted).toHaveBeenCalledWith('campaign-1', 'session-1', 'Podcast klaar');
  });
});
