import { describe, it, expect } from 'vitest';
import { countChangedSessions, isActiveGeneration, latestCompletedVersion } from './campaign-story.utils';
import { CampaignStoryVersion } from './campaign-story.models';

const version = (overrides: Partial<CampaignStoryVersion>): CampaignStoryVersion => ({
  id: `v${overrides.version ?? 1}`,
  version: 1,
  status: 'completed',
  sourceSessions: [],
  skippedSessions: [],
  createdBy: 'owner',
  createdAt: new Date(),
  ...overrides,
});

const session = (id: string, storyRegenerationCount?: number, status: 'completed' | 'processing' = 'completed') => ({
  id,
  status,
  content: 'Verhaal',
  storyRegenerationCount,
});

describe('countChangedSessions', () => {
  const latest = version({
    sourceSessions: [
      { sessionId: 'a', title: 'A', sessionDate: null, storyVersion: 1 },
      { sessionId: 'b', title: 'B', sessionDate: null, storyVersion: 2 },
    ],
  });

  it('is zero when nothing changed', () => {
    expect(countChangedSessions(latest, [session('a'), session('b', 2)])).toBe(0);
  });

  it('counts new sessions and regenerated stories', () => {
    expect(countChangedSessions(latest, [session('a', 2), session('b', 2), session('c')])).toBe(2);
  });

  it('ignores sessions without a completed story and returns zero without a version', () => {
    expect(countChangedSessions(latest, [session('a'), session('b', 2), session('c', 1, 'processing')])).toBe(0);
    expect(countChangedSessions(null, [session('a')])).toBe(0);
  });
});

describe('latestCompletedVersion', () => {
  it('skips generating and failed versions', () => {
    const versions = [version({ version: 3, status: 'generating' }), version({ version: 2, status: 'failed' }), version({ version: 1 })];
    expect(latestCompletedVersion(versions)?.version).toBe(1);
    expect(latestCompletedVersion([])).toBeNull();
  });
});

describe('isActiveGeneration', () => {
  it('treats generations older than 15 minutes as abandoned', () => {
    const now = Date.now();
    expect(isActiveGeneration({ toDate: () => new Date(now - 60_000) }, now)).toBe(true);
    expect(isActiveGeneration(new Date(now - 20 * 60_000), now)).toBe(false);
  });
});
