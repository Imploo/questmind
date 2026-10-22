import * as logger from './utils/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { Bucket } from '@google-cloud/storage';
import { SHARED_CORS } from './index';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { wrapCallable, captureFunctionError } from './utils/sentry-error-handler';
import { getAiFeatureConfig, getPodcastVoiceConfig } from './utils/ai-settings';
import { generatePodcastAudioBuffer } from './utils/podcast-tts';
import { AIFeatureConfig, PodcastEntry } from './types/audio-session.types';
import {
  PodcastScript,
  generatePodcastScript,
  upsertPodcast,
  uploadPodcastMp3,
} from './podcast/podcast-pipeline';

async function updatePodcastEntry(
  sessionRef: FirebaseFirestore.DocumentReference,
  existingPodcasts: PodcastEntry[],
  version: number,
  data: Partial<PodcastEntry>
) {
  await sessionRef.update({
    podcasts: upsertPodcast(existingPodcasts, { version, ...data }),
    updatedAt: FieldValue.serverTimestamp()
  });
}

interface PodcastGenerationRequest {
  campaignId: string;
  sessionId: string;
  version: number;
  story?: string;
  sessionTitle?: string;
  sessionDate?: string;
  script?: PodcastScript;
}

export const generatePodcastAudio = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
  },
  wrapCallable<PodcastGenerationRequest, unknown>('generatePodcastAudio', async (request) => {
    ensureAuthForTesting(request);

    const { auth, data } = request;

    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { campaignId, sessionId, version, story, sessionTitle, sessionDate, script } = data;

    if (!campaignId || typeof campaignId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing campaignId.');
    }
    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing sessionId.');
    }
    if (!version || typeof version !== 'number') {
      throw new HttpsError('invalid-argument', 'Missing version.');
    }

    if (!script) {
      if (!story || typeof story !== 'string') {
        throw new HttpsError('invalid-argument', 'Missing story (required for script generation).');
      }
      if (!sessionTitle || typeof sessionTitle !== 'string') {
        throw new HttpsError('invalid-argument', 'Missing sessionTitle (required for script generation).');
      }
    } else {
      if (!Array.isArray(script.segments) || script.segments.length === 0) {
        throw new HttpsError('invalid-argument', 'Invalid script provided.');
      }
    }

    const db = getFirestore();
    const storage = getStorage().bucket();
    const campaignRef = db.doc(`campaigns/${campaignId}`);
    const campaignSnap = await campaignRef.get();

    if (!campaignSnap.exists) {
      throw new HttpsError('not-found', 'Campaign not found.');
    }

    const campaignData = campaignSnap.data() || {};
    if (!campaignData.members || !campaignData.members[auth.uid]) {
      throw new HttpsError('permission-denied', 'User is not a campaign member.');
    }

    const sessionRef = db.doc(`campaigns/${campaignId}/audioSessions/${sessionId}`);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      throw new HttpsError('not-found', 'Session not found.');
    }

    const sessionData = sessionSnap.data() || {};
    if (sessionData.ownerId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Only the session owner can generate podcasts.');
    }
    const existingPodcasts: PodcastEntry[] = Array.isArray(sessionData.podcasts) ? sessionData.podcasts : [];
    const existingEntry = existingPodcasts.find(podcast => podcast?.version === version);

    const now = new Date();
    const initialPodcastEntry = {
      version,
      createdAt: existingEntry?.createdAt ?? now,
      storyVersion: sessionData.storyRegenerationCount ?? existingEntry?.storyVersion ?? 1,
      status: 'pending' as const,
      progress: 0,
      progressMessage: 'Starting podcast generation...'
    };

    await sessionRef.update({
      podcasts: upsertPodcast(existingPodcasts, initialPodcastEntry),
      latestPodcastVersion: version,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Await so Firebase keeps the function alive until completion
    try {
      await generatePodcastInBackground(
        campaignId,
        sessionId,
        version,
        script,
        story,
        sessionTitle,
        sessionDate,
        sessionRef,
        existingPodcasts,
        auth.uid,
        storage
      );
    } catch (error) {
      captureFunctionError('generatePodcastAudio', error instanceof Error ? error : new Error(String(error)), {
        campaignId, sessionId, version
      });
      // Don't throw — errors are already persisted to Firestore by generatePodcastInBackground
    }

    return {
      success: true,
      message: 'Podcast generation complete'
    };
  })
);

