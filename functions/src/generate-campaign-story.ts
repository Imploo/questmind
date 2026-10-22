import * as logger from './utils/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { SHARED_CORS } from './index';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { wrapCallable, captureFunctionError } from './utils/sentry-error-handler';
import { getCampaignStoryConfig } from './utils/ai-settings';
import { selectCampaignStorySources, SessionDocForCampaignStory } from './campaign-story/campaign-story-sources';
import { generateCampaignStory as generateCampaignStoryText } from './campaign-story/campaign-story-generator.service';
import { CampaignStoryVersion } from './types/campaign-story.types';
import {
  campaignStoriesCollectionPath,
  campaignStoryDocPath,
  isActiveGeneration,
} from './campaign-story/campaign-story-paths';

interface GenerateCampaignStoryRequest {
  campaignId: string;
}

/**
 * Generates a new version of the campaign story (ticket #69) from all completed
 * session stories. Only the campaign owner may generate.
 */
export const generateCampaignStory = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
    timeoutSeconds: 540,
  },
  wrapCallable<GenerateCampaignStoryRequest, unknown>('generateCampaignStory', async (request) => {
    ensureAuthForTesting(request);

    const { auth, data } = request;
    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { campaignId } = data ?? {};
    if (!campaignId || typeof campaignId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing campaignId.');
    }

    const db = getFirestore();
    const campaignRef = db.doc(`campaigns/${campaignId}`);
    const campaignSnap = await campaignRef.get();
    if (!campaignSnap.exists) {
      throw new HttpsError('not-found', 'Campaign not found.');
    }
    if (campaignSnap.data()?.ownerId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Only the campaign owner can generate the campaign story.');
    }

    const generatingSnap = await db.collection(campaignStoriesCollectionPath(campaignId))
      .where('status', '==', 'generating')
      .get();
    if (generatingSnap.docs.some(doc => isActiveGeneration(doc.data().createdAt))) {
      throw new HttpsError('failed-precondition', 'Er wordt al een verhaal gegenereerd.');
    }

    const sessionsSnap = await db.collection(`campaigns/${campaignId}/audioSessions`).get();
    const sessions: SessionDocForCampaignStory[] = sessionsSnap.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Omit<SessionDocForCampaignStory, 'id'>),
    }));
    const { sources, skipped, inputs } = selectCampaignStorySources(sessions);
    if (sources.length === 0) {
      throw new HttpsError('failed-precondition', 'Er zijn nog geen sessieverhalen om samen te vatten.');
    }

    // Allocate the version number atomically so double clicks can't collide
    const version = await db.runTransaction(async (tx) => {
      const snap = await tx.get(campaignRef);
      const nextVersion = (snap.data()?.campaignStory?.latestVersion ?? 0) + 1;
      const entry: CampaignStoryVersion = {
        version: nextVersion,
        status: 'generating',
        sourceSessions: sources,
        skippedSessions: skipped,
        createdBy: auth.uid,
        createdAt: new Date(),
        progress: 10,
        progressMessage: 'Sessieverhalen verzamelen...',
        error: null,
        podcasts: [],
      };
      // create() (not set()) so a lost counter can never overwrite an existing version
      tx.create(db.doc(campaignStoryDocPath(campaignId, nextVersion)), entry);
      tx.update(campaignRef, { 'campaignStory.latestVersion': nextVersion });
      return nextVersion;
    });

    const versionRef = db.doc(campaignStoryDocPath(campaignId, version));

    try {
      const config = await getCampaignStoryConfig();
      await versionRef.update({ progress: 30, progressMessage: 'Verhaal schrijven...' });

      const story = await generateCampaignStoryText(inputs, config);

      await versionRef.update({
        status: 'completed',
        title: story.title,
        content: story.content,
        wordCount: story.wordCount,
        modelUsed: config.model,
        completedAt: new Date(),
        progress: 100,
        progressMessage: 'Klaar',
        error: null,
      });
      // Campaign updatedAt is intentionally left alone (frontend schema expects an ISO string)
      await campaignRef.update({ 'campaignStory.latestCompletedVersion': version });

      logger.info(`Campaign story v${version} generated`, {
        campaignId, sessions: sources.length, wordCount: story.wordCount,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureFunctionError('generateCampaignStory', err, { campaignId, version });
      await versionRef.update({
        status: 'failed',
        error: err.message,
        progressMessage: 'Mislukt',
      });
      // Don't throw — the failure is persisted on the version document
    }

    return { success: true, version };
  })
);
