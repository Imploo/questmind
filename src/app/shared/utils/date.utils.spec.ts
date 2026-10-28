import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { toDate, toMillis } from './date.utils';

const ISO = '2026-10-27T12:00:00.000Z';
const MILLIS = Date.parse(ISO);

describe('toDate', () => {
  it('converts a Firestore Timestamp', () => {
    expect(toDate(Timestamp.fromMillis(MILLIS))?.getTime()).toBe(MILLIS);
  });

  it('converts a serialized { seconds, nanoseconds } timestamp', () => {
    expect(toDate({ seconds: MILLIS / 1000, nanoseconds: 500_000_000 })?.getTime()).toBe(MILLIS + 500);
  });

  it('converts an ISO string, a Date and epoch millis', () => {
    expect(toDate(ISO)?.getTime()).toBe(MILLIS);
    expect(toDate(new Date(MILLIS))?.getTime()).toBe(MILLIS);
    expect(toDate(MILLIS)?.getTime()).toBe(MILLIS);
  });

  it('returns null for missing or invalid values', () => {
    expect(toDate(undefined)).toBeNull();
    expect(toDate(null)).toBeNull();
    expect(toDate('')).toBeNull();
    expect(toDate('not a date')).toBeNull();
    expect(toDate(new Date('invalid'))).toBeNull();
    expect(toDate({ foo: 'bar' })).toBeNull();
  });
});

describe('toMillis', () => {
  it('returns epoch millis for supported values', () => {
    expect(toMillis(Timestamp.fromMillis(MILLIS))).toBe(MILLIS);
    expect(toMillis(ISO)).toBe(MILLIS);
  });

  it('returns 0 for missing or invalid values', () => {
    expect(toMillis(undefined)).toBe(0);
    expect(toMillis('garbage')).toBe(0);
  });
});
