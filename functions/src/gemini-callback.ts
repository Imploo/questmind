import {onRequest} from 'firebase-functions/v2/https';
import {markBatchFailed, processBatchTranscriptionResult} from './services/transcription-batch.service';

interface GeminiCallbackPayload {
  status?: 'completed' | 'failed';
  result?: string;
  error?: string;
  metadata?: {
    campaignId?: string;
    sessionId?: string;
  };
}

export const geminiCallback = onRequest(
  {
    region: 'europe-west4',
    timeoutSeconds: 120,
    secrets: ['GEMINI_CALLBACK_SECRET'],
  },
  async (req, res) => {
    const callbackSecret = process.env.GEMINI_CALLBACK_SECRET;
    if (callbackSecret) {
      const authHeader = req.headers['x-gemini-callback-secret'];
      if (authHeader !== callbackSecret) {
        res.status(401).send({error: 'Unauthorized'});
        return;
      }
    }

    const payload = req.body as GeminiCallbackPayload;
    const campaignId = payload.metadata?.campaignId;
    const sessionId = payload.metadata?.sessionId;

    if (!campaignId || !sessionId) {
      res.status(400).send({error: 'Missing session metadata'});
      return;
    }

    try {
      if (payload.status === 'completed' && payload.result) {
        await processBatchTranscriptionResult(
          campaignId,
          sessionId,
          payload.result
        );
        res.status(200).send({success: true});
        return;
      }

      if (payload.status === 'failed') {
        await markBatchFailed(
          campaignId,
          sessionId,
          payload.error || 'Batch job failed'
        );
        res.status(200).send({success: false});
        return;
      }

      res.status(400).send({error: 'Unsupported callback payload'});
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Callback processing failed';
      await markBatchFailed(campaignId, sessionId, message);
      res.status(500).send({error: message});
    }
  }
);
