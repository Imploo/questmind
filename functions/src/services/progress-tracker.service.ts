import * as logger from '../utils/logger';
import {firestore} from 'firebase-admin';
import {SessionProgress, SessionProgressStage} from '../types/audio-session.types';
import {sessionRef} from '../utils/session-ref';

/**
 * Service for tracking progress of audio session processing (Ticket #43)
 */
export class ProgressTrackerService {
  /**
   * Update progress for an audio session using new unified SessionProgress
   */
  static async updateProgress(
    campaignId: string,
    sessionId: string,
    stage: SessionProgressStage,
    progress: number,
    message: string,
    estimatedCompletionAt?: Date
  ): Promise<void> {
    const ref = sessionRef(firestore(), campaignId, sessionId);

    // Get existing progress to preserve startedAt if stage hasn't changed
    const sessionDoc = await ref.get();
    const existingProgress = sessionDoc.data()?.progress as SessionProgress | undefined;
    const stageChanged = !existingProgress || existingProgress.stage !== stage;

    const now = new Date();
    const progressData: SessionProgress = {
      stage,
      progress: Math.min(100, Math.max(0, progress)), // Clamp between 0-100
      message,
      startedAt: stageChanged ? now : (existingProgress?.startedAt || now),
      updatedAt: now,
    };

    if (estimatedCompletionAt) {
      progressData.estimatedCompletionAt = estimatedCompletionAt;
    }

    await ref.update({
      progress: progressData,
    });

    logger.debug(
      `[Progress] Session ${sessionId}: ${stage} (${progress}%) - ${message}`
    );
  }

  /**
   * Mark session as failed with error details. Only logs a warning: the caller
   * that caught the error reports it to Sentry (one event per failure).
   */
  static async markFailed(
    campaignId: string,
    sessionId: string,
    stage: SessionProgressStage,
    error: Error | string,
    details?: unknown
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorDetails = details || (error instanceof Error ? error.stack : undefined);

    const now = new Date();
    const progressData: SessionProgress = {
      stage: 'failed',
      progress: 0,
      message: `Failed: ${errorMessage}`,
      startedAt: now,
      error: errorMessage + (errorDetails ? `\n\nDetails: ${JSON.stringify(errorDetails, null, 2)}` : ''),
      updatedAt: now,
    };

    await sessionRef(firestore(), campaignId, sessionId).update({
      progress: progressData,
    });

    logger.warn(
      `[Progress] Session ${sessionId} FAILED at ${stage}:`,
      errorMessage
    );
  }

  /**
   * Mark session as completed
   */
  static async markCompleted(
    campaignId: string,
    sessionId: string,
    message = 'Processing complete'
  ): Promise<void> {
    await this.updateProgress(
      campaignId,
      sessionId,
      'completed',
      100,
      message
    );
  }
}
