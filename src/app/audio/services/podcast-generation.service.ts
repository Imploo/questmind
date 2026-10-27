import { Injectable, inject, signal } from '@angular/core';
import { PodcastAudioService } from './podcast-audio.service';
import { AudioSessionRecord, SessionProgressStage } from './audio-session.models';
import { toDisplayProgress } from './session-progress.utils';
import { ToastService } from '../../shared/services/toast.service';
import { callableErrorCode, isPermissionDenied, PERMISSION_DENIED_MESSAGE } from '../../shared/utils/callable-error';
import * as logger from '../../shared/logger';

export interface PodcastGenerationStatus {
  isGenerating: boolean;
  message: string;
  percent: number;
}

const PODCAST_STAGES: SessionProgressStage[] = ['generating-podcast-script', 'generating-podcast-audio'];
const IDLE: PodcastGenerationStatus = { isGenerating: false, message: '', percent: 0 };

/**
 * Session podcast generation. Progress is derived from the session document
 * (`session.progress`, streamed by AudioSessionStateService); the server
 * allocates the podcast version.
 */
@Injectable()
export class PodcastGenerationService {
  private readonly podcastAudioService = inject(PodcastAudioService);
  private readonly toastService = inject(ToastService);

  /** Session whose generation request is in flight (before/while the backend reports progress). */
  private readonly startingSessionId = signal<string | null>(null);
  readonly error = signal('');

  /** Generation status of a session; reactive when used inside `computed()`. */
  statusFor(session: AudioSessionRecord | null): PodcastGenerationStatus {
    if (!session) return IDLE;

    const progress = toDisplayProgress(session);
    if (progress && PODCAST_STAGES.includes(progress.stage)) {
      return { isGenerating: true, message: progress.message, percent: progress.progress ?? 0 };
    }
    if (this.startingSessionId() === session.id) {
      return { isGenerating: true, message: 'Starting podcast generation...', percent: 0 };
    }
    return IDLE;
  }

  async generate(session: AudioSessionRecord): Promise<void> {
    if (!session.content || !session.id) {
      this.error.set('No session story available.');
      return;
    }
    if (!session.campaignId) {
      this.error.set('No campaign selected.');
      return;
    }

    this.error.set('');
    this.startingSessionId.set(session.id);
    try {
      await this.podcastAudioService.startPodcastGeneration(
        session.campaignId,
        session.id,
        session.title || 'Untitled Session',
        session.sessionDate
      );
    } catch (error: unknown) {
      this.error.set(this.toErrorMessage(error));
    } finally {
      this.startingSessionId.set(null);
    }
  }

  private toErrorMessage(error: unknown): string {
    if (isPermissionDenied(error)) {
      logger.warn('Podcast generation refused: permission denied');
      this.toastService.showCallableError(error);
      return PERMISSION_DENIED_MESSAGE;
    }
    if (callableErrorCode(error) === 'failed-precondition') {
      // e.g. a podcast is already being generated for this session
      return (error as Error).message;
    }
    logger.error('Failed to generate podcast:', error);
    return 'Failed to start podcast generation. Please try again.';
  }
}
