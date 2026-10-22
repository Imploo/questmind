import { PodcastVersion } from '../audio/services/audio-session.models';

/** Campaign story (ticket #69): a versioned summary of all session stories. */
export type CampaignStoryStatus = 'generating' | 'completed' | 'failed';

export interface CampaignStorySourceSession {
  sessionId: string;
  title: string;
  sessionDate: string | null;
  storyVersion: number;
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
  createdBy: string;
  createdAt: FirestoreDateValue;
  completedAt?: FirestoreDateValue;
  modelUsed?: string;
  progress?: number;
  progressMessage?: string;
  error?: string | null;
  podcasts?: PodcastVersion[];
  latestPodcastVersion?: number;
}
