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
