import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

const docs: Record<string, Record<string, unknown> | undefined> = {};
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({
      get: async () => ({ exists: docs[path] !== undefined, data: () => docs[path] }),
      update: vi.fn(),
    }),
  }),
  FieldValue: { delete: () => 'DELETE' },
}));

const mockEnqueueTask = vi.fn();
vi.mock('./services/task-queue.service', () => ({
  TASK_WORKERS: { processAudio: 'processSessionAudioWorker' },
  TASK_WORKER_TIMEOUT_SECONDS: 1800,
  enqueueWorkerTask: (...args: unknown[]) => mockEnqueueTask(...args),
}));
vi.mock('./services/progress-tracker.service', () => ({
  ProgressTrackerService: { updateProgress: vi.fn(), markFailed: vi.fn() },
}));
vi.mock('./transcribe-audio-fast', () => ({ enqueueTranscription: vi.fn() }));
vi.mock('./utils/emulator-helpers', () => ({ ensureAuthForTesting: vi.fn() }));
vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: CallableFn) => handler,
  captureFunctionError: vi.fn(),
}));
vi.mock('./utils/logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

const captured = vi.hoisted(() => ({ callable: (async () => undefined) as CallableFn }));
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, handler: CallableFn) => {
      captured.callable = handler;
      return handler;
    },
  };
});
vi.mock('firebase-functions/v2/tasks', () => ({ onTaskDispatched: (_c: unknown, h: CallableFn) => h }));

import { loadSources, sessionSourcePrefix } from './process-session-audio';

const source = (storagePath: string) => ({
  storagePath,
  fileName: 'a.m4a',
  mimeType: 'audio/mp4',
  sizeBytes: 10,
});

describe('loadSources', () => {
  it('accepts sources in the session source folder', () => {
    const sources = [source('campaigns/c1/audio/s1/source/0-a.m4a')];
    expect(loadSources('c1', 's1', sources)).toEqual(sources);
  });

  it('rejects a missing or empty source list', () => {
    expect(() => loadSources('c1', 's1', undefined)).toThrow(
      expect.objectContaining({ code: 'failed-precondition' })
    );
    expect(() => loadSources('c1', 's1', [])).toThrow(
      expect.objectContaining({ code: 'failed-precondition' })
    );
  });

  it('rejects files outside this session', () => {
    expect(() => loadSources('c1', 's1', [source('campaigns/c2/audio/s9/source/0-a.m4a')])).toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
    // The stored recording itself is not a valid source.
    expect(() => loadSources('c1', 's1', [source('campaigns/c1/audio/s1/a.mp3')])).toThrow(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });
});

describe('sessionSourcePrefix', () => {
  it('is the source folder inside the session audio folder', () => {
    expect(sessionSourcePrefix('c1', 's1')).toBe('campaigns/c1/audio/s1/source/');
  });
});

describe('processSessionAudio (callable)', () => {
  const request = (overrides: Record<string, unknown> = {}) => ({
    auth: { uid: 'member-1' },
    data: { campaignId: 'c1', sessionId: 's1' },
    ...overrides,
  });
  const code = (c: string) => expect.objectContaining({ code: c });

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(docs)) delete docs[key];
    docs['campaigns/c1'] = { ownerId: 'dm', members: ['member-1'] };
    docs['campaigns/c1/audioSessions/s1'] = {
      ownerId: 'dm',
      audioSources: [source('campaigns/c1/audio/s1/source/0-a.m4a')],
    };
  });

  it('rejects unauthenticated callers', async () => {
    await expect(captured.callable(request({ auth: null }))).rejects.toThrow(code('unauthenticated'));
  });

  it('rejects non-members without enqueueing work', async () => {
    docs['campaigns/c1'] = { ownerId: 'dm', members: [] };
    await expect(captured.callable(request())).rejects.toThrow(code('permission-denied'));
    expect(mockEnqueueTask).not.toHaveBeenCalled();
  });

  it('rejects ids with a slash and missing sessions', async () => {
    await expect(captured.callable(request({ data: { campaignId: 'c1', sessionId: 's1/x' } }))).rejects.toThrow(
      code('invalid-argument')
    );
    await expect(captured.callable(request({ data: { campaignId: 'c1', sessionId: 's2' } }))).rejects.toThrow(code('not-found'));
  });

  it('lets any member (re)start processing', async () => {
    await expect(captured.callable(request())).resolves.toEqual({ success: true, message: 'Audio processing started' });
    expect(mockEnqueueTask).toHaveBeenCalledWith('processSessionAudioWorker', {
      campaignId: 'c1',
      sessionId: 's1',
      userCorrections: null,
    });
  });
});
