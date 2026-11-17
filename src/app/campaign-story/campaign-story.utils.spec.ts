import { describe, it, expect } from 'vitest';
import {
  countChangedSessions,
  isActiveGeneration,
  latestCompletedVersion,
  storyProgressText,
} from './campaign-story.utils';
import { CampaignStoryProgressStep, CampaignStoryVersion } from './campaign-story.models';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

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

describe('storyProgressText', () => {
  it.each([
    ['collecting', en.campaignStory.progress.collecting],
    ['writing', en.campaignStory.progress.writing],
    ['done', en.campaignStory.progress.done],
    ['failed', en.campaignStory.progress.failed],
  ] as [CampaignStoryProgressStep, string][])('translates the step %s', (progressStep, text) => {
    expect(storyProgressText({ status: 'generating', progressStep }, en)).toBe(text);
  });

  it('follows the language it is given', () => {
    expect(storyProgressText({ status: 'generating', progressStep: 'writing' }, nl)).toBe(
      nl.campaignStory.progress.writing
    );
  });

  it('falls back on the status when a version has no step', () => {
    expect(storyProgressText({ status: 'generating' }, en)).toBe(en.common.busy);
    expect(storyProgressText({ status: 'completed' }, en)).toBe(en.common.done);
    expect(storyProgressText({ status: 'failed' }, nl)).toBe(nl.common.failed);
  });

  it('falls back on the status for a step it does not know', () => {
    const version = { status: 'generating', progressStep: 'polishing' } as unknown as CampaignStoryVersion;
    expect(storyProgressText(version, en)).toBe(en.common.busy);
  });
});

describe('the campaign story plurals', () => {
  it('hold the whole sentence, in both languages', () => {
    expect(nl.campaignStory.changedSessions(1)).toBe('1 nieuwe/gewijzigde sessie sinds de nieuwste versie.');
    expect(nl.campaignStory.changedSessions(3)).toBe('3 nieuwe/gewijzigde sessies sinds de nieuwste versie.');
    expect(en.campaignStory.changedSessions(1)).toBe('1 new/changed session since the latest version.');
    expect(en.campaignStory.changedSessions(3)).toBe('3 new/changed sessions since the latest version.');
    expect(nl.campaignStory.sessionCount(1)).toBe('1 sessie');
    expect(nl.campaignStory.sessionCount(0)).toBe('0 sessies');
    expect(en.campaignStory.sessionCount(1)).toBe('1 session');
    expect(en.campaignStory.sessionCount(2)).toBe('2 sessions');
  });
});
