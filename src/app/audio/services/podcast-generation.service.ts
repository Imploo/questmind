import { Injectable, OnDestroy, effect, signal, inject, Injector, runInInjectionContext } from '@angular/core';
import { PodcastAudioService, PodcastProgress } from './podcast-audio.service';
import { AudioSessionRecord, PodcastVersion } from './audio-session.models';
import * as logger from '../../shared/logger';

@Injectable()
export class PodcastGenerationService implements OnDestroy {
  private readonly podcastAudioService = inject(PodcastAudioService);
  private readonly injector = inject(Injector);

  readonly isGenerating = signal(false);
  readonly progress = signal<PodcastProgress | null>(null);
  readonly progressMessage = signal('');
  readonly progressPercent = signal(0);
  readonly error = signal('');

  private podcastProgressUnsubscribe?: () => void;

  async generate(session: AudioSessionRecord): Promise<void> {
    if (!session.content || !session.id) {
      this.error.set('No session story available.');
      return;
    }
    if (!session.campaignId) {
      this.error.set('No campaign selected.');
      return;
    }

    this.isGenerating.set(true);
    this.progressMessage.set('Starting podcast generation...');
    this.progressPercent.set(0);
    this.error.set('');

    try {
      const version = (session.podcasts?.length || 0) + 1;

      // Step 1: Start listening BEFORE generation
      const { progress, unsubscribe } = this.podcastAudioService.listenToPodcastProgress(
        session.campaignId,
        session.id,
        version
      );

      this.podcastProgressUnsubscribe = unsubscribe;

      // Step 2: Create effect to watch progress
      const progressEffect = runInInjectionContext(this.injector, () => effect(() => {
        const currentProgress = progress();
        if (currentProgress) {
          this.progress.set(currentProgress);
          this.progressMessage.set(currentProgress.message);
          this.progressPercent.set(currentProgress.progress);

          if (currentProgress.error) {
            this.error.set(currentProgress.error);
          }

          if (currentProgress.status === 'completed' || currentProgress.status === 'failed') {
            setTimeout(() => {
              this.isGenerating.set(false);
              this.cleanupProgressListener();
              progressEffect.destroy();
            }, 3000);
          }
        }
      }));

      // Step 3: Fire-and-forget — progress is tracked via Firestore listener above
      this.podcastAudioService.startPodcastGeneration(
        session.campaignId,
        session.id,
        version,
        session.content,
        session.title || 'Untitled Session',
        session.sessionDate
      ).catch(err => {
        // The callable may time out on the client side, but the Cloud Function
        // keeps running. Progress tracking via Firestore listener continues.
        logger.warn('Podcast callable returned error (generation may still be running):', err);
      });

    } catch (error: unknown) {
      logger.error('Failed to set up podcast generation:', error);
      this.error.set((error as Error)?.message || 'Failed to start podcast generation');
      this.progressMessage.set('');
      this.progressPercent.set(0);
      this.isGenerating.set(false);
      this.cleanupProgressListener();
    }
  }

  download(podcast: PodcastVersion, sessionTitle: string): void {
    if (!podcast.audioUrl) {
      this.error.set('Audio not available for download.');
      return;
    }
    const filename = `${sessionTitle || 'podcast'}-v${podcast.version}.mp3`;
    this.podcastAudioService.downloadPodcastMP3(podcast.audioUrl, filename);
  }

  ngOnDestroy(): void {
    this.cleanupProgressListener();
  }

  private cleanupProgressListener(): void {
    if (this.podcastProgressUnsubscribe) {
      this.podcastProgressUnsubscribe();
      this.podcastProgressUnsubscribe = undefined;
    }
  }
}
