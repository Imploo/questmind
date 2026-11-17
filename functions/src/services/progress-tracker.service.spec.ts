import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockSessionRef = { get: mockGet, update: mockUpdate };
const mockDoc = vi.fn<(path: string) => typeof mockSessionRef>(() => mockSessionRef);
const mockFirestore = vi.fn(() => ({ doc: mockDoc }));

vi.mock('firebase-admin', () => ({
  firestore: mockFirestore,
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('../utils/logger', () => mockLogger);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ProgressTrackerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      data: () => ({}),
    });
  });

  it('should clamp progress between 0 and 100', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');

    await ProgressTrackerService.updateProgress('c1', 's1', 'transcribing', 150, 'Test');

    expect(mockUpdate).toHaveBeenCalledWith({
      progress: expect.objectContaining({ progress: 100 }),
    });
  });

  it('should clamp negative progress to 0', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');

    await ProgressTrackerService.updateProgress('c1', 's1', 'transcribing', -10, 'Test');

    expect(mockUpdate).toHaveBeenCalledWith({
      progress: expect.objectContaining({ progress: 0 }),
    });
  });

  it('should set correct stage and message', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');

    await ProgressTrackerService.updateProgress('c1', 's1', 'uploading', 50, 'Uploading file...');

    expect(mockUpdate).toHaveBeenCalledWith({
      progress: expect.objectContaining({
        stage: 'uploading',
        progress: 50,
        message: 'Uploading file...',
      }),
    });
  });

  it('should include estimatedCompletionAt when provided', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');
    const estimatedTime = new Date('2026-02-23T12:00:00Z');

    await ProgressTrackerService.updateProgress('c1', 's1', 'transcribing', 70, 'Processing...', estimatedTime);

    expect(mockUpdate).toHaveBeenCalledWith({
      progress: expect.objectContaining({
        estimatedCompletionAt: estimatedTime,
      }),
    });
  });

  it('writes the count of a step that counts things as detail', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');

    await ProgressTrackerService.updateProgress(
      'c1', 's1', 'transcribing', 73, 'Transcribed 3 of 7 segments...', undefined, { current: 3, total: 7 }
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      progress: expect.objectContaining({
        stage: 'transcribing',
        message: 'Transcribed 3 of 7 segments...',
        detail: { current: 3, total: 7 },
      }),
    });
  });

  it('drops the count on the next update: the progress object is replaced as a whole', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');
    // The session as the previous, counted update left it.
    mockGet.mockResolvedValue({
      data: () => ({
        progress: {
          stage: 'transcribing',
          progress: 73,
          message: 'Transcribed 3 of 7 segments...',
          detail: { current: 3, total: 7 },
          startedAt: new Date('2026-02-23T12:00:00Z'),
        },
      }),
    });

    await ProgressTrackerService.updateProgress('c1', 's1', 'transcribing', 80, 'Transcription complete');

    // A single `progress` key (no dotted paths), so Firestore replaces the map and nothing of the old one survives.
    const update = mockUpdate.mock.calls[0][0] as { progress: Record<string, unknown> };
    expect(Object.keys(update)).toEqual(['progress']);
    expect(update.progress).not.toHaveProperty('detail');
    expect(update.progress).toMatchObject({ stage: 'transcribing', progress: 80, message: 'Transcription complete' });
  });

  it('writes no count when a session fails or completes', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');

    await ProgressTrackerService.markFailed('c1', 's1', 'transcribing', 'Something went wrong');
    await ProgressTrackerService.markCompleted('c1', 's1');

    for (const [update] of mockUpdate.mock.calls as [{ progress: Record<string, unknown> }][]) {
      expect(Object.keys(update)).toEqual(['progress']);
      expect(update.progress).not.toHaveProperty('detail');
    }
  });

  it('markFailed should set stage to failed and include error message', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');

    await ProgressTrackerService.markFailed('c1', 's1', 'transcribing', 'Something went wrong');

    expect(mockUpdate).toHaveBeenCalledWith({
      progress: expect.objectContaining({
        stage: 'failed',
        progress: 0,
        message: expect.stringContaining('Failed: Something went wrong'),
      }),
    });
  });

  it('markFailed should extract message from Error objects', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');

    await ProgressTrackerService.markFailed('c1', 's1', 'uploading', new Error('Network error'));

    expect(mockUpdate).toHaveBeenCalledWith({
      progress: expect.objectContaining({
        message: expect.stringContaining('Failed: Network error'),
      }),
    });
  });

  it('markCompleted should set stage to completed with 100%', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');

    await ProgressTrackerService.markCompleted('c1', 's1');

    expect(mockUpdate).toHaveBeenCalledWith({
      progress: expect.objectContaining({
        stage: 'completed',
        progress: 100,
        message: 'Processing complete',
      }),
    });
  });

  it('markFailed only warns, so the caller reports the error to Sentry once', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');

    await ProgressTrackerService.markFailed('c1', 's1', 'transcribing', new Error('boom'));

    expect(mockLogger.warn).toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('writes to the session document of the campaign', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');

    await ProgressTrackerService.updateProgress('c1', 's1', 'transcribing', 50, 'Working...');

    expect(mockDoc).toHaveBeenCalledWith('campaigns/c1/audioSessions/s1');
  });
});
