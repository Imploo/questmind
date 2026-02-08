import { onRequest } from 'firebase-functions/v2/https';
import { storage } from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { SHARED_CORS } from './index';
import * as logger from './utils/logger';
import { wrapHttp } from './utils/sentry-error-handler';

interface FinalizeUploadBody {
  campaignId: string;
  sessionId: string;
  storagePath: string;
  transcriptionMode: 'fast' | 'batch';
  audioFileName: string;
  userCorrections?: string;
  /** When true, marks the upload as failed instead of finalizing it */
  failed?: boolean;
  /** Human-readable failure reason from the Background Fetch API */
  failureReason?: string;
  /** HTTP status from the failed upload response (if available) */
  failureStatus?: number | null;
  /** Response body excerpt from the failed upload (if available) */
  failureResponseText?: string | null;
}

/**
 * HTTP endpoint (not callable) for finalizing a background upload.
 *
 * Service workers cannot use Firebase callable functions (they can't pass
 * Firebase Auth tokens via the standard callable protocol), so this is
 * exposed as a plain HTTP function. Authentication is implicit: the service
 * worker only knows about this upload because the authenticated client
 * initiated it and passed the metadata.
 */
export const finalizeUpload = onRequest(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: SHARED_CORS,
  },
  wrapHttp('finalizeUpload', async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const body = req.body as FinalizeUploadBody;
    const {
      campaignId,
      sessionId,
      storagePath,
      transcriptionMode,
      audioFileName,
      userCorrections,
    } = body;

    // Handle failure reports from the service worker.
    // When a Background Fetch fails, the SW calls this endpoint with failed=true
    // so Firestore progress is updated even when the app is closed.
    if (body.failed) {
      if (!campaignId || !sessionId) {
        res.status(400).json({ error: 'Missing required fields: campaignId, sessionId' });
        return;
      }

      const errorDetail = [
        `Background upload failed`,
        body.failureReason ? `Reason: ${body.failureReason}` : null,
        body.failureStatus ? `HTTP ${body.failureStatus}` : null,
        body.failureResponseText ? `Response: ${body.failureResponseText}` : null,
      ].filter(Boolean).join('\n');

      logger.warn(
        `[finalizeUpload] Background upload failure reported for session ${sessionId}: ${errorDetail}`
      );

      await ProgressTrackerService.markFailed(
        campaignId,
        sessionId,
        'uploading',
        errorDetail
      );

      res.status(200).json({ success: true, recorded: 'failure' });
      return;
    }

    // Validate required fields for success finalization
    if (!campaignId || !sessionId || !storagePath || !transcriptionMode || !audioFileName) {
      res.status(400).json({
        error: 'Missing required fields: campaignId, sessionId, storagePath, transcriptionMode, audioFileName',
      });
      return;
    }

    try {
      // Verify file exists in Cloud Storage
      const bucket = storage().bucket();
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();

      if (!exists) {
        res.status(404).json({ error: `File not found at ${storagePath}` });
        return;
      }

      const storageUrl = `gs://${bucket.name}/${storagePath}`;

      // Update Firestore with storage URL and mark upload complete
      const db = getFirestore();
      const sessionRef = db
        .collection('campaigns')
        .doc(campaignId)
        .collection('audioSessions')
        .doc(sessionId);

      await sessionRef.update({
        storageUrl,
        updatedAt: new Date(),
      });

      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'uploading',
        100,
        'Upload complete, starting transcription...'
      );

      logger.info(
        `[finalizeUpload] Upload finalized for session ${sessionId}, triggering ${transcriptionMode} transcription`
      );

      // Trigger transcription by calling the appropriate Cloud Function internally
      const transcribeFunction =
        transcriptionMode === 'fast'
          ? 'transcribeAudioFast'
          : 'transcribeAudioBatch';

      const region = process.env.FUNCTION_REGION || 'europe-west1';
      const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
      const callableUrl = `https://${region}-${projectId}.cloudfunctions.net/${transcribeFunction}`;

      const transcriptionRequest = {
        data: {
          campaignId,
          sessionId,
          storageUrl,
          audioFileName,
          userCorrections,
        },
      };

      const transcriptionResponse = await fetch(callableUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transcriptionRequest),
      });

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        logger.warn(
          `[finalizeUpload] Transcription trigger returned ${transcriptionResponse.status}: ${errorText}`
        );
      }

      res.status(200).json({ success: true, storageUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[finalizeUpload] Error:', message);

      // Mark as failed in progress tracker
      await ProgressTrackerService.markFailed(
        campaignId,
        sessionId,
        'uploading',
        message
      ).catch((e) => console.error('[finalizeUpload] Failed to update progress:', e));

      res.status(500).json({ error: message });
    }
  })
);
