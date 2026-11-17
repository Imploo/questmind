import { Injectable, inject, signal } from '@angular/core';
import { PodcastAudioService } from './podcast-audio.service';
import { AudioSessionRecord, SessionProgressStage } from './audio-session.models';
import { toDisplayProgress } from './session-progress.utils';
import { ToastService } from '../../shared/services/toast.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { callableErrorCode, callableErrorMessage, isPermissionDenied } from '../../shared/utils/callable-error';
import * as logger from '../../shared/logger';

export interface PodcastGenerationStatus {
  isGenerating: boolean;
  message: string;
  percent: number;
}

/** The podcast step each session stage stands for; its text comes from `podcast.steps`. */
const PODCAST_STAGE_STEPS: Partial<Record<SessionProgressStage, 'script' | 'audio'>> = {
  'generating-podcast-script': 'script',
  'generating-podcast-audio': 'audio',
};
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
  private readonly i18n = inject(I18nService);

  /** Session whose generation request is in flight (before/while the backend reports progress). */
  private readonly startingSessionId = signal<string | null>(null);
  readonly error = signal('');

  /**
   * Generation status of a session; reactive when used inside `computed()`.
   * The message follows the stage, in the active language, never the stored text.
   */
  statusFor(session: AudioSessionRecord | null): PodcastGenerationStatus {
    if (!session) return IDLE;

    const steps = this.i18n.t().podcast.steps;
    const progress = toDisplayProgress(session);
    const step = progress ? PODCAST_STAGE_STEPS[progress.stage] : undefined;
    if (progress && step) {
      return { isGenerating: true, message: steps[step], percent: progress.progress ?? 0 };
    }
    if (this.startingSessionId() === session.id) {
      return { isGenerating: true, message: steps.starting, percent: 0 };
    }
    return IDLE;
  }

  async generate(session: AudioSessionRecord): Promise<void> {
    const t = this.i18n.t();
    if (!session.content || !session.id) {
      this.error.set(t.errors.reasons.sessionHasNoStory);
      return;
    }
    if (!session.campaignId) {
      this.error.set(t.audio.noCampaignSelected);
      return;
    }

    this.error.set('');
    this.startingSessionId.set(session.id);
    try {
      await this.podcastAudioService.startPodcastGeneration(
        session.campaignId,
        session.id,
        session.title || t.audio.untitledSession,
        session.sessionDate
      );
    } catch (error: unknown) {
      this.error.set(this.toErrorMessage(error));
    } finally {
      this.startingSessionId.set(null);
    }
  }

  /** The text for a refused or failed start; the server's own message is never shown. */
  private toErrorMessage(error: unknown): string {
    if (isPermissionDenied(error)) {
      logger.warn('Podcast generation refused: permission denied');
      this.toastService.showCallableError(error);
    } else if (callableErrorCode(error) !== 'failed-precondition') {
      // A failed precondition is a refusal the user can act on,
      // e.g. a podcast is already being generated for this session.
      logger.error('Failed to generate podcast:', error);
    }
    const t = this.i18n.t();
    return callableErrorMessage(error, t.errors, t.podcast.session.startFailed);
  }
}
