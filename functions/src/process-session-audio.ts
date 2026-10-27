import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import * as logger from './utils/logger';
import { wrapCallable } from './utils/sentry-error-handler';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { TASK_WORKERS, TASK_WORKER_TIMEOUT_SECONDS, enqueueWorkerTask } from './services/task-queue.service';
import { AudioRecording, sessionAudioPrefix } from './audio/stored-audio.service';
import { ProcessingStep, processSourcesToRecording } from './audio/audio-processing.service';
import { deleteStorageFiles } from './utils/storage-cleanup';
import { enqueueTranscription } from './transcribe-audio-fast';

/** An uploaded source file of a session (original M4A/MP3, or a browser-compressed WAV). */
export interface AudioSource {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ProcessSessionAudioRequest {
  campaignId: string;
  sessionId: string;
  userCorrections?: string;
}

interface ProcessAudioTaskPayload {
  campaignId: string;
  sessionId: string;
  userCorrections: string | null;
}

/** Folder the frontend uploads a session's source files to. */
export function sessionSourcePrefix(campaignId: string, sessionId: string): string {
  return `${sessionAudioPrefix(campaignId, sessionId)}source/`;
}

/**
 * Start processing a session's uploaded source files (`audioSources` on the
 * session): join, downmix, normalize and encode them into the stored recording,
 * then transcribe it. Returns immediately; the frontend follows progress in Firestore.
 */
export const processSessionAudio = onCall(
  { memory: '256MiB' },
  wrapCallable<ProcessSessionAudioRequest, { success: boolean; message: string }>(
    'processSessionAudio',
    async (request) => {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { campaignId, sessionId, userCorrections } = request.data;
      if (!campaignId || !sessionId) {
        throw new HttpsError('invalid-argument', 'Missing required fields: campaignId, sessionId');
      }

      const sessionSnap = await sessionDoc(campaignId, sessionId).get();
      if (!sessionSnap.exists) {
        throw new HttpsError('not-found', `Audio session ${sessionId} not found`);
      }
      // Validated here so the worker never touches files outside this session.
      loadSources(campaignId, sessionId, sessionSnap.get('audioSources'));

      await ProgressTrackerService.updateProgress(
        campaignId, sessionId, 'processing-audio', 50, 'Queued for audio processing...'
      );

      const payload: ProcessAudioTaskPayload = {
        campaignId,
        sessionId,
        userCorrections: userCorrections ?? null,
      };
      await enqueueWorkerTask(TASK_WORKERS.processAudio, { ...payload });

      return { success: true, message: 'Audio processing started' };
    }
  )
);

/**
 * Task worker: download the sources, process them with ffmpeg into one
 * normalized 64 kbps mono MP3, store it as the session recording, remove the
 * sources and hand over to the transcription task. On failure the sources are
 * kept, so the session can be retried without uploading again.
 */
export const processSessionAudioWorker = onTaskDispatched<ProcessAudioTaskPayload>(
  {
    timeoutSeconds: TASK_WORKER_TIMEOUT_SECONDS,
    // Sources + output live in /tmp, which is in-memory on Cloud Run (a 3h
    // dual-channel WAV that couldn't be compressed in the browser is ~3 GB).
    memory: '8GiB',
    cpu: 2,
    retryConfig: { maxAttempts: 1 },
  },
  async (request) => {
    const { campaignId, sessionId, userCorrections } = request.data;

    try {
      const sessionRef = sessionDoc(campaignId, sessionId);
      const sessionSnap = await sessionRef.get();
      const sources = loadSources(campaignId, sessionId, sessionSnap.get('audioSources'));

      const fileName = `${sources[0].fileName.replace(/\.[^/.]+$/, '')}.mp3`;
      const storagePath = `${sessionAudioPrefix(campaignId, sessionId)}${fileName}`;
      const { sizeBytes, durationSec } = await processSourcesToRecording(
        sources.map((s) => s.storagePath),
        storagePath,
        (step) => ProgressTrackerService.updateProgress(
          campaignId, sessionId, 'processing-audio', STEP_PROGRESS[step].progress, STEP_PROGRESS[step].message
        )
      );

      const recording: AudioRecording = {
        storagePath,
        fileName,
        mimeType: 'audio/mpeg',
        sizeBytes,
        durationSec: Math.round(durationSec),
        uploadedAt: new Date().toISOString(),
      };
      await sessionRef.update({
        audioRecording: recording,
        audioCompressedSizeBytes: sizeBytes,
        audioOriginalSizeBytes: sources.reduce((sum, s) => sum + s.sizeBytes, 0),
        audioSources: FieldValue.delete(),
      });

      // The recording is stored — the sources are no longer needed.
      await deleteStorageFiles(sources.map((s) => s.storagePath));

      await enqueueTranscription({
        campaignId,
        sessionId,
        segments: [],
        recording,
        audioFileName: fileName,
        userCorrections,
      });
    } catch (error) {
      logger.error(`[Process Audio] Failed for session ${sessionId}:`, error);
      await ProgressTrackerService.markFailed(
        campaignId,
        sessionId,
        'processing-audio',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
);

const STEP_PROGRESS: Record<ProcessingStep, { progress: number; message: string }> = {
  downloading: { progress: 52, message: 'Downloading uploaded audio...' },
  processing: { progress: 58, message: 'Compressing and normalizing audio...' },
  storing: { progress: 66, message: 'Storing processed recording...' },
};

function sessionDoc(campaignId: string, sessionId: string) {
  return getFirestore()
    .collection('campaigns').doc(campaignId)
    .collection('audioSessions').doc(sessionId);
}

/** Read and validate the session's source list (all files must be in its source folder). */
export function loadSources(campaignId: string, sessionId: string, raw: unknown): AudioSource[] {
  const prefix = sessionSourcePrefix(campaignId, sessionId);
  const sources = Array.isArray(raw) ? (raw as AudioSource[]) : [];
  if (sources.length === 0) {
    throw new HttpsError('failed-precondition', 'No uploaded audio found for this session');
  }
  if (sources.some((s) => typeof s?.storagePath !== 'string' || !s.storagePath.startsWith(prefix))) {
    throw new HttpsError('invalid-argument', 'Audio source does not belong to this session');
  }
  return sources;
}
