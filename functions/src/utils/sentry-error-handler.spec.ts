import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@sentry/node', () => sentry);
vi.mock('./logger', () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), logErrorOnly: vi.fn() }));

import { wrapCallable } from './sentry-error-handler';

const request = { auth: { uid: 'u1' }, data: { campaignId: 'c1' }, rawRequest: { headers: {} } } as never;

describe('wrapCallable', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['invalid-argument', 'unauthenticated', 'permission-denied', 'not-found', 'failed-precondition', 'already-exists'] as const)(
    'only leaves a breadcrumb for expected client error %s',
    async (code) => {
      const handler = wrapCallable('fn', async () => {
        throw new HttpsError(code, 'nope');
      });

      await expect(handler(request)).rejects.toThrow(expect.objectContaining({ code }));
      expect(sentry.captureException).not.toHaveBeenCalled();
      expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    }
  );

  it('captures other HttpsError codes', async () => {
    const handler = wrapCallable('fn', async () => {
      throw new HttpsError('internal', 'boom');
    });

    await expect(handler(request)).rejects.toThrow('boom');
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('captures plain errors exactly once and rethrows them', async () => {
    const error = new Error('unexpected');
    const handler = wrapCallable('fn', async () => {
      throw error;
    });

    await expect(handler(request)).rejects.toBe(error);
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({ tags: { functionName: 'fn' } }));
  });

  it('returns the handler result', async () => {
    const handler = wrapCallable('fn', async () => 'ok');
    await expect(handler(request)).resolves.toBe('ok');
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
