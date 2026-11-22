import type { CampaignStorySourceJournal, CampaignStorySourceSession, CampaignStoryVersion } from '../campaign-story/campaign-story.models';
import type { PodcastVersion } from '../audio/services/audio-session.models';

/** A finished podcast of a shared campaign (see getCampaignShare in the backend). */
export interface SharedPodcast {
  version: number;
  status: 'completed';
  audioUrl: string;
  duration: number | null;
  fileSize: number | null;
  createdAt: string | null;
}

/** A session of a shared campaign whose story is written. */
export interface SharedSession {
  id: string;
  title: string;
  sessionDate: string | null;
  content: string;
  podcasts: SharedPodcast[];
}

/** The newest finished version of a shared campaign's story. */
export interface SharedCampaignStory {
  version: number;
  title: string;
  content: string;
  completedAt: string | null;
  sourceSessions: CampaignStorySourceSession[];
  sourceJournals: CampaignStorySourceJournal[];
  editedAt: string | null;
  podcasts: SharedPodcast[];
}

/** What a visitor of a shared campaign sees, as getCampaignShare returns it. */
export interface SharedCampaign {
  name: string;
  playerCount: number;
  sessionCount: number;
  lastPlayed: string | null;
  story: SharedCampaignStory | null;
  /** Newest play day first. */
  sessions: SharedSession[];
}

/** A shared podcast in the shape the podcast player takes. */
export function toPodcastVersion(podcast: SharedPodcast): PodcastVersion {
  return {
    version: podcast.version,
    status: podcast.status,
    audioUrl: podcast.audioUrl,
    duration: podcast.duration ?? undefined,
    fileSize: podcast.fileSize ?? undefined,
    // Without a date the player leaves the date out (an invalid Date formats as nothing).
    createdAt: new Date(podcast.createdAt ?? Number.NaN),
  };
}

/** The shared story in the shape the story view takes. */
export function toStoryVersion(story: SharedCampaignStory): CampaignStoryVersion {
  return {
    id: `v${story.version}`,
    version: story.version,
    status: 'completed',
    title: story.title,
    content: story.content,
    sourceSessions: story.sourceSessions,
    sourceJournals: story.sourceJournals,
    skippedSessions: [],
    createdBy: '',
    createdAt: story.completedAt ?? '',
    completedAt: story.completedAt ?? undefined,
    editedAt: story.editedAt ?? undefined,
  };
}
