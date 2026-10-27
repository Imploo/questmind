import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } }));
vi.mock('firebase-admin/storage', () => ({ getStorage: () => ({ bucket: () => ({ name: 'test-bucket' }) }) }));

const generateScript = vi.fn();
const uploadMp3 = vi.fn();
vi.mock('./podcast-pipeline', async () => {
  const actual = await vi.importActual<typeof import('./podcast-pipeline')>('./podcast-pipeline');
  return {
    ...actual,
    generatePodcastScript: (...args: unknown[]) => generateScript(...args),
    uploadPodcastMp3: (...args: unknown[]) => uploadMp3(...args),
  };
});
const generateAudio = vi.fn();
vi.mock('../utils/podcast-tts', () => ({ generatePodcastAudioBuffer: (...args: unknown[]) => generateAudio(...args) }));
vi.mock('../utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({ model: 'gemini-test', maxOutputTokens: 1000 })),
  getPodcastVoiceConfig: vi.fn(() => Promise.resolve({ maxCharacters: 5000, geminiModel: 'tts', host1VoiceName: 'Puck', host2VoiceName: 'Leda' })),
}));
const captureFunctionError = vi.fn();
vi.mock('../utils/sentry-error-handler', () => ({ captureFunctionError: (...args: unknown[]) => captureFunctionError(...args) }));
vi.mock('../utils/logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

import { createDocPodcastEntryStore, nextPodcastVersion, runPodcastGeneration } from './run-podcast-generation';

/** One document, updated through transactions like Firestore would. */
function fakeDoc(initial: Record<string, unknown> | undefined) {
  let data = initial;
  const ref = {} as DocumentReference;
  const db = {
    runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      get: async () => ({ exists: data !== undefined, data: () => data }),
      update: (_ref: unknown, patch: Record<string, unknown>) => {
        data = { ...data, ...patch };
      },
    })),
  } as unknown as Firestore;
  return { db, ref, current: () => data as Record<string, unknown> };
}

const sessionStore = (doc: ReturnType<typeof fakeDoc>) => createDocPodcastEntryStore(doc.db, doc.ref, {
  touchUpdatedAt: true,
  storyVersion: (d) => (d.storyRegenerationCount as number) ?? 1,
  readSource: (d) => ({ kind: 'session', title: String(d.title), body: String(d.content) }),
});

const run = (doc: ReturnType<typeof fakeDoc>, listener?: Parameters<typeof runPodcastGeneration>[0]['listener']) =>
  runPodcastGeneration({
    store: sessionStore(doc),
    functionName: 'test',
    storagePath: (v) => `podcasts/v${v}.mp3`,
    uploadMetadata: (v) => ({ version: String(v) }),
    listener,
  });

