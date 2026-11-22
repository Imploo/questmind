import type { Language } from '../utils/language';

export const CAMPAIGN_SHARES_COLLECTION = 'campaignShares';

/**
 * A public share link for a whole campaign. Only the backend reads and writes it:
 * the share page asks `getCampaignShare` for what it shows, so the id is the only
 * key a visitor has, and the campaign documents themselves stay members-only.
 */
export interface CampaignShare {
  campaignId: string;
  createdBy: string;
  createdAt: string;
  /** Language of the link preview: that of whoever shared first. Dutch when missing. */
  language?: Language;
}

/** A finished podcast, as the share page plays it. */
export interface SharedPodcast {
  version: number;
  status: 'completed';
  audioUrl: string;
  duration: number | null;
  fileSize: number | null;
  createdAt: string | null;
}

/** A session whose story is written. */
export interface SharedSession {
  id: string;
  title: string;
  /** The play day (`2026-10-20`), or null when the session has none. */
  sessionDate: string | null;
  content: string;
  podcasts: SharedPodcast[];
}

/** The newest finished version of the campaign story. */
export interface SharedCampaignStory {
  version: number;
  title: string;
  content: string;
  completedAt: string | null;
  /** The sessions it was written from (titles and play days), as the story page lists them. */
  sourceSessions: { sessionId: string; title: string; sessionDate: string | null; storyVersion: number }[];
  /** The written reports from Kanka it was written from. */
  sourceJournals: { journalId: number; title: string; date: string | null; updatedAt: string | null }[];
  /** When the owner improved it by hand. */
  editedAt: string | null;
  podcasts: SharedPodcast[];
}

/**
 * What a visitor of a shared campaign gets to see: the story, the written sessions
 * and their podcasts. No transcripts, recordings, corrections, members or e-mail addresses.
 */
export interface SharedCampaign {
  name: string;
  playerCount: number;
  sessionCount: number;
  /** The newest play day of the sessions, or null. */
  lastPlayed: string | null;
  story: SharedCampaignStory | null;
  /** Newest play day first. */
  sessions: SharedSession[];
}
