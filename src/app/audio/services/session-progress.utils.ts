import { toDate } from '../../shared/utils/date.utils';
import { AudioSessionRecord, SessionProgress, SessionProgressStage } from './audio-session.models';

/**
 * An active pipeline stage without a progress update for this long is shown as
 * failed, so the user can retry. The backend task workers (process → transcribe
 * → story) may run up to 30 minutes (`TASK_WORKER_TIMEOUT_SECONDS` = 1800) and a
 * single long Gemini call can go that long without writing progress; the extra
 * 15 minutes cover Cloud Tasks queueing and retry delays. Counterpart of
 * `STALE_GENERATION_MS` (campaign-story.utils.ts), which does the same for
 * campaign story and podcast generations.
 */
export const STALE_PROGRESS_MS = 45 * 60 * 1000;

const INACTIVE_STAGES: SessionProgressStage[] = ['idle', 'completed', 'failed'];

export function isActiveStage(stage: SessionProgressStage | undefined): boolean {
  return !!stage && !INACTIVE_STAGES.includes(stage);
}

/**
 * Progress to display for a session: the stored progress, marked as failed when
 * an active stage went stale, or a synthetic progress for sessions that only
 * have the legacy `status` field.
 */
export function toDisplayProgress(
  session: Pick<AudioSessionRecord, 'progress' | 'status' | 'createdAt' | 'updatedAt'>,
  now = Date.now()
): SessionProgress | null {
  const progress = session.progress;
  if (progress) {
    if (isActiveStage(progress.stage)) {
      const updatedAt = toDate(progress.updatedAt);
      if (updatedAt && now - updatedAt.getTime() > STALE_PROGRESS_MS) {
        return {
          ...progress,
          stage: 'failed',
          progress: 0,
          message: 'Operation timed out. Click retry to try again.',
          error: `Operation stalled at "${progress.stage}" (last update: ${updatedAt.toLocaleString()})`,
        };
      }
    }
    return progress;
  }

  const startedAt = toDate(session.createdAt) ?? new Date(now);
  const updatedAt = toDate(session.updatedAt) ?? startedAt;

  if (session.status === 'failed') {
    return {
      stage: 'failed',
      progress: 0,
      message: 'Transcription failed. Click retry to try again.',
      startedAt,
      updatedAt,
    };
  }

  if (session.status === 'processing') {
    return {
      stage: 'transcribing',
      progress: 50,
      message: 'Processing...',
      startedAt,
      updatedAt,
    };
  }

  return null;
}
