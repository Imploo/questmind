import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { SHARED_CORS } from './config/cors';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { wrapCallable } from './utils/sentry-error-handler';
import { assertSessionOwner, assertValidId, requireAuthUid } from './utils/access';
import { sessionRef } from './utils/session-ref';
import { getGeminiApiKey } from './utils/gemini-client';
import { SESSION_PODCAST_TIMEOUT_SECONDS } from './utils/generation-timeouts';
import {
  PodcastProgressListener,
  createDocPodcastEntryStore,
  runPodcastGeneration,
} from './podcast/run-podcast-generation';

/**
 * Only ids (and an optional title/date fallback) are taken from the client.
 * The story text and podcast version are decided server-side; legacy fields
 * such as `version`, `story` or `script` are ignored.
 */
interface PodcastGenerationRequest {
  campaignId: string;
  sessionId: string;
  sessionTitle?: string;
  sessionDate?: string;
}

export interface PodcastGenerationResponse {
  success: boolean;
  message: string;
  version: number;
}

/**
 * Generates a podcast for a session story. Only the session owner may generate.
 * Progress is written to the PodcastEntry and to the session's unified progress
 * (`generating-podcast-*` stages), which the UI follows.
 */
export const generatePodcastAudio = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
    timeoutSeconds: SESSION_PODCAST_TIMEOUT_SECONDS,
  },
  wrapCallable<PodcastGenerationRequest, PodcastGenerationResponse>('generatePodcastAudio', async (request) => {
    ensureAuthForTesting(request);
    const uid = requireAuthUid(request);

    const campaignId = assertValidId(request.data?.campaignId, 'campaignId');
    const sessionId = assertValidId(request.data?.sessionId, 'sessionId');
    const { sessionTitle, sessionDate } = request.data;

    const db = getFirestore();
    await assertSessionOwner(db, campaignId, sessionId, uid);
    getGeminiApiKey();

    const store = createDocPodcastEntryStore(db, sessionRef(db, campaignId, sessionId), {
      touchUpdatedAt: true,
      storyVersion: (data) => data.storyRegenerationCount ?? 1,
      readSource: (data) => {
        const body = typeof data.content === 'string' ? data.content.trim() : '';
        if (!body) {
          throw new HttpsError('failed-precondition', 'Deze sessie heeft nog geen verhaal.');
        }
        return {
          kind: 'session',
          title: data.title || (typeof sessionTitle === 'string' && sessionTitle) || 'Untitled Session',
          date: data.sessionDate || (typeof sessionDate === 'string' ? sessionDate : undefined),
          body,
        };
      },
    });

    const { version } = await runPodcastGeneration({
      store,
      functionName: 'generatePodcastAudio',
      context: { campaignId, sessionId },
      storagePath: (v) => `campaigns/${campaignId}/podcasts/${sessionId}/v${v}.mp3`,
      uploadMetadata: (v) => ({ sessionId, campaignId, version: v.toString(), userId: uid }),
      listener: sessionProgressListener(campaignId, sessionId),
    });

    return {
      success: true,
      message: 'Podcast generation complete',
      version,
    };
  })
);

/** Mirrors podcast progress into the session's unified progress (script < 50% ≤ audio). */
function sessionProgressListener(campaignId: string, sessionId: string): PodcastProgressListener {
  return {
    onProgress: (progress, message) => ProgressTrackerService.updateProgress(
      campaignId,
      sessionId,
      progress < 50 ? 'generating-podcast-script' : 'generating-podcast-audio',
      progress,
      message
    ),
    onCompleted: () => ProgressTrackerService.markCompleted(campaignId, sessionId, 'Podcast klaar'),
    onFailed: (error) => ProgressTrackerService.markFailed(campaignId, sessionId, 'generating-podcast-audio', error),
  };
}
