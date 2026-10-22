import { AudioSessionRecord } from '../audio/services/audio-session.models';
import { CampaignStoryVersion } from './campaign-story.models';

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

export function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const millis = new Date(value).getTime();
    return Number.isNaN(millis) ? 0 : millis;
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

export function isActiveGeneration(createdAt: unknown, now = Date.now()): boolean {
  return now - toMillis(createdAt) < STALE_GENERATION_MS;
}
