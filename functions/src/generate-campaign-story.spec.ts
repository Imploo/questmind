import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

// ── Mocks ────────────────────────────────────────────────────────────────────

const campaignGet = vi.fn();
const campaignUpdate = vi.fn();
const versionUpdate = vi.fn();
const generatingGet = vi.fn();
const sessionsGet = vi.fn();
const txCreate = vi.fn();
const txUpdate = vi.fn();
const txGet = vi.fn();

const mockDb = {
  doc: vi.fn((path: string) => (path.includes('/campaignStories/')
    ? { path, update: versionUpdate }
    : { path, get: campaignGet, update: campaignUpdate })),
  collection: vi.fn((path: string) => (path.endsWith('/campaignStories')
    ? { where: () => ({ get: generatingGet }) }
    : { get: sessionsGet })),
  runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ get: txGet, create: txCreate, update: txUpdate })),
};

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));

const generateText = vi.fn();
vi.mock('./campaign-story/campaign-story-generator.service', () => ({
  generateCampaignStory: (...args: unknown[]) => generateText(...args),
}));

vi.mock('./utils/ai-settings', () => ({
  getCampaignStoryConfig: vi.fn(() => Promise.resolve({ model: 'gemini-test', maxOutputTokens: 1000, targetWords: 1200 })),
}));
vi.mock('./utils/emulator-helpers', () => ({ ensureAuthForTesting: vi.fn() }));
const captureFunctionError = vi.fn();
vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: CallableFn) => handler,
  captureFunctionError: (...args: unknown[]) => captureFunctionError(...args),
}));
vi.mock('./index', () => ({ SHARED_CORS: [] }));
vi.mock('./utils/logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

let handler: CallableFn;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, fn: CallableFn) => {
      handler = fn;
      return fn;
    },
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const request = (overrides: Record<string, unknown> = {}) => ({
  auth: { uid: 'owner-1' },
  data: { campaignId: 'campaign-1' },
  ...overrides,
});

const completedSession = {
  id: 's1',
  data: () => ({ title: 'Sessie 1', status: 'completed', content: 'Het verhaal', sessionDate: '2026-01-01' }),
};

describe('generateCampaignStory', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await import('./generate-campaign-story');
    campaignGet.mockResolvedValue({ exists: true, data: () => ({ ownerId: 'owner-1' }) });
    generatingGet.mockResolvedValue({ docs: [] });
    sessionsGet.mockResolvedValue({ docs: [completedSession] });
    txGet.mockResolvedValue({ data: () => ({ campaignStory: { latestVersion: 2 } }) });
    generateText.mockResolvedValue({ title: 'De val', content: 'Tekst', wordCount: 1 });
  });

  it('rejects unauthenticated callers', async () => {
    await expect(handler(request({ auth: null }))).rejects.toThrow(expect.objectContaining({ code: 'unauthenticated' }));
  });

  it('rejects a missing campaignId', async () => {
    await expect(handler(request({ data: {} }))).rejects.toThrow(expect.objectContaining({ code: 'invalid-argument' }));
  });

  it('rejects callers that are not the campaign owner', async () => {
    campaignGet.mockResolvedValue({ exists: true, data: () => ({ ownerId: 'someone-else' }) });
    await expect(handler(request())).rejects.toThrow(expect.objectContaining({ code: 'permission-denied' }));
  });

  it('rejects while a recent generation is still running', async () => {
    generatingGet.mockResolvedValue({ docs: [{ data: () => ({ createdAt: { toDate: () => new Date() } }) }] });
    await expect(handler(request())).rejects.toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('ignores abandoned generations older than the stale window', async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000);
    generatingGet.mockResolvedValue({ docs: [{ data: () => ({ createdAt: { toDate: () => old } }) }] });
    await expect(handler(request())).resolves.toEqual({ success: true, version: 3 });
  });

  it('rejects when no session has a completed story', async () => {
    sessionsGet.mockResolvedValue({ docs: [{ id: 's1', data: () => ({ status: 'processing' }) }] });
    await expect(handler(request())).rejects.toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('allocates the next version in a transaction and stores the generated story', async () => {
    const result = await handler(request());

    expect(result).toEqual({ success: true, version: 3 });
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'campaigns/campaign-1/campaignStories/v3' }),
      expect.objectContaining({
        version: 3,
        status: 'generating',
        createdBy: 'owner-1',
        sourceSessions: [{ sessionId: 's1', title: 'Sessie 1', sessionDate: '2026-01-01', storyVersion: 1 }],
        podcasts: [],
      })
    );
    expect(txUpdate).toHaveBeenCalledWith(expect.anything(), { 'campaignStory.latestVersion': 3 });
    expect(versionUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', title: 'De val', content: 'Tekst' }));
    expect(campaignUpdate).toHaveBeenCalledWith({ 'campaignStory.latestCompletedVersion': 3 });
  });

  it('persists a failure on the version document instead of throwing', async () => {
    generateText.mockRejectedValue(new Error('Gemini down'));

    await expect(handler(request())).resolves.toEqual({ success: true, version: 3 });
    expect(versionUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error: 'Gemini down' }));
    expect(captureFunctionError).toHaveBeenCalled();
    expect(campaignUpdate).not.toHaveBeenCalled();
  });
});
