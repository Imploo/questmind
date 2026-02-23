import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockSessionRef = { get: mockGet, update: mockUpdate };
const mockDoc = vi.fn(() => ({
  collection: vi.fn(() => ({
    doc: vi.fn(() => mockSessionRef),
  })),
}));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));
const mockFirestore = vi.fn(() => ({ collection: mockCollection }));
(mockFirestore as any).FieldValue = { delete: () => 'FIELD_DELETE' };

vi.mock('firebase-admin', () => ({
  firestore: mockFirestore,
}));

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: () => 'TIMESTAMP_NOW' },
}));

vi.mock('../utils/logger', () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

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

  it('clearProgress should delete the progress field', async () => {
    const { ProgressTrackerService } = await import('./progress-tracker.service');

    await ProgressTrackerService.clearProgress('c1', 's1');

    expect(mockUpdate).toHaveBeenCalledWith({
      progress: 'FIELD_DELETE',
    });
  });

  it('getProgress should return null for non-existent session', async () => {
    mockGet.mockResolvedValueOnce({ exists: false, data: () => null });

    const { ProgressTrackerService } = await import('./progress-tracker.service');
    const result = await ProgressTrackerService.getProgress('c1', 's1');

    expect(result).toBeNull();
  });

  it('getProgress should return progress data for existing session', async () => {
    const progressData = { stage: 'transcribing', progress: 50, message: 'Working...' };
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ progress: progressData }),
    });

    const { ProgressTrackerService } = await import('./progress-tracker.service');
    const result = await ProgressTrackerService.getProgress('c1', 's1');

    expect(result).toEqual(progressData);
  });
});
