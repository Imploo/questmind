import { Injectable, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../../core/firebase.service';
import { AudioSessionStateService } from './audio-session-state.service';

export interface RegenerateStoryOptions {
  enableKankaContext?: boolean;
  userCorrections?: string;
}

interface RegenerateStoryRequest extends RegenerateStoryOptions {
  campaignId: string;
  sessionId: string;
}

/** Backend operations on an existing audio session. */
@Injectable({ providedIn: 'root' })
export class AudioBackendOperationsService {
  private readonly firebase = inject(FirebaseService);
  private readonly sessionStateService = inject(AudioSessionStateService);

  /**
   * Regenerate the story of a session. The backend reads the transcription from
   * the session document; progress is written to `session.progress`.
   */
  async regenerateStory(
    campaignId: string,
    sessionId: string,
    options: RegenerateStoryOptions = {}
  ): Promise<void> {
    const session = this.sessionStateService.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (!session.rawStory && !session.transcription?.rawTranscript) {
      throw new Error('No transcription found for this session');
    }

    const storyGenerationWorker = httpsCallable<RegenerateStoryRequest, unknown>(
      this.firebase.requireFunctions(),
      'storyGenerationWorker'
    );

    await storyGenerationWorker({
      campaignId,
      sessionId,
      enableKankaContext: options.enableKankaContext,
      userCorrections: options.userCorrections
    });
  }
}
