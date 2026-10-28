import { toMillis as toMillisOrNull } from '../utils/timestamp';
import {
  CampaignStoryInput,
  CampaignStorySkippedSession,
  CampaignStorySourceSession,
} from '../types/campaign-story.types';

/** Minimal shape of an audio session document needed for source selection. */
export interface SessionDocForCampaignStory {
  id: string;
  title?: string;
  sessionDate?: string;
  createdAt?: unknown;
  status?: string;
  content?: string;
  storyRegenerationCount?: number;
}

export interface CampaignStorySources {
  sources: CampaignStorySourceSession[];
  skipped: CampaignStorySkippedSession[];
  inputs: CampaignStoryInput[];
}

const UNTITLED = 'Untitled Session';

/**
 * Selects the sessions with a completed story and orders them chronologically:
 * by sessionDate, falling back to createdAt (upload date), createdAt breaks ties.
 */
export function selectCampaignStorySources(sessions: SessionDocForCampaignStory[]): CampaignStorySources {
  const usable: SessionDocForCampaignStory[] = [];
  const skipped: CampaignStorySkippedSession[] = [];

  for (const session of sessions) {
    const title = session.title || UNTITLED;
    const hasStory = typeof session.content === 'string' && session.content.trim().length > 0;

    if (session.status === 'completed' && hasStory) {
      usable.push(session);
    } else if (session.status === 'failed') {
      skipped.push({ sessionId: session.id, title, reason: 'failed' });
    } else if (session.status === 'completed' || !session.status) {
      skipped.push({ sessionId: session.id, title, reason: 'no_story' });
    } else {
      skipped.push({ sessionId: session.id, title, reason: 'processing' });
    }
  }

  usable.sort(compareChronologically);

  return {
    sources: usable.map(session => ({
      sessionId: session.id,
      title: session.title || UNTITLED,
      sessionDate: session.sessionDate || null,
      storyVersion: session.storyRegenerationCount ?? 1,
    })),
    skipped,
    inputs: usable.map(session => ({
      title: session.title || UNTITLED,
      sessionDate: session.sessionDate || null,
      uploadedAt: toIsoDate(session.createdAt),
      content: (session.content ?? '').trim(),
    })),
  };
}

function compareChronologically(a: SessionDocForCampaignStory, b: SessionDocForCampaignStory): number {
  const primary = sortKey(a) - sortKey(b);
  if (primary !== 0) return primary;
  return toMillis(a.createdAt) - toMillis(b.createdAt);
}

function sortKey(session: SessionDocForCampaignStory): number {
  if (session.sessionDate) {
    const millis = Date.parse(session.sessionDate);
    if (!Number.isNaN(millis)) return millis;
  }
  return toMillis(session.createdAt);
}

/** Missing dates sort last. */
function toMillis(value: unknown): number {
  return toMillisOrNull(value) ?? Number.MAX_SAFE_INTEGER;
}

function toIsoDate(value: unknown): string | null {
  const millis = toMillis(value);
  if (millis === Number.MAX_SAFE_INTEGER) return null;
  return new Date(millis).toISOString().slice(0, 10);
}
