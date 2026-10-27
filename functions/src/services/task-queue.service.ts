import { getFunctions } from 'firebase-admin/functions';

/** Region all task-queue workers are deployed in. */
export const TASK_WORKER_REGION = 'europe-west1';

/**
 * Upper bound for one task run. 1800s is the maximum Cloud Tasks dispatch
 * deadline — each step of the audio pipeline gets its own budget of this size.
 */
export const TASK_WORKER_TIMEOUT_SECONDS = 1800;

/** Task-queue functions of the session audio pipeline: process → transcribe → story. */
export const TASK_WORKERS = {
  processAudio: 'processSessionAudioWorker',
  transcription: 'transcribeAudioFastWorker',
  story: 'storyGenerationTaskWorker',
} as const;

/**
 * Enqueue a payload on a task-queue function (`onTaskDispatched`). Payloads
 * must be JSON-serialisable (no undefined) and stay small (Cloud Tasks caps a
 * task at ~1 MB), so pass ids and let the worker read large data from Firestore.
 */
export async function enqueueWorkerTask(functionName: string, payload: Record<string, unknown>): Promise<void> {
  await getFunctions()
    .taskQueue(`locations/${TASK_WORKER_REGION}/functions/${functionName}`)
    .enqueue(payload, { dispatchDeadlineSeconds: TASK_WORKER_TIMEOUT_SECONDS });
}
