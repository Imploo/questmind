import { AudioSessionRecord } from '../audio/services/audio-session.models';
import { CampaignStoryVersion } from './campaign-story.models';
import { toMillis } from '../shared/utils/date.utils';
import type { Translations } from '../core/i18n/translations';

/** A session counts for the campaign story once its own story is completed (mirrors the backend). */
export function isUsableSession(session: Pick<AudioSessionRecord, 'status' | 'content'>): boolean {
  return session.status === 'completed' && !!session.content?.trim();
}

/**
 * Number of usable sessions that are new, or whose story was regenerated, since the
 * given campaign story version was generated.
 */
export function countChangedSessions(
  version: Pick<CampaignStoryVersion, 'sourceSessions'> | null,
  sessions: Pick<AudioSessionRecord, 'id' | 'status' | 'content' | 'storyRegenerationCount'>[]
): number {
  if (!version) return 0;
  const known = new Map(version.sourceSessions.map(source => [source.sessionId, source.storyVersion]));
  return sessions.filter(session => {
    if (!isUsableSession(session)) return false;
    const usedVersion = known.get(session.id);
    return usedVersion === undefined || (session.storyRegenerationCount ?? 1) > usedVersion;
  }).length;
}

/** Newest completed version (versions are sorted newest first). */
export function latestCompletedVersion(versions: CampaignStoryVersion[]): CampaignStoryVersion | null {
  return versions.find(version => version.status === 'completed') ?? null;
}

/** Matches the backend: a generation still running after this long is considered abandoned. */
export const STALE_GENERATION_MS = 15 * 60 * 1000;

export function isActiveGeneration(createdAt: unknown, now = Date.now()): boolean {
  return now - toMillis(createdAt) < STALE_GENERATION_MS;
}

/**
 * The text for how far a version is: its `progressStep`, or its `status` when
 * the version has no step (written by an older backend) or an unknown one.
 */
export function storyProgressText(
  version: Pick<CampaignStoryVersion, 'status' | 'progressStep'>,
  t: Pick<Translations, 'campaignStory' | 'common'>
): string {
  // Checked at run time too: a newer backend may send a step this client does not know.
  const stepText = version.progressStep ? t.campaignStory.progress[version.progressStep] : undefined;
  if (stepText) return stepText;

  switch (version.status) {
    case 'completed':
      return t.common.done;
    case 'failed':
      return t.common.failed;
    default:
      return t.common.busy;
  }
}
