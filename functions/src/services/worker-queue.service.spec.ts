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

  it('triggerWorker should call the handler via setImmediate', async () => {
    const { WorkerQueueService } = await import('./worker-queue.service');
    const mockHandler = vi.fn().mockResolvedValue(undefined);

    // Mock setImmediate to execute immediately
    vi.spyOn(globalThis, 'setImmediate').mockImplementation((fn: Function) => {
      fn();
      return {} as NodeJS.Immediate;
    });

    await WorkerQueueService.triggerWorker(mockHandler, {
      sessionId: 'session-1',
      data: 'test',
    });

    // The handler should be scheduled via setImmediate
    expect(setImmediate).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('triggerWorker should not throw when handler fails', async () => {
    const { WorkerQueueService } = await import('./worker-queue.service');
    const mockHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));

    vi.spyOn(globalThis, 'setImmediate').mockImplementation((fn: Function) => {
      fn();
      return {} as NodeJS.Immediate;
    });

    // Should not throw
    await expect(
      WorkerQueueService.triggerWorker(mockHandler, { sessionId: 'session-1' })
    ).resolves.not.toThrow();

    vi.restoreAllMocks();
  });

  it('createWorker should return a function with __handler attached', async () => {
    const { WorkerQueueService } = await import('./worker-queue.service');
    const mockHandler = vi.fn();

    const worker = WorkerQueueService.createWorker('testWorker', mockHandler);

    expect(WorkerQueueService.getHandler(worker)).toBeDefined();
  });
});
