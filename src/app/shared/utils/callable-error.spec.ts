import { describe, it, expect } from 'vitest';
import { callableErrorCode, isPermissionDenied } from './callable-error';

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
