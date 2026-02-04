import { Injectable } from '@angular/core';
import { httpsCallable, type Functions } from 'firebase/functions';
import { doc, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { FirebaseService } from '../core/firebase.service';

export interface RetranscribeOptions {
  enableKankaContext?: boolean;
  userCorrections?: string;
  regenerateStoryAfterTranscription?: boolean;
}

export interface RegenerateStoryOptions {
  enableKankaContext?: boolean;
  userCorrections?: string;
}

export type RetranscribeStatus =
  | 'loading_context'
  | 'transcribing'
  | 'transcription_complete'
  | 'generating_story'
  | 'story_complete'
  | 'completed'
  | 'failed';

export type RegenerateStoryStatus =
  | 'loading_context'
  | 'generating_story'
  | 'completed'
  | 'failed';

export interface RetranscribeProgress {
  status: RetranscribeStatus;
  progress: number;
  message: string;
  error?: string;
}

export interface RegenerateStoryProgress {
  status: RegenerateStoryStatus;
  progress: number;
  message: string;
  error?: string;
}

/**
 * Service for calling backend audio processing operations
 * Handles retranscription and story regeneration with real-time progress tracking
 */
@Injectable({ providedIn: 'root' })
export class AudioBackendOperationsService {
  private functions: Functions;
  private firestore: Firestore;

  constructor(private firebase: FirebaseService) {
    this.functions = this.firebase.requireFunctions();
    this.firestore = this.firebase.requireFirestore();
  }

  /**
   * Retranscribe audio from existing session
   *
   * @param campaignId - Campaign ID
   * @param sessionId - Session ID
   * @param options - Retranscription options
   * @returns Promise that resolves when the function is called (not when processing completes)
   */
  async retranscribeAudio(
    campaignId: string,
    sessionId: string,
    options: RetranscribeOptions = {}
  ): Promise<void> {
    const retranscribe = httpsCallable(this.functions, 'retranscribeAudio');

    await retranscribe({
      campaignId,
      sessionId,
      enableKankaContext: options.enableKankaContext,
      userCorrections: options.userCorrections,
      regenerateStoryAfterTranscription: options.regenerateStoryAfterTranscription ?? true
    });
  }

  /**
   * Listen to retranscribe progress updates
   *
   * @param campaignId - Campaign ID
   * @param sessionId - Session ID
   * @param callback - Function to call when progress updates
   * @returns Unsubscribe function
   */
  listenToRetranscribeProgress(
    campaignId: string,
    sessionId: string,
    callback: (progress: RetranscribeProgress) => void
  ): Unsubscribe {
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    return onSnapshot(sessionRef, (snapshot: any) => {
      if (snapshot.exists()) {
        const data = snapshot.data();

        callback({
          status: data['retranscribeStatus'] || 'loading_context',
          progress: data['retranscribeProgress'] || 0,
          message: data['retranscribeMessage'] || '',
          error: data['retranscribeError']
        });
      }
    });
  }

  /**
   * Regenerate story from existing transcription
   *
   * @param campaignId - Campaign ID
   * @param sessionId - Session ID
   * @param options - Story regeneration options
   * @returns Promise that resolves when the function is called (not when processing completes)
   */
  async regenerateStory(
    campaignId: string,
    sessionId: string,
    options: RegenerateStoryOptions = {}
  ): Promise<void> {
    const regenerate = httpsCallable(this.functions, 'regenerateStory');

    await regenerate({
      campaignId,
      sessionId,
      enableKankaContext: options.enableKankaContext,
      userCorrections: options.userCorrections
    });
  }

  /**
   * Listen to regenerate story progress updates
   *
   * @param campaignId - Campaign ID
   * @param sessionId - Session ID
   * @param callback - Function to call when progress updates
   * @returns Unsubscribe function
   */
  listenToRegenerateStoryProgress(
    campaignId: string,
    sessionId: string,
    callback: (progress: RegenerateStoryProgress) => void
  ): Unsubscribe {
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    return onSnapshot(sessionRef, (snapshot: any) => {
      if (snapshot.exists()) {
        const data = snapshot.data();

        callback({
          status: data['regenerateStoryStatus'] || 'loading_context',
          progress: data['regenerateStoryProgress'] || 0,
          message: data['regenerateStoryMessage'] || '',
          error: data['regenerateStoryError']
        });
      }
    });
  }
}
