import { Injectable, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../../core/firebase.service';
import * as logger from '../../shared/logger';

interface GeneratePodcastRequest {
  campaignId: string;
  sessionId: string;
  sessionTitle?: string;
  sessionDate?: string;
}

interface GeneratePodcastResponse {
  success: boolean;
  message?: string;
  /** Podcast version allocated by the server. */
  version?: number;
}

/** Calls the session podcast Cloud Function. */
@Injectable({
  providedIn: 'root'
})
export class PodcastAudioService {
  private readonly firebase = inject(FirebaseService);

  /**
   * Generate a podcast (script + audio) for a session. The server reads the story
   * from the session and allocates the podcast version; progress is written to
   * the session document. Resolves with the version once the backend is done, or
   * with null when the call outlived the client-side timeout (generation then
   * continues in the background). Other errors are rethrown with their code.
   */
  async startPodcastGeneration(
    campaignId: string,
    sessionId: string,
    sessionTitle?: string,
    sessionDate?: string
  ): Promise<number | null> {
    const generateAudio = httpsCallable<GeneratePodcastRequest, GeneratePodcastResponse>(
      this.firebase.requireFunctions(),
      'generatePodcastAudio'
    );

    try {
      const result = await generateAudio({ campaignId, sessionId, sessionTitle, sessionDate });
      if (!result.data?.success) {
        throw new Error(result.data?.message || 'Failed to start podcast generation');
      }
      return result.data.version ?? null;
    } catch (error) {
      // Long podcasts outlive the client-side callable timeout while the Cloud
      // Function keeps running; real failures are reported via Firestore.
      if ((error as { code?: string })?.code === 'functions/deadline-exceeded') {
        logger.debug('Podcast callable timed out client-side; generation continues in background');
        return null;
      }
      throw error;
    }
  }
}
