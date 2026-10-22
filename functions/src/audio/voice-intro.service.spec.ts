import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDownload = vi.fn();
const mockFile = vi.fn(() => ({ download: mockDownload }));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ file: mockFile }) }),
}));

const mockCaptureException = vi.fn();
vi.mock('../utils/sentry-error-handler', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

vi.mock('../utils/logger', () => ({
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

import { loadVoiceIntroAudio } from './voice-intro.service';

const voiceIntro = {
  storagePath: 'campaigns/campaign-1/voice-intro/intro.mp3',
  mimeType: 'audio/mpeg',
};

describe('loadVoiceIntroAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null without touching Storage when the campaign has no voice intro', async () => {
    expect(await loadVoiceIntroAudio('campaign-1', undefined)).toBeNull();
    expect(mockFile).not.toHaveBeenCalled();
  });

  it('downloads the intro and returns it base64-encoded', async () => {
    mockDownload.mockResolvedValue([Buffer.from('audio-bytes')]);

    const result = await loadVoiceIntroAudio('campaign-1', voiceIntro);

    expect(mockFile).toHaveBeenCalledWith(voiceIntro.storagePath);
    expect(result).toEqual({
      mimeType: 'audio/mpeg',
      data: Buffer.from('audio-bytes').toString('base64'),
    });
  });

  it('returns null and reports to Sentry when the download fails', async () => {
    mockDownload.mockRejectedValue(new Error('No such object'));

    expect(await loadVoiceIntroAudio('campaign-1', voiceIntro)).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ feature: 'voiceIntro', campaignId: 'campaign-1' })
    );
  });

  it('returns null when the file is empty', async () => {
    mockDownload.mockResolvedValue([Buffer.alloc(0)]);

    expect(await loadVoiceIntroAudio('campaign-1', voiceIntro)).toBeNull();
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('returns null when the file is too large to send inline', async () => {
    mockDownload.mockResolvedValue([Buffer.alloc(11 * 1024 * 1024)]);

    expect(await loadVoiceIntroAudio('campaign-1', voiceIntro)).toBeNull();
    expect(mockCaptureException).toHaveBeenCalled();
  });
});
