import { DocumentData, Firestore } from 'firebase-admin/firestore';
import { campaignStoriesCollectionPath, campaignStoryDocPath } from '../campaign-story/campaign-story-paths';
import { toDate } from '../utils/timestamp';
import {
  CAMPAIGN_SHARES_COLLECTION,
  CampaignShare,
  SharedCampaign,
  SharedCampaignStory,
  SharedPodcast,
  SharedSession,
} from './campaign-share.types';

/** Share ids are random 128-bit tokens in base64url (22 characters). */
export const CAMPAIGN_SHARE_ID_PATTERN = /^[\w-]{16,64}$/;

/** The only session fields a visitor may see; the rest (transcripts, audio) is never read. */
const SESSION_FIELDS = ['title', 'sessionDate', 'content', 'status', 'podcasts'] as const;

/** The share behind an id, or null when the id is malformed or unknown. */
export async function loadCampaignShare(db: Firestore, shareId: string): Promise<CampaignShare | null> {
  if (!CAMPAIGN_SHARE_ID_PATTERN.test(shareId)) return null;
  const snap = await db.collection(CAMPAIGN_SHARES_COLLECTION).doc(shareId).get();
  return snap.exists ? (snap.data() as CampaignShare) : null;
}

/**
 * The read-only view of a campaign, as it is now; null when the campaign is gone.
 * Only sessions with a written story are in it, the same ones the campaign story uses.
 */
export async function loadSharedCampaign(db: Firestore, campaignId: string): Promise<SharedCampaign | null> {
  const campaignSnap = await db.doc(`campaigns/${campaignId}`).get();
  if (!campaignSnap.exists) return null;
  const campaign = campaignSnap.data() ?? {};

  const [sessionsSnap, story] = await Promise.all([
    db.collection(`campaigns/${campaignId}/audioSessions`).select(...SESSION_FIELDS).get(),
    loadLatestStory(db, campaignId, campaign),
  ]);

  const sessions = sessionsSnap.docs
    .map(doc => toSharedSession(doc.id, doc.data()))
    .filter((session): session is SharedSession => session !== null)
    // Newest play day first; sessions without one go last.
    .sort((a, b) => (b.sessionDate ?? '').localeCompare(a.sessionDate ?? ''));

  return {
    name: typeof campaign.name === 'string' && campaign.name.trim() ? campaign.name : 'Campaign',
    playerCount: countMembers(campaign.members),
    sessionCount: sessions.length,
    lastPlayed: sessions.find(session => session.sessionDate)?.sessionDate ?? null,
    story,
    sessions,
  };
}

function toSharedSession(id: string, data: DocumentData): SharedSession | null {
  const content = typeof data.content === 'string' ? data.content : '';
  if (data.status !== 'completed' || !content.trim()) return null;
  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    sessionDate: typeof data.sessionDate === 'string' && data.sessionDate ? data.sessionDate : null,
    content,
    podcasts: toSharedPodcasts(data.podcasts),
  };
}

/**
 * The newest finished story version. The campaign points at it; a campaign from
 * before that pointer existed is searched for its highest finished version.
 */
async function loadLatestStory(
  db: Firestore,
  campaignId: string,
  campaign: DocumentData
): Promise<SharedCampaignStory | null> {
  const latest: unknown = campaign.campaignStory?.latestCompletedVersion;
  if (typeof latest === 'number') {
    const snap = await db.doc(campaignStoryDocPath(campaignId, latest)).get();
    const story = snap.exists ? toSharedStory(snap.data() ?? {}) : null;
    if (story) return story;
  }

  const completed = await db.collection(campaignStoriesCollectionPath(campaignId)).where('status', '==', 'completed').get();
  const newest = completed.docs
    .map(doc => doc.data())
    .filter(data => typeof data.version === 'number')
    .sort((a, b) => b.version - a.version)[0];
  return newest ? toSharedStory(newest) : null;
}

function toSharedStory(data: DocumentData): SharedCampaignStory | null {
  const content = typeof data.content === 'string' ? data.content : '';
  if (data.status !== 'completed' || !content.trim() || typeof data.version !== 'number') return null;
  return {
    version: data.version,
    title: typeof data.title === 'string' ? data.title : '',
    content,
    completedAt: isoString(data.completedAt ?? data.createdAt),
    sourceSessions: (Array.isArray(data.sourceSessions) ? data.sourceSessions : []).map((source: DocumentData) => ({
      sessionId: String(source?.sessionId ?? ''),
      title: typeof source?.title === 'string' ? source.title : '',
      sessionDate: typeof source?.sessionDate === 'string' && source.sessionDate ? source.sessionDate : null,
      storyVersion: typeof source?.storyVersion === 'number' ? source.storyVersion : 1,
    })),
    sourceJournals: (Array.isArray(data.sourceJournals) ? data.sourceJournals : []).map((journal: DocumentData) => ({
      journalId: typeof journal?.journalId === 'number' ? journal.journalId : 0,
      title: typeof journal?.title === 'string' ? journal.title : '',
      date: typeof journal?.date === 'string' ? journal.date : null,
      updatedAt: typeof journal?.updatedAt === 'string' ? journal.updatedAt : null,
    })),
    editedAt: isoString(data.editedAt),
    podcasts: toSharedPodcasts(data.podcasts),
  };
}

/** The finished podcasts with audio, newest version first. */
export function toSharedPodcasts(podcasts: unknown): SharedPodcast[] {
  if (!Array.isArray(podcasts)) return [];
  return podcasts
    .filter((podcast): podcast is DocumentData =>
      !!podcast && podcast.status === 'completed' && typeof podcast.audioUrl === 'string' && !!podcast.audioUrl &&
      typeof podcast.version === 'number')
    .map(podcast => ({
      version: podcast.version,
      status: 'completed' as const,
      audioUrl: podcast.audioUrl,
      duration: typeof podcast.duration === 'number' ? podcast.duration : null,
      fileSize: typeof podcast.fileSize === 'number' ? podcast.fileSize : null,
      createdAt: isoString(podcast.audioGeneratedAt ?? podcast.createdAt),
    }))
    .sort((a, b) => b.version - a.version);
}

/** `members` is a uid map in newer campaign documents and a uid list in older ones. */
function countMembers(members: unknown): number {
  if (Array.isArray(members)) return members.length;
  return members && typeof members === 'object' ? Object.keys(members).length : 0;
}

function isoString(value: unknown): string | null {
  return toDate(value)?.toISOString() ?? null;
}
