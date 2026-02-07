import * as logger from './utils/logger';
import {GoogleGenAI} from '@google/genai';
import {onRequest} from 'firebase-functions/v2/https';
import {firestore} from 'firebase-admin';
import {FieldValue} from 'firebase-admin/firestore';
import {
  extractInlineResponseText,
  markBatchFailed,
  normalizeBatchState,
  processBatchTranscriptionResult,
} from './services/transcription-batch.service';
import {ProgressTrackerService} from './services/progress-tracker.service';

const ACTIVE_BATCH_STATUSES = ['submitted', 'running'] as const;

export const pollBatchJobs = onRequest(
  {
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: ['GOOGLE_AI_API_KEY'],
  },
  async (_req, res) => {
    const googleAiKey = process.env.GOOGLE_AI_API_KEY;
    if (!googleAiKey) {
      console.error('GOOGLE_AI_API_KEY not configured for batch polling');
      res.status(500).send('API key not configured');
      return;
    }

    const db = firestore();
    const snapshot = await db
      .collectionGroup('audioSessions')
      .where('transcriptionBatch.status', 'in', ACTIVE_BATCH_STATUSES)
      .get();

    if (snapshot.empty) {
      res.status(200).send('No active batch jobs to poll');
      return;
    }

    const ai = new GoogleGenAI({apiKey: googleAiKey});

    for (const doc of snapshot.docs) {
      const data = doc.data() as {
        transcriptionBatch?: {batchJobName?: string; status?: string};
      };
      const batchJobName = data.transcriptionBatch?.batchJobName;
      if (!batchJobName) {
        continue;
      }

      const campaignId = doc.ref.parent.parent?.id;
      if (!campaignId) {
        logger.warn(
          `Could not resolve campaignId for session ${doc.ref.id}`
        );
        continue;
      }

      try {
        const batchJob = await ai.batches.get({name: batchJobName});
        console.dir(batchJob, { depth: 9});
        const state = normalizeBatchState(
          typeof batchJob === 'object' && batchJob !== null
            ? (batchJob as {state?: unknown}).state
            : undefined
        );

        if (state === 'JOB_STATE_PENDING') {
          await doc.ref.update({
            'transcriptionBatch.lastCheckedAt': FieldValue.serverTimestamp(),
          });
          continue;
        }

        if (state === 'JOB_STATE_RUNNING') {
          await doc.ref.update({
            'transcriptionBatch.status': 'running',
            'transcriptionBatch.lastCheckedAt': FieldValue.serverTimestamp(),
          });
          await ProgressTrackerService.updateProgress(
            campaignId,
            doc.id,
            'transcribing',
            60,
            'Transcribing audio with Gemini...'
          );
          continue;
        }

        if (state === 'JOB_STATE_SUCCEEDED') {
          // Log the batch job structure for debugging
          logger.debug('[DEBUG] Batch job structure:', JSON.stringify(batchJob, null, 2));

          const responseText = extractInlineResponseText(batchJob);
          if (!responseText) {
            console.error('[DEBUG] Failed to extract response. Keys in batchJob:', Object.keys(batchJob as object));
            await markBatchFailed(
              campaignId,
              doc.id,
              'Batch job completed without a response'
            );
            continue;
          }

          await processBatchTranscriptionResult(
            campaignId,
            doc.id,
            responseText
          );
          continue;
        }

        if (
          state === 'JOB_STATE_FAILED' ||
          state === 'JOB_STATE_CANCELLED' ||
          state === 'JOB_STATE_EXPIRED'
        ) {
          await markBatchFailed(
            campaignId,
            doc.id,
            `Batch job ${state.replace('JOB_STATE_', '').toLowerCase()}`
          );
          continue;
        }

        await doc.ref.update({
          'transcriptionBatch.lastCheckedAt': FieldValue.serverTimestamp(),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Batch polling failed';
        console.error(
          `Error polling batch job ${batchJobName} for session ${doc.id}:`,
          message
        );
      }
    }

    res.status(200).send(`Polled ${snapshot.docs.length} active batch jobs`);
  }
);
