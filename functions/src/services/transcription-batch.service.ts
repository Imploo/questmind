import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {ProgressTrackerService} from './progress-tracker.service';
import {WorkerQueueService} from './worker-queue.service';
import {TranscriptionSegment} from '../types/audio-session.types';

export type BatchJobState =
  | 'JOB_STATE_PENDING'
  | 'JOB_STATE_RUNNING'
  | 'JOB_STATE_SUCCEEDED'
  | 'JOB_STATE_FAILED'
  | 'JOB_STATE_CANCELLED'
  | 'JOB_STATE_EXPIRED'
  | 'UNKNOWN';

export interface BatchTranscriptionMetadata {
  batchJobName: string;
  modelUsed: string;
  generationConfig: {
    temperature: number;
    topK: number;
    topP: number;
    maxOutputTokens: number;
  };
  storageUrl: string;
  audioFileName: string;
  mimeType: string;
  enableKankaContext: boolean;
  userCorrections?: string;
  inputGcsUri?: string;
  filesApiName?: string;
  submittedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  status: 'submitted' | 'running' | 'completed' | 'failed';
  lastCheckedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  error?: string;
}

interface TranscriptionResponsePayload {
  segments?: TranscriptionSegment[];
  error?: string;
  message?: string;
}

export function normalizeBatchState(rawState: unknown): BatchJobState {
  if (typeof rawState === 'string') {
    if (rawState.startsWith('JOB_STATE_')) {
      return rawState as BatchJobState;
    }
    if (rawState === 'PENDING') {
      return 'JOB_STATE_PENDING';
    }
    if (rawState === 'RUNNING') {
      return 'JOB_STATE_RUNNING';
    }
    if (rawState === 'SUCCEEDED') {
      return 'JOB_STATE_SUCCEEDED';
    }
    if (rawState === 'FAILED') {
      return 'JOB_STATE_FAILED';
    }
    if (rawState === 'CANCELLED') {
      return 'JOB_STATE_CANCELLED';
    }
    if (rawState === 'EXPIRED') {
      return 'JOB_STATE_EXPIRED';
    }
  }

  if (typeof rawState === 'object' && rawState !== null) {
    const maybeState = (rawState as {name?: unknown}).name;
    return normalizeBatchState(maybeState);
  }

  return 'UNKNOWN';
}

export function extractInlineResponseText(batchJob: unknown): string | null {
  if (typeof batchJob !== 'object' || batchJob === null) {
    return null;
  }

  const job = batchJob as {
    dest?: {inlinedResponses?: unknown[]};
    response?: {
      inlinedResponses?: unknown[] | {inlinedResponses?: unknown[]};
    };
  };

  // Try multiple possible response locations
  let responses: unknown[] | undefined;

  // Check dest.inlinedResponses (older format)
  if (Array.isArray(job.dest?.inlinedResponses)) {
    responses = job.dest.inlinedResponses;
  }
  // Check response.inlinedResponses.inlinedResponses (nested format)
  else if (
    job.response &&
    typeof job.response.inlinedResponses === 'object' &&
    job.response.inlinedResponses !== null &&
    'inlinedResponses' in job.response.inlinedResponses &&
    Array.isArray(
      (
        job.response.inlinedResponses as {
          inlinedResponses?: unknown[];
        }
      ).inlinedResponses
    )
  ) {
    responses = (
      job.response.inlinedResponses as {
        inlinedResponses: unknown[];
      }
    ).inlinedResponses;
  }
  // Check response.inlinedResponses (direct array)
  else if (Array.isArray(job.response?.inlinedResponses)) {
    responses = job.response.inlinedResponses;
  }

  if (!responses || responses.length === 0) {
    return null;
  }

  return extractTextFromInlineResponse(responses[0]);
}

