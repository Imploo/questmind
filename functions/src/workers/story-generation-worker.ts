import * as logger from '../utils/logger';
import {onCall} from 'firebase-functions/v2/https';
import {onTaskDispatched} from 'firebase-functions/v2/tasks';
import {DocumentData, getFirestore} from 'firebase-admin/firestore';
import {SHARED_CORS} from '../config/cors';
import {ProgressTrackerService} from '../services/progress-tracker.service';
import {generateStoryFromTranscription} from '../story/story-generator.service';
import {PreviousStory} from '../types/audio-session.types';
import {fetchKankaContextForSession} from '../services/kanka.service';
import {getAiFeatureConfig} from '../utils/ai-settings';
import {TASK_WORKER_TIMEOUT_SECONDS} from '../services/task-queue.service';
import {captureFunctionError, wrapCallable} from '../utils/sentry-error-handler';
import {ensureAuthForTesting} from '../utils/emulator-helpers';
import {assertValidId, loadSessionForMember, requireAuthUid} from '../utils/access';
import {getGeminiApiKey} from '../utils/gemini-client';
import {sessionRef} from '../utils/session-ref';
import {refusal} from '../utils/error-reasons';

const MAX_PREVIOUS_STORIES_CHARS = 100_000;

export interface StoryGenerationPayload {
  campaignId: string;
  sessionId: string;
  /** When true, the worker fetches fresh context from the Kanka API. */
  enableKankaContext?: boolean;
  userCorrections?: string | null;
}

/**
 * What started the generation: a member asking for the story again (same session
 * log), or the audio pipeline after a (new) transcription.
 */
export type StoryGenerationTrigger = 'regenerate' | 'transcription';

/**
 * Fetches previous completed stories from the same campaign,
 * sorted chronologically, within the character limit.
 */
async function fetchPreviousStories(
  campaignId: string,
  currentSessionDate: string
): Promise<PreviousStory[]> {
  const db = getFirestore();

  const previousSessionsSnap = await db
    .collection(`campaigns/${campaignId}/audioSessions`)
    .where('sessionDate', '<', currentSessionDate)
    .where('status', '==', 'completed')
    .orderBy('sessionDate', 'asc')
    .select('title', 'sessionDate', 'content')
    .get();

  const allStories: PreviousStory[] = previousSessionsSnap.docs
    .filter(doc => doc.data().content && doc.data().sessionDate)
    .map(doc => ({
      title: doc.data().title || 'Untitled Session',
      sessionDate: doc.data().sessionDate,
      content: doc.data().content,
    }));

  // Select most recent stories that fit within the character limit
  const selected: PreviousStory[] = [];
  let totalChars = 0;

  // Loop from newest to oldest
  for (let i = allStories.length - 1; i >= 0; i--) {
    const storyChars = allStories[i].content.length;
    if (totalChars + storyChars > MAX_PREVIOUS_STORIES_CHARS) {
      break;
    }
    selected.unshift(allStories[i]);
    totalChars += storyChars;
  }

  return selected;
}

/** The version of the session's story; a story that was never replaced is version 1. */
function storyVersionOf(sessionData: DocumentData | undefined): number {
  const count = sessionData?.storyRegenerationCount;
  return typeof count === 'number' && count >= 1 ? count : 1;
}

/**
 * Generates the session story from the transcription stored on the session
 * (`rawStory`). A story that was edited by hand is passed along as the previous
 * version. Marks the session failed and rethrows on error; the caller reports
 * the error (once).
 */
