import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { STALE_PROGRESS_MS, toDisplayProgress } from './session-progress.utils';
import { SessionProgress } from './audio-session.models';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');

const session = (updatedAt: unknown, stage: SessionProgress['stage'] = 'transcribing') => ({
  status: 'processing' as const,
  createdAt: '2026-10-27T10:00:00.000Z',
  updatedAt: '2026-10-27T10:00:00.000Z',
  progress: {
    stage,
    progress: 70,
    message: 'Transcribing...',
    startedAt: new Date(NOW - STALE_PROGRESS_MS * 2),
    updatedAt: updatedAt as Date,
  },
});

describe('toDisplayProgress (stale detection)', () => {
  const stale = NOW - STALE_PROGRESS_MS - 60_000;
  const fresh = NOW - 60_000;

  it.each([
    ['Firestore Timestamp', Timestamp.fromMillis(stale)],
    ['ISO string', new Date(stale).toISOString()],
    ['Date', new Date(stale)],
  ])('marks a stale active stage as failed (%s)', (_label, updatedAt) => {
    const result = toDisplayProgress(session(updatedAt), NOW);
    expect(result?.stage).toBe('failed');
    expect(result?.error).toContain('transcribing');
  });

  it.each([
    ['Firestore Timestamp', Timestamp.fromMillis(fresh)],
    ['ISO string', new Date(fresh).toISOString()],
    ['Date', new Date(fresh)],
  ])('keeps a recently updated active stage (%s)', (_label, updatedAt) => {
    expect(toDisplayProgress(session(updatedAt), NOW)?.stage).toBe('transcribing');
  });

  it('never marks completed or failed stages as stale', () => {
    expect(toDisplayProgress(session(new Date(stale), 'completed'), NOW)?.stage).toBe('completed');
  });

  it('derives progress from the legacy status when there is no progress object', () => {
    const base = { createdAt: '2026-10-27T10:00:00.000Z', updatedAt: '2026-10-27T10:00:00.000Z' };
    expect(toDisplayProgress({ ...base, status: 'failed' }, NOW)?.stage).toBe('failed');
    expect(toDisplayProgress({ ...base, status: 'processing' }, NOW)?.stage).toBe('transcribing');
    expect(toDisplayProgress({ ...base, status: 'completed' }, NOW)).toBeNull();
  });
});
