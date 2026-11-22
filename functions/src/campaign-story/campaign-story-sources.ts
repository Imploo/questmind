import { toMillis as toMillisOrNull } from '../utils/timestamp';
import {
  CampaignStoryInput,
  CampaignStoryJournal,
  CampaignStorySkippedSession,
  CampaignStorySourceJournal,
  CampaignStorySourceSession,
  CampaignStoryVersionSources,
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
  /** The written reports that go into the story, dated ones first */
  journalSources: CampaignStorySourceJournal[];
  /** Session stories and dated journals, in chronological order */
  timeline: CampaignStoryInput[];
  /** Journals without a date, by title: the prompt asks the model to place them */
  undatedJournals: CampaignStoryInput[];
}

/** A session story or dated journal with its place in time. */
interface TimelineEntry {
  input: CampaignStoryInput;
  sortKey: number;
  /** Order within one day: a written report before the story of the recording, then upload time */
  tieBreak: number;
}

const UNTITLED = 'Untitled Session';

/**
 * Selects the sessions with a completed story and puts them, together with the
 * written reports from Kanka, in chronological order: by sessionDate, falling
 * back to createdAt (upload date), createdAt breaks ties. A journal takes its
 * place by its Kanka date; journals without one are returned separately.
 *
 * With `previous` (the sources of the version that goes along with the new one),
 * every source that version does not hold yet, or holds an older text of, is
 * marked as new or changed.
 */
export function selectCampaignStorySources(
  sessions: SessionDocForCampaignStory[],
  journals: CampaignStoryJournal[] = [],
  previous?: CampaignStoryVersionSources
): CampaignStorySources {
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

  const byTitle = (a: CampaignStoryJournal, b: CampaignStoryJournal) =>
    a.title.localeCompare(b.title, 'nl', { numeric: true });
  const dated = journals.filter(journal => journal.date).sort(byTitle);
  const undated = journals.filter(journal => !journal.date).sort(byTitle);

  const entries: TimelineEntry[] = [
    ...usable.map((session): TimelineEntry => ({
      input: {
        kind: 'session',
        title: session.title || UNTITLED,
        sessionDate: session.sessionDate || null,
        uploadedAt: toIsoDate(session.createdAt),
        content: (session.content ?? '').trim(),
        ...sinceLastVersion(sessionChange(session, previous)),
      },
      sortKey: sortKey(session),
      tieBreak: toMillis(session.createdAt),
    })),
    ...dated.map((journal, index): TimelineEntry => ({
      input: toJournalInput(journal, previous),
      sortKey: Date.parse(journal.date as string),
      // Negative: before every session of that day, in title order among themselves.
      tieBreak: index - dated.length,
    })),
  ];
  entries.sort((a, b) => a.sortKey - b.sortKey || a.tieBreak - b.tieBreak);

  return {
    sources: usable.map(session => ({
      sessionId: session.id,
      title: session.title || UNTITLED,
      sessionDate: session.sessionDate || null,
      storyVersion: session.storyRegenerationCount ?? 1,
    })),
    skipped,
    journalSources: [...[...dated].sort(byDate), ...undated].map(journal => ({
      journalId: journal.journalId,
      title: journal.title,
      date: journal.date,
      updatedAt: journal.updatedAt,
    })),
    timeline: entries.map(entry => entry.input),
    undatedJournals: undated.map(journal => toJournalInput(journal, previous)),
  };
}

type SourceChange = CampaignStoryInput['sinceLastVersion'];

/** Leaves the key out for an unchanged source, so inputs without a previous version stay as they were. */
function sinceLastVersion(change: SourceChange): Pick<CampaignStoryInput, 'sinceLastVersion'> {
  return change ? { sinceLastVersion: change } : {};
}

function sessionChange(session: SessionDocForCampaignStory, previous?: CampaignStoryVersionSources): SourceChange {
  if (!previous) return undefined;
  const used = previous.sourceSessions.find(source => source.sessionId === session.id);
  if (!used) return 'new';
  return (session.storyRegenerationCount ?? 1) > used.storyVersion ? 'changed' : undefined;
}

function journalChange(journal: CampaignStoryJournal, previous?: CampaignStoryVersionSources): SourceChange {
  if (!previous) return undefined;
  const used = previous.sourceJournals?.find(source => source.journalId === journal.journalId);
  if (!used) return 'new';
  return used.updatedAt !== journal.updatedAt ? 'changed' : undefined;
}

function toJournalInput(journal: CampaignStoryJournal, previous?: CampaignStoryVersionSources): CampaignStoryInput {
  return {
    kind: 'journal',
    title: journal.title,
    sessionDate: journal.date,
    uploadedAt: journal.createdAt,
    content: journal.content,
    author: journal.author,
    journalType: journal.type,
    ...sinceLastVersion(journalChange(journal, previous)),
  };
}

/** Stable, so journals of one day keep their title order. */
function byDate(a: CampaignStoryJournal, b: CampaignStoryJournal): number {
  return (a.date ?? '').localeCompare(b.date ?? '');
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
