import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { SHARED_CORS } from './config/cors';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { wrapCallable } from './utils/sentry-error-handler';
import { assertCampaignOwner, assertValidId, requireAuthUid } from './utils/access';
import { getGeminiApiKey } from './utils/gemini-client';
import { createDocPodcastEntryStore, runPodcastGeneration } from './podcast/run-podcast-generation';
import { campaignStoryDocPath, campaignStoryPodcastStoragePath } from './campaign-story/campaign-story-paths';
import { CAMPAIGN_STORY_PODCAST_TIMEOUT_SECONDS } from './utils/generation-timeouts';
import { toDate } from './utils/timestamp';

interface CampaignStoryPodcastRequest {
  campaignId: string;
  storyVersion: number;
}

/**
 * Generates a podcast for a campaign story version (ticket #69), using the same
 * podcast settings (voices, maxCharacters, script model) as session podcasts.
 * Only the campaign owner may generate. Progress is tracked on the PodcastEntry.
 */
export const generateCampaignStoryPodcast = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
    timeoutSeconds: CAMPAIGN_STORY_PODCAST_TIMEOUT_SECONDS,
  },
  wrapCallable<CampaignStoryPodcastRequest, unknown>('generateCampaignStoryPodcast', async (request) => {
    ensureAuthForTesting(request);
    const uid = requireAuthUid(request);

    const campaignId = assertValidId(request.data?.campaignId, 'campaignId');
    const { storyVersion } = request.data;
    if (!storyVersion || typeof storyVersion !== 'number' || !Number.isInteger(storyVersion)) {
      throw new HttpsError('invalid-argument', 'Missing storyVersion.');
    }

    const db = getFirestore();
    await assertCampaignOwner(db, campaignId, uid);
    getGeminiApiKey();

    const store = createDocPodcastEntryStore(db, db.doc(campaignStoryDocPath(campaignId, storyVersion)), {
      storyVersion: () => storyVersion,
      readSource: (story) => {
        if (story.status !== 'completed' || !story.content) {
          throw new HttpsError('failed-precondition', 'Deze versie van het verhaal is nog niet klaar.');
        }
        return {
          kind: 'campaign',
          title: String(story.title ?? 'Het verhaal tot nu toe'),
          date: toDate(story.createdAt)?.toISOString().slice(0, 10),
          body: String(story.content),
        };
      },
    });

    const { version } = await runPodcastGeneration({
      store,
      functionName: 'generateCampaignStoryPodcast',
      context: { campaignId, storyVersion },
      storagePath: (v) => campaignStoryPodcastStoragePath(campaignId, storyVersion, v),
      uploadMetadata: (v) => ({
        campaignId,
        storyVersion: storyVersion.toString(),
        version: v.toString(),
        userId: uid,
      }),
    });

    return { success: true, version };
  })
);
