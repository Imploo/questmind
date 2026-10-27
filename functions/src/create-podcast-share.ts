import { randomBytes } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { SHARED_CORS } from './config/cors';
import { assertCampaignMember, assertValidId, requireAuthUid } from './utils/access';
import { sessionDocPath } from './utils/session-ref';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { wrapCallable } from './utils/sentry-error-handler';
import { PodcastEntry } from './types/audio-session.types';
import { campaignStoryDocPath } from './campaign-story/campaign-story-paths';

export const PODCAST_SHARES_COLLECTION = 'podcastShares';

/** Which podcast to share: a session podcast or a campaign story podcast. */
export interface CreatePodcastShareRequest {
  campaignId: string;
  sessionId?: string;
  storyVersion?: number;
  podcastVersion: number;
}

export interface CreatePodcastShareResponse {
  shareId: string;
}

/**
 * Public share document — readable by anyone who knows the (unguessable) id,
 * so it only holds what the share page shows.
 */
export interface PodcastShare {
  title: string;
  subtitle: string;
  audioUrl: string;
  durationSec: number | null;
  /** `<source document path>#p<podcastVersion>`, used to reuse an existing share. */
  sourceKey: string;
  campaignId: string;
  createdBy: string;
  createdAt: string;
}

interface PodcastSource {
  docPath: string;
  title: string;
}

/**
 * Create (or return the existing) public share link for a podcast. Any campaign
 * member may share; the share id is a random 128-bit token. The audio URL is the
 * podcast's tokenized Storage URL, which works without authentication.
 */
export const createPodcastShare = onCall(
  { cors: SHARED_CORS, memory: '256MiB' },
  wrapCallable<CreatePodcastShareRequest, CreatePodcastShareResponse>('createPodcastShare', async (request) => {
    ensureAuthForTesting(request);

    const uid = requireAuthUid(request);

    const { sessionId, storyVersion, podcastVersion } = request.data ?? {};
    const campaignId = assertValidId(request.data?.campaignId, 'campaignId');
    if (typeof podcastVersion !== 'number') {
      throw new HttpsError('invalid-argument', 'Missing podcastVersion.');
    }
    const hasSession = typeof sessionId === 'string' && sessionId.length > 0;
    const hasStoryVersion = typeof storyVersion === 'number';
    if (hasSession === hasStoryVersion) {
      throw new HttpsError('invalid-argument', 'Provide either sessionId or storyVersion.');
    }

    if (hasSession) {
      assertValidId(sessionId, 'sessionId');
    }

    const db = getFirestore();
    const campaign = await assertCampaignMember(db, campaignId, uid);

    const source: PodcastSource = hasSession
      ? { docPath: sessionDocPath(campaignId, sessionId as string), title: 'Sessie' }
      : { docPath: campaignStoryDocPath(campaignId, storyVersion as number), title: 'Campagneverhaal' };

    const sourceSnap = await db.doc(source.docPath).get();
    if (!sourceSnap.exists) {
      throw new HttpsError('not-found', 'Podcast source not found.');
    }
    const sourceData = sourceSnap.data() ?? {};
    const podcasts: PodcastEntry[] = Array.isArray(sourceData.podcasts) ? sourceData.podcasts : [];
    const podcast = podcasts.find(p => p.version === podcastVersion);
    if (!podcast?.audioUrl || podcast.status !== 'completed') {
      throw new HttpsError('failed-precondition', 'Deze podcast is nog niet klaar om te delen.');
    }

    const shares = db.collection(PODCAST_SHARES_COLLECTION);
    const sourceKey = `${source.docPath}#p${podcastVersion}`;
    const existing = await shares.where('sourceKey', '==', sourceKey).limit(1).get();
    if (!existing.empty) {
      return { shareId: existing.docs[0].id };
    }

    const share: PodcastShare = {
      title: sourceData.title || source.title,
      subtitle: buildSubtitle(campaign.name, hasSession ? sourceData.sessionDate : null, podcastVersion),
      audioUrl: podcast.audioUrl,
      durationSec: typeof podcast.duration === 'number' ? podcast.duration : null,
      sourceKey,
      campaignId,
      createdBy: uid,
      createdAt: new Date().toISOString(),
    };
    const shareId = randomBytes(16).toString('base64url');
    await shares.doc(shareId).create(share);
    return { shareId };
  })
);

function buildSubtitle(campaignName: unknown, sessionDate: unknown, podcastVersion: number): string {
  return [
    typeof campaignName === 'string' ? campaignName : null,
    typeof sessionDate === 'string' && sessionDate ? sessionDate : null,
    `Podcast ${podcastVersion}`,
  ].filter(Boolean).join(' · ');
}
