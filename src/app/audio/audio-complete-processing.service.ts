import { Injectable, inject } from '@angular/core';
import { httpsCallable, type Functions } from 'firebase/functions';
import { ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { doc, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { ProcessingProgress, UnifiedProgress, CompleteProcessingStatus } from './audio-session.models';
import { FirebaseService } from '../core/firebase.service';

export interface StartProcessingOptions {
  sessionTitle: string;
  sessionDate?: string;
  enableKankaContext?: boolean;
  userCorrections?: string;
}

/**
 * Unified service for complete audio processing (Worker Chain Architecture)
 *
 * New Flow (Ticket #36):
 * 1. Upload audio directly to Firebase Storage
 * 2. Call downloadWorker Cloud Function (fire-and-forget)
 * 3. Listen to unified progress updates via Firestore onSnapshot
 *
 * Worker chain: upload → download → chunk → transcribe → generate story
 */
@Injectable({
  providedIn: 'root'
})
export class AudioCompleteProcessingService {
  private firebase = inject(FirebaseService);
  private functions: Functions;
  private storage: FirebaseStorage;
  private firestore: Firestore;

  constructor() {
    this.functions = this.firebase.requireFunctions();
    this.storage = this.firebase.storage!;
    this.firestore = this.firebase.requireFirestore();
  }

  /**
   * Start complete audio processing using new worker chain
   *
   * @returns Promise that resolves when upload completes and worker is triggered
   */
  async startCompleteProcessing(
    campaignId: string,
    sessionId: string,
    audioFile: File,
    options: StartProcessingOptions
  ): Promise<void> {
    // 1. Upload audio directly to Cloud Storage (frontend handles upload)
    const storagePath = `campaigns/${campaignId}/audio/${sessionId}/${audioFile.name}`;
    const storageRef = ref(this.storage, storagePath);

    await uploadBytes(storageRef, audioFile);

    // Build storage URL in the format expected by backend
    const storageUrl = `gs://${this.storage.app.options.storageBucket}/${storagePath}`;

    // 2. Trigger downloadWorker to start the processing chain
    const downloadWorker = httpsCallable(this.functions, 'downloadWorker');

    const request = {
      sessionId,
      storageUrl,
      audioFileName: audioFile.name,
      enableKankaContext: options.enableKankaContext ?? false,
      userCorrections: options.userCorrections
    };

    await downloadWorker(request);
  }

  /**
   * Listen to unified progress updates (new worker chain)
   *
   * Maps new progress structure to legacy ProcessingProgress for UI compatibility
   *
   * @returns Unsubscribe function to stop listening
   */
  listenToProgress(
    campaignId: string,
    sessionId: string,
    callback: (progress: ProcessingProgress) => void
  ): Unsubscribe {
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    return onSnapshot(sessionRef, (snapshot: any) => {
      if (!snapshot.exists()) {
        console.warn(`Session ${sessionId} does not exist`);
        return;
      }

      const data = snapshot.data();
      if (data && data['progress']) {
        const unifiedProgress = data['progress'] as UnifiedProgress;

        // Map new stage to legacy status
        const legacyStatus = this.mapStageToLegacyStatus(unifiedProgress.stage);

        const progress: ProcessingProgress = {
          status: legacyStatus,
          progress: unifiedProgress.progress,
          message: unifiedProgress.currentStep || this.getDefaultMessage(unifiedProgress.stage),
          error: unifiedProgress.failure?.error
        };

        callback(progress);
      } else {
        // Fallback to legacy fields if new progress not available
        const progress: ProcessingProgress = {
          status: data['completeProcessingStatus'] || 'idle',
          progress: data['completeProcessingProgress'] || 0,
          message: data['completeProcessingMessage'] || '',
          error: data['completeProcessingError']
        };

        callback(progress);
      }
    }, (error: any) => {
      console.error('Error listening to progress:', error);
      callback({
        status: 'failed',
        progress: 0,
        message: 'Failed to listen to progress updates',
        error: error.message
      });
    });
  }

  /**
   * Map new worker stage to legacy status for UI compatibility
   */
  private mapStageToLegacyStatus(stage: string): CompleteProcessingStatus {
    const stageMap: Record<string, CompleteProcessingStatus> = {
      'uploading': 'idle',
      'downloading': 'loading_context',
      'chunking': 'transcribing',
      'transcribing': 'transcribing',
      'generating-story': 'generating_story',
      'completed': 'completed',
      'failed': 'failed'
    };

    return stageMap[stage] || 'idle';
  }

  /**
   * Get default message for a stage
   */
  private getDefaultMessage(stage: string): string {
    const messages: Record<string, string> = {
      'uploading': 'Uploading audio file...',
      'downloading': 'Downloading audio file...',
      'chunking': 'Preparing audio for transcription...',
      'transcribing': 'Transcribing audio...',
      'generating-story': 'Generating story...',
      'completed': 'Processing complete',
      'failed': 'Processing failed'
    };

    return messages[stage] || 'Processing...';
  }
}
