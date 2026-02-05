import { Injectable, signal, Signal } from '@angular/core';
import { doc, onSnapshot, DocumentSnapshot, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { FirebaseService } from '../../core/firebase.service';

export interface PodcastProgress {
  status:
    | 'pending'
    | 'loading_context'      // NEW
    | 'generating_script'    // NEW
    | 'script_complete'      // NEW
    | 'generating_audio'
    | 'uploading'
    | 'completed'
    | 'failed';
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
  private readonly firestore: Firestore;
  private readonly functions: Functions;
  private currentAudio: HTMLAudioElement | null = null;

  constructor(private readonly firebase: FirebaseService) {
    this.firestore = this.firebase.requireFirestore();
    this.functions = this.firebase.requireFunctions();
  }

  /**
   * Start complete podcast generation (script + audio).
   * Returns immediately. Use listenToPodcastProgress() to monitor.
   */
  async startPodcastGeneration(
    campaignId: string,
    sessionId: string,
    version: number,
    story: string,           // NEW: Story for script generation
    sessionTitle: string,    // NEW: Session title
    sessionDate?: string     // NEW: Optional session date
  ): Promise<void> {
    try {
      const generateAudio = httpsCallable<
        {
          campaignId: string;
          sessionId: string;
          version: number;
          story: string;
          sessionTitle: string;
          sessionDate?: string;
        },
        { success: boolean; message: string; }
      >(this.functions, 'generatePodcastAudio');

      const result = await generateAudio({
        campaignId,
        sessionId,
        version,
        story,
        sessionTitle,
        sessionDate
      });

      if (!result.data?.success) {
        throw new Error('Failed to start podcast generation');
      }

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
      (snapshot: DocumentSnapshot) => {
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
      (error: Error) => {
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
