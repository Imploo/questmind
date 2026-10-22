import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const campaignGet = vi.fn();
const txGet = vi.fn();
const txUpdate = vi.fn();

const mockDb = {
  doc: vi.fn((path: string) => ({ path, get: campaignGet })),
  runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ get: txGet, update: txUpdate })),
};

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
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
  getAiFeatureConfig: vi.fn(() => Promise.resolve({ model: 'gemini-test', maxOutputTokens: 1000 })),
  getPodcastVoiceConfig: vi.fn(() => Promise.resolve({ maxCharacters: 5000, geminiModel: 'tts', host1VoiceName: 'Puck', host2VoiceName: 'Leda' })),
}));
vi.mock('./utils/emulator-helpers', () => ({ ensureAuthForTesting: vi.fn() }));
vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: Function) => handler,
  captureFunctionError: vi.fn(),
}));
vi.mock('./index', () => ({ SHARED_CORS: [] }));
vi.mock('./utils/logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

let handler: Function;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, fn: Function) => {
      handler = fn;
      return fn;
    },
  };
});

const request = (overrides: Record<string, unknown> = {}) => ({
  auth: { uid: 'owner-1' },
  data: { campaignId: 'campaign-1', storyVersion: 2 },
  ...overrides,
});

const storySnap = (data: Record<string, unknown>) => ({ exists: true, data: () => data });

describe('generateCampaignStoryPodcast', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await import('./generate-campaign-story-podcast');
    campaignGet.mockResolvedValue({ exists: true, data: () => ({ ownerId: 'owner-1' }) });
    txGet.mockResolvedValue(storySnap({ status: 'completed', title: 'De val', content: 'Tekst', podcasts: [] }));
    generateScript.mockResolvedValue({ segments: [{ speaker: 'host1', text: 'Hoi' }], estimatedDuration: 60 });
    uploadMp3.mockResolvedValue({ audioUrl: 'https://audio', fileSize: 3 });
  });

  it('rejects a missing storyVersion', async () => {
    await expect(handler(request({ data: { campaignId: 'campaign-1' } }))).rejects.toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('rejects callers that are not the campaign owner', async () => {
    campaignGet.mockResolvedValue({ exists: true, data: () => ({ ownerId: 'someone-else' }) });
    await expect(handler(request())).rejects.toThrow(expect.objectContaining({ code: 'permission-denied' }));
  });

  it('rejects a story version that is not completed', async () => {
    txGet.mockResolvedValue(storySnap({ status: 'generating', podcasts: [] }));
    await expect(handler(request())).rejects.toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('generates with the campaign framing and stores the podcast on the version', async () => {
    const result = await handler(request());

    expect(result).toEqual({ success: true, version: 1 });
    expect(generateScript).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'campaign', title: 'De val', body: 'Tekst' }),
      expect.objectContaining({ model: 'gemini-test' }),
      5000
    );
    expect(uploadMp3).toHaveBeenCalledWith(
      expect.anything(),
      'campaigns/campaign-1/campaign-story-podcasts/v2/p1.mp3',
      expect.any(Buffer),
      expect.objectContaining({ campaignId: 'campaign-1', storyVersion: '2', version: '1' })
    );
    const lastUpdate = txUpdate.mock.calls.at(-1)?.[1] as { podcasts: { status: string; audioUrl?: string }[] };
    expect(lastUpdate.podcasts[0]).toEqual(expect.objectContaining({ status: 'completed', audioUrl: 'https://audio' }));
  });
});
