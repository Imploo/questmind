import { onRequest } from 'firebase-functions/v2/https';
import { storage } from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { SHARED_CORS } from './index';
import * as logger from './utils/logger';

interface FinalizeUploadBody {
  campaignId: string;
  sessionId: string;
  storagePath: string;
  transcriptionMode: 'fast' | 'batch';
  audioFileName: string;
  userCorrections?: string;
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
  async (req, res) => {
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

    // Validate required fields
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
  }
);
