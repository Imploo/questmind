import { AIFeatureConfig, PodcastEntry } from './audio-session.types';

/**
 * Campaign story (ticket #69): a versioned summary of all session stories and,
 * when Kanka is linked, of the written reports (journals) in Kanka.
 */
export type CampaignStoryStatus = 'generating' | 'completed' | 'failed';

/** Where a campaign story generation is; the frontend shows a text per step, in the user's language. */
export type CampaignStoryProgressStep = 'collecting' | 'writing' | 'done' | 'failed';

export interface CampaignStorySourceSession {
  sessionId: string;
  title: string;
  /** YYYY-MM-DD, null when the session has no date */
  sessionDate: string | null;
  /** storyRegenerationCount ?? 1 at the time of generation — used for staleness checks */
  storyVersion: number;
}

/** A written report from Kanka that went into a story version. */
export interface CampaignStorySourceJournal {
  /** Kanka journal id */
  journalId: number;
  title: string;
  /** YYYY-MM-DD, null when the journal has no date */
  date: string | null;
  /** Kanka `updated_at` at the time of generation */
  updatedAt: string | null;
}

export type CampaignStorySkipReason = 'no_story' | 'failed' | 'processing';

export interface CampaignStorySkippedSession {
  sessionId: string;
  title: string;
  reason: CampaignStorySkipReason;
}

export interface CampaignStoryVersion {
  version: number;
  status: CampaignStoryStatus;
  title?: string;
  content?: string;
  wordCount?: number;
  sourceSessions: CampaignStorySourceSession[];
  skippedSessions: CampaignStorySkippedSession[];
  /** Absent on versions written before journals were a source. */
  sourceJournals?: CampaignStorySourceJournal[];
  createdBy: string;
  createdAt: Date;
  completedAt?: Date;
  modelUsed?: string;
  progress?: number;
  progressStep?: CampaignStoryProgressStep;
  /** Dutch text of the step; no longer shown, kept for clients that have not refreshed. */
  progressMessage?: string;
  error?: string | null;
  podcasts: PodcastEntry[];
  latestPodcastVersion?: number;
}

/**
 * One source of the campaign story as fed into the prompt: the story of a
 * session (written from its recording) or a written report from Kanka.
 */
export interface CampaignStoryInput {
  kind: 'session' | 'journal';
  title: string;
  /** Day the session was played (YYYY-MM-DD); for a journal its Kanka date */
  sessionDate: string | null;
  /** Fallback label when sessionDate is missing: upload date, or the day the journal was created */
  uploadedAt: string | null;
  content: string;
  /** Journal only: the character that wrote it, when Kanka names one */
  author?: string | null;
  /** Journal only: Kanka's free-text type, e.g. "Session" or "Lore" */
  journalType?: string | null;
}

/** A written report from Kanka, as plain text. */
export interface CampaignStoryJournal {
  journalId: number;
  title: string;
  /** YYYY-MM-DD */
  date: string | null;
  /** YYYY-MM-DD */
  createdAt: string | null;
  updatedAt: string | null;
  type: string | null;
  author: string | null;
  content: string;
}

export interface CampaignStoryReferenceEntry {
  name: string;
  type?: string;
  /** First lines of the Kanka entry, as plain text */
  description?: string;
}

/** Who and what exists in the campaign according to Kanka: background, never events. */
export interface CampaignStoryReference {
  characters: CampaignStoryReferenceEntry[];
  locations: CampaignStoryReferenceEntry[];
  quests: CampaignStoryReferenceEntry[];
  organisations: CampaignStoryReferenceEntry[];
}

/** Everything the campaign story prompt is built from. */
export interface CampaignStoryMaterial {
  /** Session stories and dated journals, in chronological order */
  timeline: CampaignStoryInput[];
  /** Journals without a date: the model places them by title and content */
  undatedJournals: CampaignStoryInput[];
  reference?: CampaignStoryReference;
}

export interface CampaignStoryFeatureConfig extends AIFeatureConfig {
  /** Target length of the campaign story in words (~500-600 words per A4). */
  targetWords?: number;
}
