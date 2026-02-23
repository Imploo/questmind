import * as logger from '../utils/logger';
import {firestore} from 'firebase-admin';
import {Timestamp} from 'firebase-admin/firestore';
import {SessionProgress, SessionProgressStage} from '../types/audio-session.types';

/**
 * @deprecated Use SessionProgress from audio-session.types instead
 */
export type ProgressStage =
  | 'uploading'
  | 'submitted'
  | 'downloading'
  | 'chunking'
  | 'transcribing'
  | 'generating-story'
  | 'completed'
  | 'failed';

/**
 * @deprecated Use SessionProgress from audio-session.types instead
 */
export interface ProgressFailure {
  stage: string;
  error: string;
  timestamp: Timestamp;
  details?: unknown;
}

/**
 * @deprecated Use SessionProgress from audio-session.types instead
 */
export interface AudioSessionProgress {
  stage: ProgressStage;
  progress: number; // 0-100 percentage
  currentStep?: string; // Optional detailed step description
  failure?: ProgressFailure;
  updatedAt: Timestamp;
}

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
    const db = firestore();
    const sessionRef = db
      .collection('campaigns')
      .doc(campaignId)
      .collection('audioSessions')
      .doc(sessionId);

    // Get existing progress to preserve startedAt if stage hasn't changed
    const sessionDoc = await sessionRef.get();
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

    await sessionRef.update({
      progress: progressData,
    });

    logger.debug(
      `[Progress] Session ${sessionId}: ${stage} (${progress}%) - ${message}`
    );
  }

  /**
   * Mark session as failed with error details
   */
  static async markFailed(
    campaignId: string,
    sessionId: string,
    stage: SessionProgressStage,
    error: Error | string,
    details?: unknown
  ): Promise<void> {
    const db = firestore();
    const sessionRef = db
      .collection('campaigns')
      .doc(campaignId)
      .collection('audioSessions')
      .doc(sessionId);

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

    await sessionRef.update({
      progress: progressData,
    });

    logger.error(
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

  /**
   * Clear progress (set to idle)
   */
  static async clearProgress(
    campaignId: string,
    sessionId: string
  ): Promise<void> {
    const db = firestore();
    const sessionRef = db
      .collection('campaigns')
      .doc(campaignId)
      .collection('audioSessions')
      .doc(sessionId);

    await sessionRef.update({
      progress: firestore.FieldValue.delete(),
    });

    logger.debug(`[Progress] Session ${sessionId}: Progress cleared`);
  }

  /**
   * Get current progress for a session
   */
  static async getProgress(
    campaignId: string,
    sessionId: string
  ): Promise<SessionProgress | null> {
    const db = firestore();
    const sessionRef = db
      .collection('campaigns')
      .doc(campaignId)
      .collection('audioSessions')
      .doc(sessionId);
    const doc = await sessionRef.get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    return data?.progress || null;
  }
}
