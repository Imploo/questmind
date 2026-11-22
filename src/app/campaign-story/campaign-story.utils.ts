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
  return sessions.filter(session => isUsableSession(session) && !isInStory(version, session)).length;
}

/** Whether the story version holds the session's current story (not an older one). */
export function isInStory(
  version: Pick<CampaignStoryVersion, 'sourceSessions'> | null,
  session: Pick<AudioSessionRecord, 'id' | 'storyRegenerationCount'>
): boolean {
  const usedVersion = version?.sourceSessions.find(source => source.sessionId === session.id)?.storyVersion;
  return usedVersion !== undefined && (session.storyRegenerationCount ?? 1) <= usedVersion;
}

/** The last play day a story version covers (`2026-10-24`), or null when its sessions have no dates. */
export function coveredUntil(version: Pick<CampaignStoryVersion, 'sourceSessions'> | null): string | null {
  const days = (version?.sourceSessions ?? [])
    .map(source => source.sessionDate)
    .filter((day): day is string => !!day)
    .sort();
  return days.at(-1) ?? null;
}

/** What a version was written from: `3 sessions`, with `· 2 journals from Kanka` when it has those. */
export function sourceCountText(
  version: Pick<CampaignStoryVersion, 'sourceSessions' | 'sourceJournals'>,
  t: Pick<Translations, 'campaignStory'>
): string {
  const sessions = version.sourceSessions?.length ?? 0;
  const journals = version.sourceJournals?.length ?? 0;
  return [
    sessions > 0 || journals === 0 ? t.campaignStory.sessionCount(sessions) : '',
    journals > 0 ? t.campaignStory.journalCount(journals) : '',
  ].filter(Boolean).join(' · ');
}

/** Words in a story, counted the way the backend does for a generated version. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
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
