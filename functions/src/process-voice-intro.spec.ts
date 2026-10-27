import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockUpdate = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: mockGet, update: mockUpdate }) }) }),
}));

const mockProcess = vi.fn();
vi.mock('./audio/audio-processing.service', () => ({
  processSourcesToRecording: (...args: unknown[]) => mockProcess(...args),
}));

const mockDelete = vi.fn();
vi.mock('./utils/storage-cleanup', () => ({
  deleteStorageFiles: (...args: unknown[]) => mockDelete(...args),
}));

vi.mock('./utils/sentry-error-handler', () => ({
  wrapCallable: (_name: string, handler: Function) => handler,
}));

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

const SOURCE = 'campaigns/c1/voice-intro/source/123-intro.m4a';

function request(overrides: Record<string, unknown> = {}) {
  return { auth: { uid: 'owner-1' }, data: { campaignId: 'c1', sourcePath: SOURCE }, ...overrides };
}

function campaign(data: Record<string, unknown>) {
  return {
    exists: true,
    get: (field: string) => field.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], data),
  };
}

describe('processVoiceIntro', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await import('./process-voice-intro');
  });

  it('rejects a source outside the campaign voice-intro folder', async () => {
    await expect(handler(request({ data: { campaignId: 'c1', sourcePath: 'campaigns/c2/voice-intro/source/x.m4a' } })))
      .rejects.toThrow(expect.objectContaining({ code: 'invalid-argument' }));
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it('only lets the campaign owner set the intro, and removes the source', async () => {
    mockGet.mockResolvedValue(campaign({ ownerId: 'someone-else' }));

    await expect(handler(request())).rejects.toThrow(expect.objectContaining({ code: 'permission-denied' }));
    expect(mockProcess).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith([SOURCE]);
  });

  it('rejects intros longer than 5 minutes and removes the processed file', async () => {
    mockGet.mockResolvedValue(campaign({ ownerId: 'owner-1' }));
    mockProcess.mockResolvedValue({ sizeBytes: 1000, durationSec: 301 });

    await expect(handler(request())).rejects.toThrow(expect.objectContaining({ code: 'invalid-argument' }));
    expect(mockDelete).toHaveBeenCalledWith(['campaigns/c1/voice-intro/123-intro.mp3']);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('processes the intro, sets it on the campaign and removes the previous one', async () => {
    mockGet.mockResolvedValue(campaign({
      ownerId: 'owner-1',
      settings: { voiceIntro: { storagePath: 'campaigns/c1/voice-intro/old.mp3' } },
    }));
    mockProcess.mockResolvedValue({ sizeBytes: 2_400_000, durationSec: 299.6 });

    const result = await handler(request());

    expect(mockProcess).toHaveBeenCalledWith([SOURCE], 'campaigns/c1/voice-intro/123-intro.mp3');
    expect(result).toMatchObject({
      storagePath: 'campaigns/c1/voice-intro/123-intro.mp3',
      fileName: '123-intro.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 2_400_000,
      durationSec: 300,
      uploadedBy: 'owner-1',
    });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ 'settings.voiceIntro': result }));
    expect(mockDelete).toHaveBeenCalledWith(['campaigns/c1/voice-intro/old.mp3']);
    expect(mockDelete).toHaveBeenCalledWith([SOURCE]);
  });
});