describe('runPodcastGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateScript.mockResolvedValue({ segments: [{ speaker: 'host1', text: 'Hoi' }], estimatedDuration: 60 });
    generateAudio.mockResolvedValue(Buffer.from('mp3'));
    uploadMp3.mockResolvedValue({ audioUrl: 'https://audio', fileSize: 3 });
  });

  it('allocates the next version server-side and completes the entry', async () => {
    const doc = fakeDoc({ title: 'Sessie 3', content: 'Verhaal', podcasts: [{ version: 1, status: 'completed' }] });

    const { version } = await run(doc);

    expect(version).toBe(2);
    expect(generateScript).toHaveBeenCalledWith(
      { kind: 'session', title: 'Sessie 3', body: 'Verhaal' },
      expect.objectContaining({ model: 'gemini-test' }),
      5000
    );
    expect(uploadMp3).toHaveBeenCalledWith(expect.anything(), 'podcasts/v2.mp3', expect.any(Buffer), { version: '2' });
    const data = doc.current();
    expect(data.latestPodcastVersion).toBe(2);
    expect(data.updatedAt).toBe('SERVER_TIMESTAMP');
    const podcasts = data.podcasts as Record<string, unknown>[];
    expect(podcasts).toHaveLength(2);
    expect(podcasts[0]).toEqual({ version: 1, status: 'completed' });
    expect(podcasts[1]).toMatchObject({
      version: 2,
      status: 'completed',
      audioUrl: 'https://audio',
      progress: 100,
      progressMessage: 'Klaar',
      storyVersion: 1,
      script: { segments: [{ speaker: 'host1', text: 'Hoi' }], estimatedDuration: 60 },
    });
  });

  it('keeps entries written concurrently by others (every patch re-reads the document)', async () => {
    const doc = fakeDoc({ title: 'T', content: 'V', podcasts: [] });
    generateAudio.mockImplementation(async () => {
      // Another writer adds an entry while the audio is being generated
      const current = doc.current();
      (current.podcasts as unknown[]).push({ version: 9, status: 'completed' });
      return Buffer.from('mp3');
    });

    await run(doc);

    const versions = (doc.current().podcasts as { version: number }[]).map(p => p.version);
    expect(versions).toEqual(expect.arrayContaining([1, 9]));
  });

  it('refuses to start while another generation is active', async () => {
    const doc = fakeDoc({ title: 'T', content: 'V', podcasts: [{ version: 1, status: 'pending', createdAt: new Date() }] });

    await expect(run(doc)).rejects.toThrow(expect.objectContaining({ code: 'failed-precondition' }));
    expect(generateScript).not.toHaveBeenCalled();
  });

  it('ignores a stale pending entry', async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const doc = fakeDoc({ title: 'T', content: 'V', podcasts: [{ version: 1, status: 'pending', createdAt: old }] });

    await expect(run(doc)).resolves.toEqual({ version: 2 });
  });

  it('rejects a missing source document', async () => {
    await expect(run(fakeDoc(undefined))).rejects.toThrow(expect.objectContaining({ code: 'not-found' }));
  });

  it('mirrors progress to the listener in Dutch', async () => {
    const listener = { onProgress: vi.fn(), onCompleted: vi.fn(), onFailed: vi.fn() };

    await run(fakeDoc({ title: 'T', content: 'V' }), listener);

    expect(listener.onProgress).toHaveBeenCalledWith(10, 'Podcast script schrijven...');
    expect(listener.onProgress).toHaveBeenCalledWith(50, 'Audio genereren...');
    expect(listener.onProgress).toHaveBeenCalledWith(85, 'Podcast opslaan...');
    expect(listener.onCompleted).toHaveBeenCalledTimes(1);
    expect(listener.onFailed).not.toHaveBeenCalled();
  });

  it('stores a failure on the entry and reports it to Sentry once, without throwing', async () => {
    const listener = { onProgress: vi.fn(), onCompleted: vi.fn(), onFailed: vi.fn() };
    const doc = fakeDoc({ title: 'T', content: 'V' });
    generateAudio.mockRejectedValue(new Error('TTS down'));

    await expect(run(doc, listener)).resolves.toEqual({ version: 1 });

    expect(captureFunctionError).toHaveBeenCalledTimes(1);
    expect(listener.onFailed).toHaveBeenCalledWith(expect.objectContaining({ message: 'TTS down' }));
    const entry = (doc.current().podcasts as Record<string, unknown>[])[0];
    expect(entry).toMatchObject({ status: 'failed', error: 'TTS down', progressMessage: 'Mislukt' });
  });
});

describe('nextPodcastVersion', () => {
  it('is one above the highest version, counter or entry count', () => {
    expect(nextPodcastVersion({}, [])).toBe(1);
    expect(nextPodcastVersion({ latestPodcastVersion: 4 }, [])).toBe(5);
    expect(nextPodcastVersion({}, [{ version: 7, status: 'completed' }])).toBe(8);
    expect(nextPodcastVersion({ latestPodcastVersion: 1 }, [{ version: 1, status: 'completed' }, { version: 2, status: 'failed' }])).toBe(3);
  });
});
