import { Injectable, inject } from '@angular/core';
import { httpsCallable, type Functions } from 'firebase/functions';
import { doc, onSnapshot, getDoc, type Firestore, type Unsubscribe, type DocumentSnapshot } from 'firebase/firestore';
import { FirebaseService } from '../../core/firebase.service';
import { UnifiedProgress } from './audio-session.models';

export interface RetranscribeOptions {
  enableKankaContext?: boolean;
  userCorrections?: string;
  regenerateStoryAfterTranscription?: boolean;
}

export interface RegenerateStoryOptions {
  enableKankaContext?: boolean;
  userCorrections?: string;
}

/**
 * @deprecated Use SessionProgress instead (Ticket #43)
 */
export type RetranscribeStatus =
  | 'loading_context'
  | 'transcribing'
  | 'transcription_complete'
  | 'generating_story'
  | 'story_complete'
  | 'completed'
  | 'failed';

/**
 * @deprecated Use SessionProgress instead (Ticket #43)
 */
export type RegenerateStoryStatus =
  | 'loading_context'
  | 'generating_story'
  | 'completed'
  | 'failed';

/**
 * @deprecated Use SessionProgress instead (Ticket #43)
 * Use SessionProgressCardComponent for displaying progress
 */
export interface RetranscribeProgress {
  status: RetranscribeStatus;
  progress: number;
  message: string;
  error?: string;
}

/**
 * @deprecated Use SessionProgress instead (Ticket #43)
 * Use SessionProgressCardComponent for displaying progress
 */
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
  private readonly firebase = inject(FirebaseService);
  private functions: Functions;
  private firestore: Firestore;

  constructor() {
    this.functions = this.firebase.requireFunctions();
    this.firestore = this.firebase.requireFirestore();
  }

  /**
   * Retranscribe audio from existing session using batch transcription
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
    // Get existing session data to retrieve storage URL
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) {
      throw new Error('Session not found');
    }

    const sessionData = sessionSnap.data();
    const storageUrl = sessionData['storageMetadata']?.['downloadUrl'];
    const audioFileName = sessionData['audioFileName'] || 'audio.wav';

    if (!storageUrl) {
      throw new Error('No audio file found for this session');
    }

    // Trigger batch transcription for retranscription
    const transcribeAudioBatch = httpsCallable(this.functions, 'transcribeAudioBatch');

    await transcribeAudioBatch({
      campaignId,
      sessionId,
      storageUrl,
      audioFileName,
      audioFileSize: sessionData['storageMetadata']?.['fileSize'],
      enableKankaContext: options.enableKankaContext,
      userCorrections: options.userCorrections
    });
  }

  /**
   * @deprecated Use SessionProgressCardComponent instead (Ticket #43)
   * Listen to retranscribe progress updates (uses unified progress)
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

    return onSnapshot(sessionRef, (snapshot: DocumentSnapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();

        // Use new unified progress if available
        if (data['progress']) {
          const unifiedProgress = data['progress'] as UnifiedProgress;

          callback({
            status: this.mapStageToRetranscribeStatus(unifiedProgress.stage),
            progress: unifiedProgress.progress,
            message: unifiedProgress.currentStep || this.getDefaultMessage(unifiedProgress.stage),
            error: unifiedProgress.failure?.error
          });
        } else {
          // Fallback to legacy fields
          callback({
            status: data['retranscribeStatus'] || 'loading_context',
            progress: data['retranscribeProgress'] || 0,
            message: data['retranscribeMessage'] || '',
            error: data['retranscribeError']
          });
        }
      }
    });
  }

  /**
   * Map unified stage to retranscribe status
   */
  private mapStageToRetranscribeStatus(stage: string): RetranscribeStatus {
    const stageMap: Record<string, RetranscribeStatus> = {
      'submitted': 'loading_context',
      'downloading': 'loading_context',
      'chunking': 'loading_context',
      'transcribing': 'transcribing',
      'generating-story': 'generating_story',
      'completed': 'completed',
      'failed': 'failed'
    };

    return stageMap[stage] || 'loading_context';
  }

  /**
   * Regenerate story from existing transcription using new worker
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
    // Get existing transcription from session
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) {
      throw new Error('Session not found');
    }

    const sessionData = sessionSnap.data();
    const transcriptionText = sessionData['transcription']?.['rawTranscript'];

    if (!transcriptionText) {
      throw new Error('No transcription found for this session');
    }

    // Trigger storyGenerationWorker directly (skips download/chunk/transcribe)
    const storyGenerationWorker = httpsCallable(this.functions, 'storyGenerationWorker');

    await storyGenerationWorker({
      campaignId,
      sessionId,
      transcriptionText,
      enableKankaContext: options.enableKankaContext,
      userCorrections: options.userCorrections
    });
  }

  /**
   * @deprecated Use SessionProgressCardComponent instead (Ticket #43)
   * Listen to regenerate story progress updates (uses unified progress)
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

    return onSnapshot(sessionRef, (snapshot: DocumentSnapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();

        // Use new unified progress if available
        if (data['progress']) {
          const unifiedProgress = data['progress'] as UnifiedProgress;

          callback({
            status: this.mapStageToRegenerateStatus(unifiedProgress.stage),
            progress: unifiedProgress.progress,
            message: unifiedProgress.currentStep || this.getDefaultMessage(unifiedProgress.stage),
            error: unifiedProgress.failure?.error
          });
        } else {
          // Fallback to legacy fields
          callback({
            status: data['regenerateStoryStatus'] || 'loading_context',
            progress: data['regenerateStoryProgress'] || 0,
            message: data['regenerateStoryMessage'] || '',
            error: data['regenerateStoryError']
          });
        }
      }
    });
  }

  /**
   * Map unified stage to regenerate story status
   */
  private mapStageToRegenerateStatus(stage: string): RegenerateStoryStatus {
    const stageMap: Record<string, RegenerateStoryStatus> = {
      'generating-story': 'generating_story',
      'completed': 'completed',
      'failed': 'failed'
    };

    return stageMap[stage] || 'loading_context';
  }

  /**
   * Get default message for a stage
   */
  private getDefaultMessage(stage: string): string {
    const messages: Record<string, string> = {
      'downloading': 'Downloading audio...',
      'submitted': 'Submitting transcription job...',
      'chunking': 'Preparing audio...',
      'transcribing': 'Transcribing audio...',
      'generating-story': 'Generating story...',
      'completed': 'Complete',
      'failed': 'Failed'
    };

    return messages[stage] || 'Processing...';
  }
}
