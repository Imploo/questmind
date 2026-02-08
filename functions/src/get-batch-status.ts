import {GoogleGenAI} from '@google/genai';
import {onRequest} from 'firebase-functions/v2/https';
import {firestore} from 'firebase-admin';
import {normalizeBatchState} from './services/transcription-batch.service';
import {wrapHttp} from './utils/sentry-error-handler';

interface GetBatchStatusRequest {
  campaignId: string;
  sessionId: string;
}

export const getBatchStatus = onRequest(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: ['GOOGLE_AI_API_KEY'],
  },
  wrapHttp('getBatchStatus', async (req, res) => {
    const googleAiKey = process.env.GOOGLE_AI_API_KEY;
    if (!googleAiKey) {
      console.error('GOOGLE_AI_API_KEY not configured');
      res.status(500).json({error: 'API key not configured'});
      return;
    }

    const {campaignId, sessionId} = req.body.data as GetBatchStatusRequest;

    if (!campaignId || !sessionId) {
      res.status(400).json({
        error: 'Missing required parameters: campaignId and sessionId',
      });
      return;
    }

    try {
      const db = firestore();
      const sessionRef = db
        .collection('campaigns')
        .doc(campaignId)
        .collection('audioSessions')
        .doc(sessionId);

      const sessionSnap = await sessionRef.get();

      if (!sessionSnap.exists) {
        res.status(404).json({
          error: `Session not found: campaigns/${campaignId}/audioSessions/${sessionId}`,
        });
        return;
      }

      const sessionData = sessionSnap.data();
      const batchJobName = sessionData?.transcriptionBatch?.batchJobName;

      if (!batchJobName) {
        res.status(404).json({
          error: 'No batch job found for this session',
          sessionData: sessionData?.transcriptionBatch,
        });
        return;
      }

      // Query Gemini Batch API
      const ai = new GoogleGenAI({apiKey: googleAiKey});
      const batchJob = await ai.batches.get({name: batchJobName});

      const state = normalizeBatchState(
        typeof batchJob === 'object' && batchJob !== null
          ? (batchJob as {state?: unknown}).state
          : undefined
      );

      res.status(200).json({
        campaignId,
        sessionId,
        batchJobName,
        state,
        batchJob,
        firestoreMetadata: sessionData?.transcriptionBatch,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to get batch status';
      console.error(`Error getting batch status:`, error);
      res.status(500).json({
        error: message,
        campaignId,
        sessionId,
      });
    }
  })
);
