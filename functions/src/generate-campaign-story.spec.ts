import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

// ── Mocks ────────────────────────────────────────────────────────────────────

const campaignGet = vi.fn();
const campaignUpdate = vi.fn();
const versionUpdate = vi.fn();
const versionGet = vi.fn();
const generatingGet = vi.fn();
const sessionsGet = vi.fn();
const txCreate = vi.fn();
const txUpdate = vi.fn();
const txGet = vi.fn();

const mockDb = {
  doc: vi.fn((path: string) => (path.includes('/campaignStories/')
    ? { path, get: () => versionGet(path), update: versionUpdate }
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

const loadKanka = vi.fn();
vi.mock('./campaign-story/campaign-story-kanka', () => ({
  loadCampaignStoryKanka: (...args: unknown[]) => loadKanka(...args),
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
    loadKanka.mockResolvedValue(undefined);
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
    await expect(handler(request())).rejects.toThrow(
      expect.objectContaining({ code: 'failed-precondition', details: { reason: 'story-already-generating' } })
    );
  });

  it('ignores abandoned generations older than the stale window', async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000);
    generatingGet.mockResolvedValue({ docs: [{ data: () => ({ createdAt: { toDate: () => old } }) }] });
    await expect(handler(request())).resolves.toEqual({ success: true, version: 3 });
  });

  it('rejects when no session has a completed story', async () => {
    sessionsGet.mockResolvedValue({ docs: [{ id: 's1', data: () => ({ status: 'processing' }) }] });
    await expect(handler(request())).rejects.toThrow(
      expect.objectContaining({ code: 'failed-precondition', details: { reason: 'no-session-stories' } })
    );
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
        sourceJournals: [],
        podcasts: [],
      })
    );
    expect(generateText).toHaveBeenCalledWith(
      {
        timeline: [{ kind: 'session', title: 'Sessie 1', sessionDate: '2026-01-01', uploadedAt: null, content: 'Het verhaal' }],
        undatedJournals: [],
        reference: undefined,
      },
      expect.anything()
    );
    expect(txUpdate).toHaveBeenCalledWith(expect.anything(), { 'campaignStory.latestVersion': 3 });
    expect(versionUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', title: 'De val', content: 'Tekst' }));
    expect(campaignUpdate).toHaveBeenCalledWith({ 'campaignStory.latestCompletedVersion': 3 });
  });

  describe('with an earlier version of the story', () => {
    const latest = (version: Record<string, unknown>) => {
      campaignGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'owner-1', campaignStory: { latestVersion: 2, latestCompletedVersion: 2 } }),
      });
      versionGet.mockResolvedValue({
        data: () => ({
          version: 2,
          status: 'completed',
          title: 'De val',
          content: 'Kael opende de poort.',
          sourceSessions: [],
          ...version,
        }),
      });
    };
    const material = () => generateText.mock.calls[0][0];

    it('starts fresh when nobody edited that version', async () => {
      latest({});

      await handler(request());

      expect(material().previousVersion).toBeUndefined();
      expect(material().timeline[0]).not.toHaveProperty('sinceLastVersion');
      expect(txCreate.mock.calls[0][1]).not.toHaveProperty('basedOnVersion');
    });

    it('passes a version the owner edited by hand along, and remembers that it did', async () => {
      latest({ editedAt: new Date(), editedBy: 'owner-1' });

      await handler(request());

      expect(versionGet).toHaveBeenCalledWith('campaigns/campaign-1/campaignStories/v2');
      expect(material().previousVersion).toEqual({ title: 'De val', content: 'Kael opende de poort.' });
      expect(txCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ version: 3, basedOnVersion: 2 }));
    });

    it('keeps passing the story along in the versions after it, so the improvements stay', async () => {
      latest({ basedOnVersion: 1 });

      await handler(request());

      expect(material().previousVersion).toEqual({ title: 'De val', content: 'Kael opende de poort.' });
    });

    it('marks what that version does not hold yet', async () => {
      latest({
        editedAt: new Date(),
        sourceSessions: [{ sessionId: 's1', title: 'Sessie 1', sessionDate: '2026-01-01', storyVersion: 1 }],
      });
      sessionsGet.mockResolvedValue({
        docs: [
          completedSession,
          { id: 's2', data: () => ({ title: 'Sessie 2', status: 'completed', content: 'Meer', sessionDate: '2026-02-01' }) },
        ],
      });

      await handler(request());

      expect(material().timeline.map((input: { sinceLastVersion?: string }) => input.sinceLastVersion)).toEqual([undefined, 'new']);
    });

    it('ignores a newest version that has no story (failed or still empty)', async () => {
      latest({ editedAt: new Date(), content: '  ' });

      await handler(request());

      expect(material().previousVersion).toBeUndefined();
    });
  });

  describe('with Kanka linked to the campaign', () => {
    const reference = { characters: [{ name: 'Strahd' }], locations: [], quests: [], organisations: [] };
    const journal = (overrides: Record<string, unknown>) => ({
      journalId: 7,
      title: 'Verslag sessie 1',
      date: '2025-12-01',
      createdAt: '2026-02-01',
      updatedAt: '2026-02-02T10:00:00.000000Z',
      type: 'Session',
      author: 'Mira',
      content: 'Wij kwamen aan.',
      ...overrides,
    });

    it('reads Kanka with the settings of the campaign', async () => {
      const campaign = { ownerId: 'owner-1', settings: { kankaEnabled: true, kankaCampaignId: '123' } };
      campaignGet.mockResolvedValue({ exists: true, data: () => campaign });

      await handler(request());

      expect(loadKanka).toHaveBeenCalledWith('campaign-1', campaign);
    });

    it('writes the story from the session stories and the written reports, with the reference', async () => {
      loadKanka.mockResolvedValue({
        journals: [journal({}), journal({ journalId: 8, title: 'Los verslag', date: null })],
        reference,
      });

      await handler(request());

      expect(txCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sourceJournals: [
            { journalId: 7, title: 'Verslag sessie 1', date: '2025-12-01', updatedAt: '2026-02-02T10:00:00.000000Z' },
            { journalId: 8, title: 'Los verslag', date: null, updatedAt: '2026-02-02T10:00:00.000000Z' },
          ],
        })
      );
      const [material] = generateText.mock.calls[0];
      expect(material.timeline.map((input: { kind: string; title: string }) => `${input.kind}:${input.title}`)).toEqual([
        'journal:Verslag sessie 1',
        'session:Sessie 1',
      ]);
      expect(material.undatedJournals.map((input: { title: string }) => input.title)).toEqual(['Los verslag']);
      expect(material.reference).toBe(reference);
    });

    it('writes a story from written reports alone, when no session has a story yet', async () => {
      sessionsGet.mockResolvedValue({ docs: [] });
      loadKanka.mockResolvedValue({ journals: [journal({})], reference });

      await expect(handler(request())).resolves.toEqual({ success: true, version: 3 });
      expect(txCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ sourceSessions: [], sourceJournals: [expect.objectContaining({ journalId: 7 })] })
      );
    });

    it('rejects when there are no session stories and no written reports', async () => {
      sessionsGet.mockResolvedValue({ docs: [] });
      loadKanka.mockResolvedValue({ journals: [], reference });

      await expect(handler(request())).rejects.toThrow(
        expect.objectContaining({ code: 'failed-precondition', details: { reason: 'no-session-stories' } })
      );
    });

    it('refuses, without starting a version, when Kanka cannot be read', async () => {
      loadKanka.mockRejectedValue(new Error('Kanka API error: 500'));

      await expect(handler(request())).rejects.toThrow(
        expect.objectContaining({ code: 'unavailable', details: { reason: 'kanka-unavailable' } })
      );
      expect(txCreate).not.toHaveBeenCalled();
      expect(generateText).not.toHaveBeenCalled();
      expect(captureFunctionError).toHaveBeenCalledWith(
        'generateCampaignStory',
        expect.objectContaining({ message: 'Kanka API error: 500' }),
        expect.objectContaining({ step: 'kanka' })
      );
    });
  });

  it('writes the step of the generation as a code, next to the Dutch text for older clients', async () => {
    await handler(request());

    expect(txCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ progressStep: 'collecting', progressMessage: 'Sessieverhalen verzamelen...' })
    );
    expect(versionUpdate.mock.calls.map(([update]) => [update.progressStep, update.progressMessage])).toEqual([
      ['writing', 'Verhaal schrijven...'],
      ['done', 'Klaar'],
    ]);
  });

  it('persists a failure on the version document instead of throwing', async () => {
    generateText.mockRejectedValue(new Error('Gemini down'));

    await expect(handler(request())).resolves.toEqual({ success: true, version: 3 });
    expect(versionUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error: 'Gemini down' }));
    expect(versionUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ progressStep: 'failed', progressMessage: 'Mislukt' })
    );
    expect(captureFunctionError).toHaveBeenCalled();
    expect(campaignUpdate).not.toHaveBeenCalled();
  });
});