async function generatePodcastInBackground(
  campaignId: string,
  sessionId: string,
  version: number,
  script: PodcastScript | undefined,
  story: string | undefined,
  sessionTitle: string | undefined,
  sessionDate: string | undefined,
  sessionRef: FirebaseFirestore.DocumentReference,
  existingPodcasts: PodcastEntry[],
  userId: string,
  storage: Bucket
) {
  try {
    let finalScript: PodcastScript;
    let scriptConfig: AIFeatureConfig | null = null;
    const voiceConfig = await getPodcastVoiceConfig();

    // STEP 1: Generate script if not provided
    if (!script) {
      await ProgressTrackerService.updateProgress(
        campaignId, sessionId, 'generating-podcast-script', 10, 'Generating podcast script...'
      );

      scriptConfig = await getAiFeatureConfig('podcastScript');

      finalScript = await generatePodcastScript(
        { kind: 'session', title: sessionTitle ?? '', date: sessionDate, body: story ?? '' },
        scriptConfig,
        voiceConfig.maxCharacters
      );

      await updatePodcastEntry(sessionRef, existingPodcasts, version, {
        status: 'script_complete',
        script: finalScript,
        scriptGeneratedAt: new Date(),
        duration: finalScript.estimatedDuration,
        modelUsed: scriptConfig.model
      });

      logger.debug(`Script: ${finalScript.segments.length} segments, ~${finalScript.estimatedDuration}s`);
    } else {
      finalScript = script;
      await updatePodcastEntry(sessionRef, existingPodcasts, version, {
        status: 'script_complete',
        script: finalScript,
        scriptGeneratedAt: new Date(),
        duration: finalScript.estimatedDuration
      });
      logger.debug(`Using provided script: ${finalScript.segments.length} segments`);
    }

    // STEP 2: Generate audio via Gemini TTS
    await ProgressTrackerService.updateProgress(
      campaignId, sessionId, 'generating-podcast-audio', 55, 'Generating podcast audio with Gemini...'
    );

    const audioBuffer = await generatePodcastAudioBuffer(
      finalScript.segments,
      voiceConfig,
      (progress, message) => ProgressTrackerService.updateProgress(
        campaignId, sessionId, 'generating-podcast-audio', progress, message
      )
    );

    logger.debug(`Generated podcast: ${audioBuffer.length} bytes`);

    // STEP 3: Upload to Firebase Storage
    await ProgressTrackerService.updateProgress(
      campaignId, sessionId, 'generating-podcast-audio', 85, 'Uploading podcast to storage...'
    );

    const storagePath = `campaigns/${campaignId}/podcasts/${sessionId}/v${version}.mp3`;
    const { audioUrl: fileUrl, fileSize } = await uploadPodcastMp3(storage, storagePath, audioBuffer, {
      sessionId,
      campaignId,
      version: version.toString(),
      userId
    });

    await updatePodcastEntry(sessionRef, existingPodcasts, version, {
      status: 'completed',
      audioUrl: fileUrl,
      fileSize,
      audioGeneratedAt: new Date(),
      modelUsed: scriptConfig?.model,
      error: null
    });

    await ProgressTrackerService.markCompleted(campaignId, sessionId, 'Podcast generation complete');

    logger.debug(`Podcast generation completed: ${fileUrl}`);

  } catch (error: unknown) {
    logger.error('Error generating podcast:', error);

    await updatePodcastEntry(sessionRef, existingPodcasts, version, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    await ProgressTrackerService.markFailed(campaignId, sessionId, 'generating-podcast-audio', error instanceof Error ? error : new Error(String(error)));
  }
}
