import * as logger from './utils/logger';
import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { SHARED_CORS } from './config/cors';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { assertCampaignOwner, assertValidId, requireAuthUid } from './utils/access';
import { CAMPAIGN_STORY_TIMEOUT_SECONDS, isActiveGeneration } from './utils/generation-timeouts';
import { wrapCallable, captureFunctionError } from './utils/sentry-error-handler';
import { getCampaignStoryConfig } from './utils/ai-settings';
import { selectCampaignStorySources, SessionDocForCampaignStory } from './campaign-story/campaign-story-sources';
import { generateCampaignStory as generateCampaignStoryText } from './campaign-story/campaign-story-generator.service';
import { CampaignStoryProgressStep, CampaignStoryVersion } from './types/campaign-story.types';
import { campaignStoriesCollectionPath, campaignStoryDocPath } from './campaign-story/campaign-story-paths';
import { refusal } from './utils/error-reasons';

interface GenerateCampaignStoryRequest {
  campaignId: string;
}

/**
 * The step and its Dutch text, written together: `progressMessage` is for clients
 * that have not refreshed yet, the app itself shows its own text for `progressStep`.
 */
const STEP_MESSAGES: Record<CampaignStoryProgressStep, string> = {
  collecting: 'Sessieverhalen verzamelen...',
  writing: 'Verhaal schrijven...',
  done: 'Klaar',
  failed: 'Mislukt',
};

function progressFields(step: CampaignStoryProgressStep): { progressStep: CampaignStoryProgressStep; progressMessage: string } {
  return { progressStep: step, progressMessage: STEP_MESSAGES[step] };
}

/**
 * Generates a new version of the campaign story (ticket #69) from all completed
 * session stories. Only the campaign owner may generate.
 */
export const generateCampaignStory = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
    timeoutSeconds: CAMPAIGN_STORY_TIMEOUT_SECONDS,
  },
  wrapCallable<GenerateCampaignStoryRequest, unknown>('generateCampaignStory', async (request) => {
    ensureAuthForTesting(request);

    const uid = requireAuthUid(request);
    const campaignId = assertValidId(request.data?.campaignId, 'campaignId');

    const db = getFirestore();
    await assertCampaignOwner(db, campaignId, uid);
    const campaignRef = db.doc(`campaigns/${campaignId}`);

    const generatingSnap = await db.collection(campaignStoriesCollectionPath(campaignId))
      .where('status', '==', 'generating')
      .get();
    if (generatingSnap.docs.some(doc => isActiveGeneration(doc.data().createdAt))) {
      throw refusal('failed-precondition', 'A campaign story is already being generated.', 'story-already-generating');
    }

    const sessionsSnap = await db.collection(`campaigns/${campaignId}/audioSessions`).get();
    const sessions: SessionDocForCampaignStory[] = sessionsSnap.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Omit<SessionDocForCampaignStory, 'id'>),
    }));
    const { sources, skipped, inputs } = selectCampaignStorySources(sessions);
    if (sources.length === 0) {
      throw refusal('failed-precondition', 'There are no session stories to summarize yet.', 'no-session-stories');
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
        createdBy: uid,
        createdAt: new Date(),
        progress: 10,
        ...progressFields('collecting'),
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
      await versionRef.update({ progress: 30, ...progressFields('writing') });

      const story = await generateCampaignStoryText(inputs, config);

      await versionRef.update({
        status: 'completed',
        title: story.title,
        content: story.content,
        wordCount: story.wordCount,
        modelUsed: config.model,
        completedAt: new Date(),
        progress: 100,
        ...progressFields('done'),
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
        ...progressFields('failed'),
      });
      // Don't throw — the failure is persisted on the version document
    }

    return { success: true, version };
  })
);
