import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

// ── Mocks ────────────────────────────────────────────────────────────────────

const CAMPAIGN = 'campaigns/c1';
const SESSION = 'campaigns/c1/audioSessions/s1';
const docs: Record<string, Record<string, unknown> | undefined> = {};
const mockUpdate = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({
      get: async () => ({ exists: docs[path] !== undefined, data: () => docs[path] }),
      update: (data: unknown) => mockUpdate(path, data),
    }),
    collection: () => ({
      where: () => ({ where: () => ({ orderBy: () => ({ select: () => ({ get: async () => ({ docs: [] }) }) }) }) }),
    }),
  }),
}));

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@sentry/node', () => sentry);
vi.mock('firebase-functions/logger', () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const progress = vi.hoisted(() => ({ updateProgress: vi.fn(), markFailed: vi.fn(), markCompleted: vi.fn() }));
vi.mock('../services/progress-tracker.service', () => ({ ProgressTrackerService: progress }));

const mockGenerateStory = vi.fn();
vi.mock('../story/story-generator.service', () => ({
  generateStoryFromTranscription: (...args: unknown[]) => mockGenerateStory(...args),
}));
const mockFetchKanka = vi.fn();
vi.mock('../services/kanka.service', () => ({
  fetchKankaContextForSession: (...args: unknown[]) => mockFetchKanka(...args),
}));
vi.mock('../utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({ model: 'gemini-test', maxOutputTokens: 1000 })),
}));

let callable: CallableFn;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: CallableFn) => {
      callable = handler;
      return handler;
    },
  };
});
let taskWorker: CallableFn;
vi.mock('firebase-functions/v2/tasks', () => ({
  onTaskDispatched: (_config: unknown, handler: CallableFn) => {
    taskWorker = handler;
    return handler;
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

const request = (overrides: Record<string, unknown> = {}) => ({
  auth: { uid: 'member-1' },
  data: { campaignId: 'c1', sessionId: 's1', enableKankaContext: true, userCorrections: 'Thalia' },
  rawRequest: { headers: {} },
  ...overrides,
});
const code = (c: string) => expect.objectContaining({ code: c });

describe('storyGenerationWorker (callable)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    for (const key of Object.keys(docs)) delete docs[key];
    delete process.env.FUNCTIONS_EMULATOR;
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    docs[CAMPAIGN] = { ownerId: 'dm', members: ['member-1'] };
    docs[SESSION] = { ownerId: 'dm', rawStory: 'DM: Welkom terug.' };
    mockGenerateStory.mockResolvedValue('Het verhaal');
    await import('./story-generation-worker');
  });

  it('rejects unauthenticated callers', async () => {
    await expect(callable(request({ auth: null }))).rejects.toThrow(code('unauthenticated'));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects non-members', async () => {
    docs[CAMPAIGN] = { ownerId: 'dm', members: [] };
    await expect(callable(request())).rejects.toThrow(code('permission-denied'));
    expect(mockGenerateStory).not.toHaveBeenCalled();
  });

  it('rejects ids with a slash', async () => {
    await expect(callable(request({ data: { campaignId: 'c1', sessionId: 's1/x' } }))).rejects.toThrow(
      code('invalid-argument')
    );
  });

  it('rejects a session without a transcription', async () => {
    docs[SESSION] = { ownerId: 'dm' };
    await expect(callable(request())).rejects.toThrow(code('failed-precondition'));
  });

  it('generates from the stored transcription and ignores client-provided text', async () => {
    const result = await callable(request({
      data: {
        campaignId: 'c1',
        sessionId: 's1',
        transcriptionText: 'Injected text',
        kankaContext: { characters: [{ name: 'Fake' }] },
        enableKankaContext: true,
        userCorrections: 'Thalia',
      },
    }));

    expect(result).toEqual({ success: true, stage: 'storyGenerationWorker' });
    expect(mockFetchKanka).toHaveBeenCalledWith('c1', 's1', true);
    expect(mockGenerateStory).toHaveBeenCalledWith(
      'DM: Welkom terug.', expect.anything(), undefined, 'Thalia', undefined
    );
    expect(mockUpdate).toHaveBeenCalledWith(SESSION, expect.objectContaining({ content: 'Het verhaal', status: 'completed' }));
  });

  it('reports a generation failure to Sentry exactly once', async () => {
    mockGenerateStory.mockRejectedValue(new Error('Gemini down'));

    await expect(callable(request())).rejects.toThrow('Gemini down');

    expect(progress.markFailed).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe('storyGenerationTaskWorker', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.FUNCTIONS_EMULATOR;
    docs[SESSION] = { ownerId: 'dm', rawStory: 'DM: Welkom terug.' };
    await import('./story-generation-worker');
  });

  it('marks the session failed, reports once to Sentry and does not throw', async () => {
    mockGenerateStory.mockRejectedValue(new Error('Gemini down'));

    await expect(taskWorker({ data: { campaignId: 'c1', sessionId: 's1' } })).resolves.toBeUndefined();

    expect(progress.markFailed).toHaveBeenCalledWith('c1', 's1', 'generating-story', expect.any(Error));
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});
