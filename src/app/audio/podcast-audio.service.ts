import { Injectable, inject, signal, Signal } from '@angular/core';
import { Firestore, doc, onSnapshot } from '@angular/fire/firestore';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { PodcastScript } from './audio-session.models';

export interface PodcastProgress {
  status: 'pending' | 'generating_audio' | 'uploading' | 'completed' | 'failed';
  progress: number;
  message: string;
  error?: string;
}

/**
 * Service for generating and playing stored podcast MP3 files.
 */
@Injectable({
  providedIn: 'root'
})
export class PodcastAudioService {
  private readonly firestore = inject(Firestore);
  private readonly functions = getFunctions(getApp(), 'europe-west4');
  private currentAudio: HTMLAudioElement | null = null;

  /**
   * Start podcast generation (fire-and-forget).
   * Returns immediately after validation. Use listenToPodcastProgress() to monitor.
   */
  async startPodcastGeneration(
    campaignId: string,
    sessionId: string,
    version: number,
    script: PodcastScript
  ): Promise<void> {
    try {
      const generateAudio = httpsCallable<
        {
          campaignId: string;
          sessionId: string;
          version: number;
          script: PodcastScript;
        },
        {
          success: boolean;
          message: string;
        }
      >(this.functions, 'generatePodcastAudio');

      const result = await generateAudio({
        campaignId,
        sessionId,
        version,
        script
      });

      if (!result.data?.success) {
        throw new Error('Failed to start podcast generation');
      }

      // Function returns immediately - generation continues in background
      console.log('Podcast generation started:', result.data.message);
    } catch (error) {
      console.error('Error starting podcast generation:', error);
      throw new Error('Failed to start podcast generation. Please try again.');
    }
  }

  /**
   * Listen to podcast generation progress in real-time.
   * Returns a signal that updates with progress and an unsubscribe function.
   */
  listenToPodcastProgress(
    campaignId: string,
    sessionId: string,
    version: number
  ): { progress: Signal<PodcastProgress | null>; unsubscribe: () => void } {
    const progressSignal = signal<PodcastProgress | null>(null);

    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    // Listen to Firestore changes
    const unsubscribe = onSnapshot(
      sessionRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          progressSignal.set({
            status: 'failed',
            progress: 0,
            message: 'Session not found',
            error: 'Session document does not exist'
          });
          return;
        }

        const data = snapshot.data();
        const podcasts = data?.['podcasts'] || [];
        const podcast = podcasts.find((p: any) => p.version === version);

        if (!podcast) {
          progressSignal.set({
            status: 'pending',
            progress: 0,
            message: 'Waiting to start...'
          });
          return;
        }

        progressSignal.set({
          status: podcast.status || 'pending',
          progress: podcast.progress || 0,
          message: podcast.progressMessage || 'Processing...',
          error: podcast.error
        });
      },
      (error) => {
        console.error('Error listening to podcast progress:', error);
        progressSignal.set({
          status: 'failed',
          progress: 0,
          message: 'Failed to monitor progress',
          error: error.message
        });
      }
    );

    return {
      progress: progressSignal.asReadonly(),
      unsubscribe
    };
  }

  /**
   * Play a single segment (for preview)
   */
  playPodcastMP3(audioUrl: string): HTMLAudioElement {
    this.stopPlayback();
    const audio = new Audio(audioUrl);
    this.currentAudio = audio;
    void audio.play();
    return audio;
  }

  downloadPodcastMP3(audioUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = filename;
    link.click();
  }

  stopPlayback(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }
}
