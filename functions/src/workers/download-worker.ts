import {getFirestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {ProgressTrackerService} from '../services/progress-tracker.service';
import {WorkerQueueService, WorkerPayload} from '../services/worker-queue.service';
import {AudioChunkingService} from '../audio/chunking.service';

export interface DownloadWorkerPayload extends WorkerPayload {
  sessionId: string;
  storageUrl: string;
  audioFileName: string;
}

/**
 * Download Worker: Downloads audio files from Firebase Storage to /tmp
 *
 * This is the first worker in the transcription chain.
 * Chain: download → chunk → transcribe → generate story
 */
export const downloadWorker = WorkerQueueService.createWorker(
  'downloadWorker',
  async (data: WorkerPayload) => {
    const {sessionId, storageUrl, audioFileName} = data as DownloadWorkerPayload;

    if (!sessionId || !storageUrl || !audioFileName) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: sessionId, storageUrl, audioFileName'
      );
    }

    // Extract campaignId from storageUrl
    // Format: gs://bucket/campaigns/{campaignId}/audio/{sessionId}/{filename}
    const campaignIdMatch = storageUrl.match(/\/campaigns\/([^/]+)\//);
    if (!campaignIdMatch) {
      throw new HttpsError(
        'invalid-argument',
        'Could not extract campaignId from storageUrl'
      );
    }
    const campaignId = campaignIdMatch[1];

    console.log(`[DownloadWorker] Started for session ${sessionId}`);

    try {
      // Update progress: Downloading (20%)
      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'downloading',
        20,
        'Downloading audio file...'
      );

      // Download audio file to /tmp using the existing service
      const tempFilePath = await AudioChunkingService.downloadAudioToTemp(
        storageUrl,
        audioFileName
      );

      console.log(
        `[DownloadWorker] Downloaded ${audioFileName} to ${tempFilePath}`
      );

      // Update progress: Download complete (30%)
      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'downloading',
        30,
        'Download complete, preparing for chunking...'
      );

      // Trigger next worker: Chunking
      // Import dynamically to avoid circular dependency
      const {chunkingWorkerHandler} = await import('./chunking-worker');
      await WorkerQueueService.triggerWorker(chunkingWorkerHandler, {
        campaignId,
        sessionId,
        tempFilePath,
        audioFileName,
      });

      console.log(`[DownloadWorker] Triggered chunking worker for ${sessionId}`);
    } catch (error) {
      console.error(`[DownloadWorker] Error for session ${sessionId}:`, error);
      await ProgressTrackerService.markFailed(
        campaignId,
        sessionId,
        'downloading',
        error as Error
      );
      throw error;
    }
  }
);

/**
 * Helper function to initiate the download worker from frontend or other triggers
 */
export async function initiateDownload(
  sessionId: string
): Promise<{success: boolean}> {
  const db = getFirestore();
  const sessionRef = db.collection('audio-sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const sessionData = sessionSnap.data();
  if (!sessionData) {
    throw new HttpsError('not-found', 'Session data not found');
  }

  const storageUrl =
    sessionData.storageUrl || sessionData.storageMetadata?.downloadUrl;
  const audioFileName = sessionData.audioFileName || 'audio.wav';

  if (!storageUrl) {
    throw new HttpsError(
      'failed-precondition',
      'No audio file found for this session'
    );
  }

  // Trigger the download worker by calling its handler directly
  const handler = WorkerQueueService.getHandler(downloadWorker);
  await WorkerQueueService.triggerWorker(handler, {
    sessionId,
    storageUrl,
    audioFileName,
  });

  return {success: true};
}
