import * as logger from './utils/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { SHARED_CORS } from './index';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { wrapCallable, captureFunctionError } from './utils/sentry-error-handler';
import { getAiFeatureConfig, getPodcastVoiceConfig } from './utils/ai-settings';
import { generatePodcastAudioBuffer } from './utils/podcast-tts';
import { PodcastEntry } from './types/audio-session.types';
import { generatePodcastScript, upsertPodcast, uploadPodcastMp3 } from './podcast/podcast-pipeline';
import {
  campaignStoryDocPath,
  campaignStoryPodcastStoragePath,
  isActiveGeneration,
} from './campaign-story/campaign-story-paths';

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
  },
  wrapCallable<CampaignStoryPodcastRequest, unknown>('generateCampaignStoryPodcast', async (request) => {
    ensureAuthForTesting(request);

    const { auth, data } = request;
    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { campaignId, storyVersion } = data ?? {};
    if (!campaignId || typeof campaignId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing campaignId.');
    }
    if (!storyVersion || typeof storyVersion !== 'number') {
      throw new HttpsError('invalid-argument', 'Missing storyVersion.');
    }

    const db = getFirestore();
    const campaignSnap = await db.doc(`campaigns/${campaignId}`).get();
    if (!campaignSnap.exists) {
      throw new HttpsError('not-found', 'Campaign not found.');
    }
    if (campaignSnap.data()?.ownerId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Only the campaign owner can generate campaign story podcasts.');
    }

    const storyRef = db.doc(campaignStoryDocPath(campaignId, storyVersion));

    // Allocate the podcast version atomically and register a pending entry
    const { podcastVersion, title, content, createdAt } = await db.runTransaction(async (tx) => {
      const snap = await tx.get(storyRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Campaign story version not found.');
      }
      const story = snap.data() ?? {};
      if (story.status !== 'completed' || !story.content) {
        throw new HttpsError('failed-precondition', 'Deze versie van het verhaal is nog niet klaar.');
      }
      const podcasts: PodcastEntry[] = Array.isArray(story.podcasts) ? story.podcasts : [];
      const inProgress = podcasts.some(p =>
        (p.status === 'pending' || p.status === 'script_complete') && isActiveGeneration(p.createdAt)
      );
      if (inProgress) {
        throw new HttpsError('failed-precondition', 'Er wordt al een podcast gegenereerd voor deze versie.');
      }
      const nextVersion = (story.latestPodcastVersion ?? podcasts.length) + 1;
      tx.update(storyRef, {
        podcasts: upsertPodcast(podcasts, {
          version: nextVersion,
          createdAt: new Date(),
          storyVersion,
          status: 'pending',
          progress: 0,
          progressMessage: 'Podcast generatie starten...',
        }),
        latestPodcastVersion: nextVersion,
      });
      return {
        podcastVersion: nextVersion,
        title: String(story.title ?? 'Het verhaal tot nu toe'),
        content: String(story.content),
        createdAt: story.createdAt?.toDate ? (story.createdAt.toDate() as Date) : undefined,
      };
    });

    // Read-modify-write in a transaction so concurrent updates to other entries aren't lost
    const updateEntry = (patch: Partial<PodcastEntry>) => db.runTransaction(async (tx) => {
      const snap = await tx.get(storyRef);
      const podcasts: PodcastEntry[] = Array.isArray(snap.data()?.podcasts) ? snap.data()?.podcasts : [];
      tx.update(storyRef, { podcasts: upsertPodcast(podcasts, { version: podcastVersion, ...patch }) });
    });

    try {
      const voiceConfig = await getPodcastVoiceConfig();
      const scriptConfig = await getAiFeatureConfig('podcastScript');

      await updateEntry({ progress: 10, progressMessage: 'Podcast script schrijven...' });
      const script = await generatePodcastScript(
        { kind: 'campaign', title, date: createdAt?.toISOString().slice(0, 10), body: content },
        scriptConfig,
        voiceConfig.maxCharacters
      );
      await updateEntry({
        status: 'script_complete',
        script,
        scriptGeneratedAt: new Date(),
        duration: script.estimatedDuration,
        modelUsed: scriptConfig.model,
        progress: 50,
        progressMessage: 'Audio genereren...',
      });

      const audioBuffer = await generatePodcastAudioBuffer(
        script.segments,
        voiceConfig,
        (progress, message) => updateEntry({ progress, progressMessage: message })
      );

      await updateEntry({ progress: 85, progressMessage: 'Podcast opslaan...' });
      const storagePath = campaignStoryPodcastStoragePath(campaignId, storyVersion, podcastVersion);
      const { audioUrl, fileSize } = await uploadPodcastMp3(getStorage().bucket(), storagePath, audioBuffer, {
        campaignId,
        storyVersion: storyVersion.toString(),
        version: podcastVersion.toString(),
        userId: auth.uid,
      });

      await updateEntry({
        status: 'completed',
        audioUrl,
        fileSize,
        audioGeneratedAt: new Date(),
        progress: 100,
        progressMessage: 'Klaar',
        error: null,
      });
      logger.debug(`Campaign story podcast completed: ${storagePath}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureFunctionError('generateCampaignStoryPodcast', err, { campaignId, storyVersion, podcastVersion });
      await updateEntry({ status: 'failed', error: err.message, progressMessage: 'Mislukt' });
      // Don't throw — the failure is persisted on the PodcastEntry
    }

    return { success: true, version: podcastVersion };
  })
);
