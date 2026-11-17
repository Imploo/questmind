import { describe, it, expect } from 'vitest';
import { en } from '../../core/i18n/en';
import { nl } from '../../core/i18n/nl';
import { CALLABLE_ERROR_REASONS, callableErrorCode, callableErrorMessage, isPermissionDenied } from './callable-error';

describe('callable-error', () => {
  it('strips the functions/ prefix from the error code', () => {
    expect(callableErrorCode({ code: 'functions/permission-denied' })).toBe('permission-denied');
    expect(callableErrorCode({ code: 'not-found' })).toBe('not-found');
  });

  it('returns null without a code', () => {
    expect(callableErrorCode(new Error('boom'))).toBeNull();
    expect(callableErrorCode(null)).toBeNull();
    expect(callableErrorCode(undefined)).toBeNull();
  });

  it('detects permission-denied errors', () => {
    expect(isPermissionDenied({ code: 'functions/permission-denied' })).toBe(true);
    expect(isPermissionDenied({ code: 'functions/internal' })).toBe(false);
  });
});

describe('callableErrorMessage', () => {
  const failure = (code: string, reason?: string) => ({
    code: `functions/${code}`,
    ...(reason ? { details: { reason } } : {}),
  });

  it('lets the reason win from the error code', () => {
    const error = failure('failed-precondition', 'podcast-not-ready');
    expect(callableErrorMessage(error, en.errors)).toBe(en.errors.reasons.podcastNotReady);
    expect(callableErrorMessage(error, nl.errors)).toBe(nl.errors.reasons.podcastNotReady);
  });

  it('falls back on the error code for an unknown reason', () => {
    expect(callableErrorMessage(failure('permission-denied', 'never-heard-of'), en.errors)).toBe(
      en.errors.permissionDenied,
    );
    expect(callableErrorMessage(failure('resource-exhausted'), en.errors)).toBe(en.errors.tooManyRequests);
    expect(callableErrorMessage(failure('deadline-exceeded'), en.errors)).toBe(en.errors.unavailable);
  });

  it('falls back on the given text, or the general message, for an unknown code', () => {
    expect(callableErrorMessage(failure('internal'), en.errors, 'Could not start.')).toBe('Could not start.');
    expect(callableErrorMessage(failure('internal'), en.errors)).toBe(en.errors.generic);
    expect(callableErrorMessage(new Error('raw server text'), en.errors)).toBe(en.errors.generic);
  });

  it('has a text for every reason the backend sends', () => {
    for (const reason of CALLABLE_ERROR_REASONS) {
      const text = callableErrorMessage(failure('failed-precondition', reason), en.errors, 'FALLBACK');
      expect(text, reason).not.toBe('FALLBACK');
    }
  });
});
