import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((_config: unknown, handler: Function) => {
    const fn = handler;
    (fn as any).__handler = handler;
    return fn;
  }),
}));

vi.mock('../utils/logger', () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('WorkerQueueService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggerWorker should call the handler directly', async () => {
    const { WorkerQueueService } = await import('./worker-queue.service');
    const mockHandler = vi.fn().mockResolvedValue(undefined);

    await WorkerQueueService.triggerWorker(mockHandler, {
      sessionId: 'session-1',
      data: 'test',
    });

    expect(mockHandler).toHaveBeenCalledWith({
      sessionId: 'session-1',
      data: 'test',
    });
  });

  it('triggerWorker should not throw when handler fails', async () => {
    const { WorkerQueueService } = await import('./worker-queue.service');
    const mockHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));

    // Should not throw
    await expect(
      WorkerQueueService.triggerWorker(mockHandler, { sessionId: 'session-1' })
    ).resolves.not.toThrow();
  });

  it('createWorker should return a function with __handler attached', async () => {
    const { WorkerQueueService } = await import('./worker-queue.service');
    const mockHandler = vi.fn();

    const worker = WorkerQueueService.createWorker('testWorker', mockHandler);

    expect(WorkerQueueService.getHandler(worker)).toBeDefined();
  });
});
