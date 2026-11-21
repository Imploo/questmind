import { PodcastVersion } from '../audio/services/audio-session.models';

/** Campaign story (ticket #69): a versioned summary of all session stories and the written reports in Kanka. */
export type CampaignStoryStatus = 'generating' | 'completed' | 'failed';

/** Where a generation is; the backend sends the step, the text comes from the translations. */
export type CampaignStoryProgressStep = 'collecting' | 'writing' | 'done' | 'failed';

export interface CampaignStorySourceSession {
  sessionId: string;
  title: string;
  sessionDate: string | null;
  storyVersion: number;
}

/** A written report (journal) from Kanka that went into a story version. */
export interface CampaignStorySourceJournal {
  journalId: number;
  title: string;
  date: string | null;
  updatedAt: string | null;
}

export interface CampaignStorySkippedSession {
  sessionId: string;
  title: string;
  reason: 'no_story' | 'failed' | 'processing';
}

/** Firestore timestamps arrive as objects with toDate(); FormattingService handles both. */
export type FirestoreDateValue = Date | string | { toDate: () => Date };

export interface CampaignStoryVersion {
  /** Document id, e.g. "v3" */
  id: string;
  version: number;
  status: CampaignStoryStatus;
  title?: string;
  content?: string;
  wordCount?: number;
  sourceSessions: CampaignStorySourceSession[];
  skippedSessions: CampaignStorySkippedSession[];
  /** Absent on versions written before Kanka journals were a source. */
  sourceJournals?: CampaignStorySourceJournal[];
  createdBy: string;
  createdAt: FirestoreDateValue;
  completedAt?: FirestoreDateValue;
  modelUsed?: string;
  progress?: number;
  /** Absent on versions written before the backend sent steps. */
  progressStep?: CampaignStoryProgressStep;
  /** Still written by the backend for older clients; no longer shown. */
  progressMessage?: string;
  /** Raw exception text; shown only as technical details. */
  error?: string | null;
  podcasts?: PodcastVersion[];
  latestPodcastVersion?: number;
}
