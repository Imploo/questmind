import * as logger from '../utils/logger';
import {HttpsError} from 'firebase-functions/v2/https';
import {onTaskDispatched} from 'firebase-functions/v2/tasks';
import {getFirestore} from 'firebase-admin/firestore';
import {ProgressTrackerService} from '../services/progress-tracker.service';
import {WorkerQueueService, WorkerPayload} from '../services/worker-queue.service';
import {generateStoryFromTranscription} from '../story/story-generator.service';
import {
  KankaSearchResult,
  PreviousStory,
} from '../types/audio-session.types';
import {fetchKankaContextForTranscription} from '../services/kanka.service';
import {getAiFeatureConfig} from '../utils/ai-settings';
import {TASK_WORKER_TIMEOUT_SECONDS} from '../services/task-queue.service';

const MAX_PREVIOUS_STORIES_CHARS = 100_000;

export interface StoryGenerationWorkerPayload extends WorkerPayload {
  campaignId: string;
  sessionId: string;
  /** Raw transcript; when omitted the worker reads `rawStory` from the session. */
  transcriptionText?: string;
  /** Pre-fetched Kanka context (e.g. from transcription function). Takes priority over enableKankaContext. */
  kankaContext?: KankaSearchResult;
  /** When true and no kankaContext provided, the worker fetches fresh context from Kanka API. */
  enableKankaContext?: boolean;
  userCorrections?: string;
}

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
    .collection('campaigns')
    .doc(campaignId)
    .collection('audioSessions')
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

/**
 * Story Generation Worker Handler: The actual processing logic
 */
export const storyGenerationWorkerHandler = async (data: WorkerPayload) => {
    const {
      campaignId,
      sessionId,
      transcriptionText,
      kankaContext: providedKankaContext,
      enableKankaContext,
      userCorrections,
    } = data as StoryGenerationWorkerPayload;

    if (!campaignId || !sessionId) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: campaignId, sessionId'
      );
    }

    const googleAiKey = process.env.GOOGLE_AI_API_KEY;
    if (!googleAiKey) {
      throw new HttpsError(
        'failed-precondition',
        'Google AI API key not configured'
      );
    }

    const db = getFirestore();
    const sessionRef = db
      .collection('campaigns')
      .doc(campaignId)
      .collection('audioSessions')
      .doc(sessionId);

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

      // Load session data for sessionDate
      const sessionSnap = await sessionRef.get();
      const sessionData = sessionSnap.data();

      const storyInput = transcriptionText || (sessionData?.rawStory as string | undefined);
      if (!storyInput) {
        throw new Error('No transcription found for this session');
      }

      // Resolve Kanka context:
      // 1. Use pre-fetched context from payload (e.g. from transcription function)
      // 2. If enableKankaContext is set (e.g. from frontend), fetch fresh context from Kanka API
      let kankaContext: KankaSearchResult | undefined = providedKankaContext;
      if (!kankaContext && enableKankaContext) {
        kankaContext = await fetchKankaContextForTranscription(
          campaignId,
          sessionId,
          true
        );
      }

      // Fetch previous stories if current session has a sessionDate
      let previousStories: PreviousStory[] | undefined;
      const currentSessionDate = sessionData?.sessionDate as string | undefined;
      if (currentSessionDate) {
        logger.debug(`[StoryGenerationWorker] Fetching previous stories for campaign ${campaignId}...`);
        previousStories = await fetchPreviousStories(campaignId, currentSessionDate);
        logger.debug(`[StoryGenerationWorker] Found ${previousStories.length} previous stories`);
      }

      // Update progress: Generating story (90%)
      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'generating-story',
        90,
        'Generating story from transcription...'
      );

      logger.debug(`[StoryGenerationWorker] Generating story for ${sessionId}...`);

      // Generate story
      const storyContent = await generateStoryFromTranscription(
        storyInput,
        storyConfig,
        kankaContext,
        userCorrections,
        previousStories
      );

      logger.debug(
        `[StoryGenerationWorker] Story generated: ${storyContent.length} characters`
      );

      // Save story to Firestore
      await sessionRef.update({
        content: storyContent,
        storyGeneratedAt: new Date().toISOString(),
        status: 'completed',
      });

      // Mark session as completed (100%)
      await ProgressTrackerService.markCompleted(campaignId, sessionId);

      logger.debug(
        `[StoryGenerationWorker] Completed processing for session ${sessionId}`
      );
    } catch (error) {
      logger.error(
        `[StoryGenerationWorker] Error for session ${sessionId}:`,
        error
      );
      await ProgressTrackerService.markFailed(
        campaignId,
        sessionId,
        'generating-story',
        error as Error
      );
      throw error;
    }
};

/**
 * Story Generation Worker: Cloud Function wrapper
 *
 * This is the final worker in the transcription chain.
 * Chain: submit → transcribe → generate story → completed
 */
export const storyGenerationWorker = WorkerQueueService.createWorker(
  'storyGenerationWorker',
  storyGenerationWorkerHandler
);

/**
 * Story generation as a task-queue step of the audio pipeline (process →
 * transcribe → story). Runs in its own live request with its own time budget.
 * Not retried by Cloud Tasks: failures are written to the session by the handler.
 */
export const storyGenerationTaskWorker = onTaskDispatched<StoryGenerationWorkerPayload>(
  {
    timeoutSeconds: TASK_WORKER_TIMEOUT_SECONDS,
    memory: '1GiB',
    secrets: ['GOOGLE_AI_API_KEY', 'KANKA_API_TOKEN'],
    retryConfig: { maxAttempts: 1 },
  },
  async (request) => {
    try {
      await storyGenerationWorkerHandler(request.data);
    } catch (error) {
      // Already recorded on the session (markFailed); don't let Cloud Tasks log a 500.
      logger.error(`[StoryGenerationTask] Failed for session ${request.data.sessionId}:`, error);
    }
  }
);
