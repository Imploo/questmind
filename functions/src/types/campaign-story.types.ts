import { AIFeatureConfig, PodcastEntry } from './audio-session.types';

/** Campaign story (ticket #69): a versioned summary of all session stories. */
export type CampaignStoryStatus = 'generating' | 'completed' | 'failed';

export interface CampaignStorySourceSession {
  sessionId: string;
  title: string;
  /** YYYY-MM-DD, null when the session has no date */
  sessionDate: string | null;
  /** storyRegenerationCount ?? 1 at the time of generation — used for staleness checks */
  storyVersion: number;
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
  createdBy: string;
  createdAt: Date;
  completedAt?: Date;
  modelUsed?: string;
  progress?: number;
  progressMessage?: string;
  error?: string | null;
  podcasts: PodcastEntry[];
  latestPodcastVersion?: number;
}

/** Session story as fed into the campaign story prompt, in chronological order. */
export interface CampaignStoryInput {
  title: string;
  sessionDate: string | null;
  /** Fallback label when sessionDate is missing (upload date) */
  uploadedAt: string | null;
  content: string;
}

export interface CampaignStoryFeatureConfig extends AIFeatureConfig {
  /** Target length of the campaign story in words (~500-600 words per A4). */
  targetWords?: number;
}
