import { describe, it, expect, vi } from 'vitest';

vi.mock('./transcribe-audio-fast', () => ({ enqueueTranscription: vi.fn() }));
vi.mock('./utils/logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

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
