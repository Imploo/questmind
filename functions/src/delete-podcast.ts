import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore';
import { SHARED_CORS } from './config/cors';
import { assertCampaignOwner, assertValidId, requireAuthUid } from './utils/access';
import { sessionDocPath } from './utils/session-ref';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { wrapCallable } from './utils/sentry-error-handler';
import { refusal } from './utils/error-reasons';
import { isActiveGeneration } from './utils/generation-timeouts';
import { deleteStorageFiles } from './utils/storage-cleanup';
import { PodcastEntry } from './types/audio-session.types';
import { campaignStoryDocPath, campaignStoryPodcastStoragePath } from './campaign-story/campaign-story-paths';
import { PODCAST_SHARES_COLLECTION } from './create-podcast-share';
import { ProgressTrackerService } from './services/progress-tracker.service';
import * as logger from './utils/logger';

/** Which podcast to delete: a session podcast or a campaign story podcast. */
export interface DeletePodcastRequest {
  campaignId: string;
  sessionId?: string;
  storyVersion?: number;
  podcastVersion: number;
}

export interface DeletePodcastResponse {
  /** False when the podcast was already gone. */
  deleted: boolean;
}

/** Where the podcast's audio is stored (the paths its generation wrote to). */
export const sessionPodcastStoragePath = (campaignId: string, sessionId: string, version: number) =>
  `campaigns/${campaignId}/podcasts/${sessionId}/v${version}.mp3`;

/**
 * Delete one podcast version: its entry, its audio file and its share links. Only
 * the campaign owner may. A finished or failed podcast can go, and so can one
 * whose generation was abandoned; one still being made is refused, because the
 * running generation would write it back.
 */
export const deletePodcast = onCall(
  { cors: SHARED_CORS, memory: '256MiB' },
  wrapCallable<DeletePodcastRequest, DeletePodcastResponse>('deletePodcast', async (request) => {
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
    await assertCampaignOwner(db, campaignId, uid);

    const docPath = hasSession
      ? sessionDocPath(campaignId, sessionId as string)
      : campaignStoryDocPath(campaignId, storyVersion as number);
    const storagePath = hasSession
      ? sessionPodcastStoragePath(campaignId, sessionId as string, podcastVersion)
      : campaignStoryPodcastStoragePath(campaignId, storyVersion as number, podcastVersion);
    const ref = db.doc(docPath);

    const removed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Podcast source not found.');
      }
      const podcasts: PodcastEntry[] = Array.isArray(snap.data()?.podcasts) ? snap.data()?.podcasts : [];
      const podcast = podcasts.find(p => p?.version === podcastVersion);
      if (!podcast) return null;

      const running = (podcast.status === 'pending' || podcast.status === 'script_complete') &&
        isActiveGeneration(podcast.createdAt);
      if (running) {
        throw refusal('failed-precondition', 'This podcast is still being generated.', 'podcast-generating');
      }

      // `latestPodcastVersion` stays, so the number of a deleted podcast is never given out again.
      tx.update(ref, {
        podcasts: podcasts.filter(p => p?.version !== podcastVersion),
        ...(hasSession ? { updatedAt: FieldValue.serverTimestamp() } : {}),
      });
      return podcast;
    });

    if (!removed) {
      return { deleted: false };
    }

    await deleteStorageFiles([storagePath]);
    await deleteShares(db, `${docPath}#p${podcastVersion}`);
    if (hasSession) {
      await clearPodcastFailure(db, campaignId, sessionId as string, removed);
    }
    return { deleted: true };
  })
);

/** The podcast's public share links stop working: their documents go. */
async function deleteShares(db: Firestore, sourceKey: string): Promise<void> {
  const shares = await db.collection(PODCAST_SHARES_COLLECTION).where('sourceKey', '==', sourceKey).get();
  await Promise.all(shares.docs.map(share => share.ref.delete()));
}

/**
 * A failed session podcast also marked the session's progress as failed. With the
 * podcast gone that failure goes too, so the session no longer shows it.
 */
async function clearPodcastFailure(
  db: Firestore,
  campaignId: string,
  sessionId: string,
  podcast: PodcastEntry
): Promise<void> {
  if (podcast.status !== 'failed' || !podcast.error) return;
  try {
    const session = (await db.doc(sessionDocPath(campaignId, sessionId)).get()).data();
    const progress = session?.progress;
    if (progress?.stage === 'failed' && typeof progress.error === 'string' && progress.error.startsWith(podcast.error)) {
      await ProgressTrackerService.markCompleted(campaignId, sessionId, 'Podcast deleted');
    }
  } catch (error) {
    logger.warn(`[deletePodcast] Could not clear the podcast failure of session ${sessionId}`, error);
  }
}