export async function processBatchTranscriptionResult(
  campaignId: string,
  sessionId: string,
  resultText: string
): Promise<void> {
  const db = getFirestore();
  const sessionRef = db
    .collection('campaigns')
    .doc(campaignId)
    .collection('audioSessions')
    .doc(sessionId);

  const sessionSnap = await sessionRef.get();
  const sessionData = sessionSnap.data();

  const transcriptionPayload = parseTranscriptionPayload(resultText);

  if (transcriptionPayload.error) {
    await ProgressTrackerService.markFailed(
      campaignId,
      sessionId,
      'transcribing',
      transcriptionPayload.message || transcriptionPayload.error
    );
    await sessionRef.update({
      'transcriptionBatch.status': 'failed',
      'transcriptionBatch.error': transcriptionPayload.error,
      'transcriptionBatch.lastCheckedAt': FieldValue.serverTimestamp(),
    });
    return;
  }

  if (!transcriptionPayload.segments?.length) {
    await ProgressTrackerService.markFailed(
      campaignId,
      sessionId,
      'transcribing',
      'No transcription segments returned'
    );
    await sessionRef.update({
      'transcriptionBatch.status': 'failed',
      'transcriptionBatch.error': 'NO_SEGMENTS',
      'transcriptionBatch.lastCheckedAt': FieldValue.serverTimestamp(),
    });
    return;
  }

  const timestamps = transcriptionPayload.segments.map(segment => ({
    time: Math.max(0, Math.round(segment.timeSeconds)),
    text: segment.speaker
      ? `${segment.speaker}: ${segment.text}`
      : segment.text,
  }));

  const transcriptionText = timestamps
    .map(entry => `[${formatTimestamp(entry.time)}] ${entry.text}`)
    .join('\n\n');

  await sessionRef.update({
    transcriptionText,
    timestamps,
    transcriptionSegments: transcriptionPayload.segments,
    transcriptionCompletedAt: FieldValue.serverTimestamp(),
    'transcriptionBatch.status': 'completed',
    'transcriptionBatch.lastCheckedAt': FieldValue.serverTimestamp(),
  });

  await ProgressTrackerService.updateProgress(
    campaignId,
    sessionId,
    'transcribing',
    80,
    'Transcription complete, preparing story generation...'
  );

  const enableKankaContext = Boolean(
    sessionData?.transcriptionBatch?.enableKankaContext
  );
  const userCorrections =
    sessionData?.transcriptionBatch?.userCorrections ??
    sessionData?.userCorrections;

  const {storyGenerationWorkerHandler} = await import(
    '../workers/story-generation-worker'
  );
  await WorkerQueueService.triggerWorker(storyGenerationWorkerHandler, {
    campaignId,
    sessionId,
    transcriptionText,
    enableKankaContext,
    userCorrections,
  });
}

export async function markBatchFailed(
  campaignId: string,
  sessionId: string,
  errorMessage: string
): Promise<void> {
  await ProgressTrackerService.markFailed(
    campaignId,
    sessionId,
    'transcribing',
    errorMessage
  );

  const db = getFirestore();
  const sessionRef = db
    .collection('campaigns')
    .doc(campaignId)
    .collection('audioSessions')
    .doc(sessionId);

  await sessionRef.update({
    'transcriptionBatch.status': 'failed',
    'transcriptionBatch.error': errorMessage,
    'transcriptionBatch.lastCheckedAt': FieldValue.serverTimestamp(),
  });
}

function parseTranscriptionPayload(rawText: string): TranscriptionResponsePayload {
  try {
    const parsed = JSON.parse(rawText) as TranscriptionResponsePayload;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    return {
      error: 'INVALID_JSON',
      message: 'Transcription response was not valid JSON',
    };
  }

  return {
    error: 'INVALID_RESPONSE',
    message: 'Transcription response could not be parsed',
  };
}

function extractTextFromInlineResponse(inlineResponse: unknown): string | null {
  if (typeof inlineResponse !== 'object' || inlineResponse === null) {
    return null;
  }

  const responseWrapper = inlineResponse as {
    response?: {
      text?: string;
      candidates?: Array<{
        content?: {parts?: Array<{text?: string}>};
      }>;
    };
    error?: {code?: number; message?: string};
  };

  // Check for error in response
  if (responseWrapper.error) {
    console.error(
      '[Batch] Response contains error:',
      `Code ${responseWrapper.error.code}: ${responseWrapper.error.message}`
    );
    return null;
  }

  if (responseWrapper.response?.text) {
    return responseWrapper.response.text;
  }

  const parts = responseWrapper.response?.candidates?.[0]?.content?.parts;
  if (parts && parts.length > 0) {
    const textParts = parts
      .map(part => part.text)
      .filter((part): part is string => typeof part === 'string');
    if (textParts.length > 0) {
      return textParts.join('');
    }
  }

  return null;
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
