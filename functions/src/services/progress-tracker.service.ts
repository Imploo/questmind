import {firestore} from 'firebase-admin';
import {Timestamp} from 'firebase-admin/firestore';

/**
 * Progress stage for audio processing
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
 * Failure information
 */
export interface ProgressFailure {
  stage: string;
  error: string;
  timestamp: Timestamp;
  details?: unknown;
}

/**
 * Audio session progress tracking
 */
export interface AudioSessionProgress {
  stage: ProgressStage;
  progress: number; // 0-100 percentage
  currentStep?: string; // Optional detailed step description
  failure?: ProgressFailure;
  updatedAt: Timestamp;
}

/**
 * Service for tracking progress of audio session processing
 */
export class ProgressTrackerService {
  /**
   * Update progress for an audio session
   */
  static async updateProgress(
    campaignId: string,
    sessionId: string,
    stage: ProgressStage,
    progress: number,
    currentStep?: string
  ): Promise<void> {
    const db = firestore();
    const sessionRef = db
      .collection('campaigns')
      .doc(campaignId)
      .collection('audioSessions')
      .doc(sessionId);

    const progressData: AudioSessionProgress = {
      stage,
      progress: Math.min(100, Math.max(0, progress)), // Clamp between 0-100
      updatedAt: Timestamp.now(),
    };

    if (currentStep) {
      progressData.currentStep = currentStep;
    }

    await sessionRef.update({
      progress: progressData,
    });

    console.log(
      `[Progress] Session ${sessionId}: ${stage} (${progress}%)${currentStep ? ` - ${currentStep}` : ''}`
    );
  }

  /**
   * Mark session as failed with error details
   */
  static async markFailed(
    campaignId: string,
    sessionId: string,
    stage: string,
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
    const errorStack = error instanceof Error ? error.stack : undefined;

    const progressData: AudioSessionProgress = {
      stage: 'failed',
      progress: 0,
      failure: {
        stage,
        error: errorMessage,
        timestamp: Timestamp.now(),
        details: details || errorStack,
      },
      updatedAt: Timestamp.now(),
    };

    await sessionRef.update({
      progress: progressData,
    });

    console.error(
      `[Progress] Session ${sessionId} FAILED at ${stage}:`,
      errorMessage,
      details
    );
  }

  /**
   * Mark session as completed
   */
  static async markCompleted(
    campaignId: string,
    sessionId: string
  ): Promise<void> {
    await this.updateProgress(
      campaignId,
      sessionId,
      'completed',
      100,
      'Processing complete'
    );
  }

  /**
   * Get current progress for a session
   */
  static async getProgress(
    campaignId: string,
    sessionId: string
  ): Promise<AudioSessionProgress | null> {
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
