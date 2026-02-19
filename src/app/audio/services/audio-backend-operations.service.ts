import { Injectable, inject } from '@angular/core';
import { httpsCallable, type Functions } from 'firebase/functions';
import { doc, onSnapshot, type Unsubscribe, type DocumentSnapshot } from 'firebase/firestore';
import { FirebaseService } from '../../core/firebase.service';
import { UnifiedProgress } from './audio-session.models';
import { AudioSessionStateService } from './audio-session-state.service';

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
  private readonly sessionStateService = inject(AudioSessionStateService);
  private functions: Functions;

  constructor() {
    this.functions = this.firebase.requireFunctions();
  }

  /**
   * Retranscribe audio from existing session using batch transcription
   */
  async retranscribeAudio(
    campaignId: string,
    sessionId: string,
    options: RetranscribeOptions = {}
  ): Promise<void> {
    const session = this.sessionStateService.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const sessionData = session as unknown as Record<string, unknown>;
    const storageMetadata = sessionData['storageMetadata'] as Record<string, unknown> | undefined;
    const downloadUrl = storageMetadata?.['downloadUrl'] as string | undefined;
    const audioFileName = session.audioFileName || 'audio.wav';

    if (!downloadUrl) {
      throw new Error('No audio file found for this session');
    }

    const transcribeAudioBatch = httpsCallable(this.functions, 'transcribeAudioBatch');

    await transcribeAudioBatch({
      campaignId,
      sessionId,
      storageUrl: downloadUrl,
      audioFileName,
      audioFileSize: storageMetadata?.['fileSize'],
      enableKankaContext: options.enableKankaContext,
      userCorrections: options.userCorrections
    });
  }

  /**
   * @deprecated Use SessionProgressCardComponent instead (Ticket #43)
   * Listen to retranscribe progress updates (uses unified progress)
   */
  listenToRetranscribeProgress(
    campaignId: string,
    sessionId: string,
    callback: (progress: RetranscribeProgress) => void
  ): Unsubscribe {
    const firestore = this.firebase.requireFirestore();
    const sessionRef = doc(
      firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    return onSnapshot(sessionRef, (snapshot: DocumentSnapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();

        if (data['progress']) {
          const unifiedProgress = data['progress'] as UnifiedProgress;

          callback({
            status: this.mapStageToRetranscribeStatus(unifiedProgress.stage),
            progress: unifiedProgress.progress,
            message: unifiedProgress.currentStep || this.getDefaultMessage(unifiedProgress.stage),
            error: unifiedProgress.failure?.error
          });
        } else {
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

    const transcriptionText = session.rawStory || session.transcription?.rawTranscript;

    if (!transcriptionText) {
      throw new Error('No transcription found for this session');
    }

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
   */
  listenToRegenerateStoryProgress(
    campaignId: string,
    sessionId: string,
    callback: (progress: RegenerateStoryProgress) => void
  ): Unsubscribe {
    const firestore = this.firebase.requireFirestore();
    const sessionRef = doc(
      firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    return onSnapshot(sessionRef, (snapshot: DocumentSnapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();

        if (data['progress']) {
          const unifiedProgress = data['progress'] as UnifiedProgress;

          callback({
            status: this.mapStageToRegenerateStatus(unifiedProgress.stage),
            progress: unifiedProgress.progress,
            message: unifiedProgress.currentStep || this.getDefaultMessage(unifiedProgress.stage),
            error: unifiedProgress.failure?.error
          });
        } else {
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

  private mapStageToRegenerateStatus(stage: string): RegenerateStoryStatus {
    const stageMap: Record<string, RegenerateStoryStatus> = {
      'generating-story': 'generating_story',
      'completed': 'completed',
      'failed': 'failed'
    };

    return stageMap[stage] || 'loading_context';
  }

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
