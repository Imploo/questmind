import {HttpsError} from 'firebase-functions/v2/https';
import {getFirestore} from 'firebase-admin/firestore';
import {ProgressTrackerService} from '../services/progress-tracker.service';
import {WorkerQueueService, WorkerPayload} from '../services/worker-queue.service';
import {generateStoryFromTranscription} from '../story/story-generator.service';
import {
  AISettings,
  KankaSearchResult,
} from '../types/audio-session.types';

export interface StoryGenerationWorkerPayload extends WorkerPayload {
  campaignId: string;
  sessionId: string;
  transcriptionText: string;
  enableKankaContext?: boolean;
  userCorrections?: string;
}

/**
 * Story Generation Worker Handler: The actual processing logic
 */
export const storyGenerationWorkerHandler = async (data: WorkerPayload) => {
    const {
      campaignId,
      sessionId,
      transcriptionText,
      enableKankaContext,
      userCorrections,
    } = data as StoryGenerationWorkerPayload;

    if (!campaignId || !sessionId || !transcriptionText) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: campaignId, sessionId, transcriptionText'
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
      // Update progress: Starting story generation (80%)
      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'generating-story',
        80,
        'Loading AI settings for story generation...'
      );

      // Load AI settings
      const settingsSnap = await db.doc('settings/ai').get();
      const aiSettings = settingsSnap.data() as AISettings | undefined;

      if (!aiSettings) {
        throw new Error('AI settings not configured in database');
      }

      const storyConfig = aiSettings.features?.storyGeneration || {
        model: aiSettings.defaultModel,
        temperature: 0.8,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 32000,
      };

      // Load Kanka context if enabled
      let kankaContext: KankaSearchResult | undefined;
      if (enableKankaContext) {
        const sessionSnap = await sessionRef.get();
        const sessionData = sessionSnap.data();
        kankaContext = sessionData?.kankaSearchResult as
          | KankaSearchResult
          | undefined;
      }

      // Update progress: Generating story (85%)
      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'generating-story',
        85,
        'Generating story from transcription...'
      );

      console.log(`[StoryGenerationWorker] Generating story for ${sessionId}...`);

      // Generate story
      const storyContent = await generateStoryFromTranscription(
        transcriptionText,
        storyConfig,
        kankaContext,
        userCorrections
      );

      console.log(
        `[StoryGenerationWorker] Story generated: ${storyContent.length} characters`
      );

      // Save story to Firestore
      await sessionRef.update({
        storyContent,
        storyGeneratedAt: new Date().toISOString(),
        status: 'completed',
      });

      // Mark session as completed (100%)
      await ProgressTrackerService.markCompleted(campaignId, sessionId);

      console.log(
        `[StoryGenerationWorker] Completed processing for session ${sessionId}`
      );
    } catch (error) {
      console.error(
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
