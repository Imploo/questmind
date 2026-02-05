import {HttpsError} from 'firebase-functions/v2/https';
import {ProgressTrackerService} from '../services/progress-tracker.service';
import {WorkerQueueService, WorkerPayload} from '../services/worker-queue.service';
import {AudioChunkingService} from '../audio/chunking.service';

export interface ChunkingWorkerPayload extends WorkerPayload {
  campaignId: string;
  sessionId: string;
  tempFilePath: string;
  audioFileName: string;
}

/**
 * Chunking Worker Handler: The actual processing logic
 */
export const chunkingWorkerHandler = async (data: WorkerPayload) => {
    const {campaignId, sessionId, tempFilePath, audioFileName} =
      data as ChunkingWorkerPayload;

    if (!campaignId || !sessionId || !tempFilePath) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: campaignId, sessionId, tempFilePath'
      );
    }

    try {
      // Update progress: Chunking (30%)
      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'chunking',
        30,
        'Analyzing audio duration...'
      );

      // Get audio duration
      const durationSeconds = await AudioChunkingService.getAudioDuration(tempFilePath);
      console.log(
        `[ChunkingWorker] Audio duration: ${durationSeconds}s (${(durationSeconds / 60).toFixed(1)} minutes)`
      );

      // Update progress: Starting chunking (35%)
      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'chunking',
        35,
        `Splitting ${(durationSeconds / 60).toFixed(1)}-minute audio into chunks...`
      );

      // Split audio into 30-minute chunks
      const chunks = await AudioChunkingService.splitAudioIntoChunks(
        tempFilePath,
        durationSeconds
      );

      console.log(`[ChunkingWorker] Created ${chunks.length} chunk(s)`);

      // Update progress: Chunking complete (40%)
      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'chunking',
        40,
        `Split into ${chunks.length} chunk(s), starting transcription...`
      );

      // Clean up the original downloaded file (no longer needed)
      AudioChunkingService.cleanupTempFile(tempFilePath);

      // Trigger next worker: Transcription
      // Import dynamically to avoid circular dependency
      const {transcriptionWorkerHandler} = await import('./transcription-worker');
      await WorkerQueueService.triggerWorker(transcriptionWorkerHandler, {
        campaignId,
        sessionId,
        chunks: chunks.map((chunk) => ({
          index: chunk.index,
          startTimeSeconds: chunk.startTimeSeconds,
          endTimeSeconds: chunk.endTimeSeconds,
          durationSeconds: chunk.durationSeconds,
          audioPath: chunk.audioPath,
        })),
        totalDurationSeconds: durationSeconds,
        audioFileName,
      });

      console.log(
        `[ChunkingWorker] Triggered transcription worker for ${sessionId}`
      );
    } catch (error) {
      console.error(`[ChunkingWorker] Error for session ${sessionId}:`, error);

      // Clean up temp file on error
      try {
        AudioChunkingService.cleanupTempFile(tempFilePath);
      } catch (cleanupError) {
        console.error('[ChunkingWorker] Cleanup error:', cleanupError);
      }

      await ProgressTrackerService.markFailed(
        campaignId,
        sessionId,
        'chunking',
        error as Error
      );
      throw error;
    }
};

/**
 * Chunking Worker: Cloud Function wrapper
 *
 * Chain: download → chunk → transcribe → generate story
 */
export const chunkingWorker = WorkerQueueService.createWorker(
  'chunkingWorker',
  chunkingWorkerHandler
);