export async function runStoryGeneration(
  payload: StoryGenerationPayload,
  trigger: StoryGenerationTrigger = 'regenerate'
): Promise<void> {
  const {campaignId, sessionId, enableKankaContext, userCorrections} = payload;
  const ref = sessionRef(getFirestore(), campaignId, sessionId);

  try {
    // Update progress: Starting story generation (80-100% range)
    await ProgressTrackerService.updateProgress(
      campaignId,
      sessionId,
      'generating-story',
      82,
      'Loading AI settings for story generation...'
    );

    // Load AI settings
    const storyConfig = await getAiFeatureConfig('storyGeneration');

    // The source text always comes from the session itself, never from the caller.
    const sessionData = (await ref.get()).data();
    const storyInput = sessionData?.rawStory as string | undefined;
    if (!storyInput) {
      throw new Error('No transcription found for this session');
    }

    // A story the DM edited by hand goes along with the new generation, so the
    // improvements made in it stay in this and every later version. An untouched
    // story does not: regenerating it starts fresh from the log.
    const currentStory = typeof sessionData?.content === 'string' ? sessionData.content.trim() : '';
    const previousVersion = currentStory && sessionData?.storyEditedAt
      ? {content: currentStory, logRenewed: trigger === 'transcription'}
      : undefined;

    const kankaContext = await fetchKankaContextForSession(campaignId, sessionId, !!enableKankaContext);

    // Fetch previous stories if current session has a sessionDate
    let previousStories: PreviousStory[] | undefined;
    const currentSessionDate = sessionData?.sessionDate as string | undefined;
    if (currentSessionDate) {
      logger.debug(`[StoryGeneration] Fetching previous stories for campaign ${campaignId}...`);
      previousStories = await fetchPreviousStories(campaignId, currentSessionDate);
      logger.debug(`[StoryGeneration] Found ${previousStories.length} previous stories`);
    }

    // Update progress: Generating story (90%)
    await ProgressTrackerService.updateProgress(
      campaignId,
      sessionId,
      'generating-story',
      90,
      'Generating story from transcription...'
    );

    logger.debug(`[StoryGeneration] Generating story for ${sessionId}...`);

    const storyContent = await generateStoryFromTranscription(
      storyInput,
      storyConfig,
      {
        kankaContext,
        userCorrections: userCorrections ?? undefined,
        previousStories,
        previousVersion,
      }
    );

    logger.debug(`[StoryGeneration] Story generated: ${storyContent.length} characters`);

    // Save story to Firestore
    const generatedAt = new Date().toISOString();
    await ref.update({
      content: storyContent,
      storyGeneratedAt: generatedAt,
      status: 'completed',
      // Replacing a story makes a new version of it; the campaign story compares
      // this number to know it still holds the older one.
      ...(currentStory
        ? {
          storyRegenerationCount: storyVersionOf(sessionData) + 1,
          storyRegeneratedAt: generatedAt,
        }
        : {}),
    });

    // Mark session as completed (100%)
    await ProgressTrackerService.markCompleted(campaignId, sessionId);

    logger.debug(`[StoryGeneration] Completed processing for session ${sessionId}`);
  } catch (error) {
    await ProgressTrackerService.markFailed(
      campaignId,
      sessionId,
      'generating-story',
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
}

/**
 * (Re)generate a session's story on request of a campaign member. The story is
 * written from the transcription stored on the session; the caller only picks
 * the session and the options.
 */
export const storyGenerationWorker = onCall(
  {
    cors: SHARED_CORS,
    timeoutSeconds: 1200,
    memory: '2GiB',
    secrets: ['GOOGLE_AI_API_KEY', 'KANKA_API_TOKEN'],
  },
  wrapCallable<StoryGenerationPayload, {success: boolean; stage: string}>(
    'storyGenerationWorker',
    async (request) => {
      ensureAuthForTesting(request);
      const uid = requireAuthUid(request);

      const campaignId = assertValidId(request.data?.campaignId, 'campaignId');
      const sessionId = assertValidId(request.data?.sessionId, 'sessionId');
      const {enableKankaContext, userCorrections} = request.data;

      const session = await loadSessionForMember(getFirestore(), campaignId, sessionId, uid);
      if (!session.rawStory) {
        throw refusal('failed-precondition', 'No transcription found for this session', 'no-transcription');
      }
      getGeminiApiKey();

      // Errors propagate to wrapCallable, which reports them once.
      await runStoryGeneration({
        campaignId,
        sessionId,
        enableKankaContext: enableKankaContext === true,
        userCorrections: typeof userCorrections === 'string' ? userCorrections : null,
      });

      return {success: true, stage: 'storyGenerationWorker'};
    }
  )
);

/**
 * Story generation as a task-queue step of the audio pipeline (process →
 * transcribe → story). Runs in its own live request with its own time budget.
 * Not retried by Cloud Tasks: failures are written to the session by
 * runStoryGeneration and reported to Sentry once, here.
 */
export const storyGenerationTaskWorker = onTaskDispatched<StoryGenerationPayload>(
  {
    timeoutSeconds: TASK_WORKER_TIMEOUT_SECONDS,
    memory: '1GiB',
    secrets: ['GOOGLE_AI_API_KEY', 'KANKA_API_TOKEN'],
    retryConfig: {maxAttempts: 1},
  },
  async (request) => {
    try {
      await runStoryGeneration(request.data, 'transcription');
    } catch (error) {
      // Already recorded on the session (markFailed); don't let Cloud Tasks log a 500.
      captureFunctionError(
        'storyGenerationTaskWorker',
        error instanceof Error ? error : new Error(String(error)),
        {campaignId: request.data.campaignId, sessionId: request.data.sessionId}
      );
    }
  }
);
