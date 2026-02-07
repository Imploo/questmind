import { Injectable, inject } from '@angular/core';
import { httpsCallable, type Functions } from 'firebase/functions';
import { ref, uploadBytesResumable, type FirebaseStorage } from 'firebase/storage';
import { doc, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { UnifiedProgress } from './audio-session.models';
import { FirebaseService } from '../../core/firebase.service';
import * as logger from '../../shared/logger';

export interface StartProcessingOptions {
  sessionTitle: string;
  sessionDate?: string;
  userCorrections?: string;
  transcriptionMode?: 'fast' | 'batch';
}

/**
 * Unified service for complete audio processing (Worker Chain Architecture)
 *
 * New Flow (Ticket #37):
 * 1. Upload audio directly to Firebase Storage
 * 2. Call transcribeAudioBatch Cloud Function (fire-and-forget)
 * 3. Listen to unified progress updates via Firestore onSnapshot
 *
 * Flow: upload → submit → transcribe → generate story
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
   * @param onUploadProgress - Optional callback for upload progress (0-99)
   * @returns Promise that resolves with session ID when upload completes and worker is triggered
   */
  async startCompleteProcessing(
    campaignId: string,
    sessionId: string,
    audioFile: File,
    options: StartProcessingOptions,
    onUploadProgress?: (progress: number) => void
  ): Promise<string> {
    // 1. Upload audio directly to Cloud Storage with progress tracking
    const storagePath = `campaigns/${campaignId}/audio/${sessionId}/${audioFile.name}`;
    const storageRef = ref(this.storage, storagePath);

    // Use uploadBytesResumable for progress tracking
    const uploadTask = uploadBytesResumable(storageRef, audioFile);

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          // Calculate progress (0-99%, save 100% for when batch submission returns)
          const rawProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          const cappedProgress = Math.min(rawProgress, 99);

          if (onUploadProgress) {
            onUploadProgress(cappedProgress);
          }
        },
        (error) => {
          console.error('Upload error:', error);
          reject(error);
        },
        () => {
          // Upload completed successfully
          resolve();
        }
      );
    });

    // Build storage URL in the format expected by backend
    const storageUrl = `gs://${this.storage.app.options.storageBucket}/${storagePath}`;

    // 2. Trigger transcription (fast or batch mode) to start the processing chain
    const transcriptionMode = options.transcriptionMode || 'batch';
    const transcribeFunction = transcriptionMode === 'fast'
      ? httpsCallable(this.functions, 'transcribeAudioFast')
      : httpsCallable(this.functions, 'transcribeAudioBatch');

    const request = {
      campaignId,
      sessionId,
      storageUrl,
      audioFileName: audioFile.name,
      audioFileSize: audioFile.size,
      userCorrections: options.userCorrections
    };

    logger.info(`[AudioCompleteProcessing] Starting ${transcriptionMode} transcription for session ${sessionId}`);
    await transcribeFunction(request);

    // Return session ID for navigation
    return sessionId;
  }

  /**
   * Listen to unified progress updates
   *
   * Components can subscribe to session document changes directly via Firestore
   * to monitor UnifiedProgress updates from the worker chain.
   *
   * @returns Unsubscribe function to stop listening
   */
  listenToProgress(
    campaignId: string,
    sessionId: string,
    callback: (progress: UnifiedProgress | null) => void
  ): Unsubscribe {
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    return onSnapshot(sessionRef, (snapshot: any) => {
      if (!snapshot.exists()) {
        logger.warn(`Session ${sessionId} does not exist`);
        callback(null);
        return;
      }

      const data = snapshot.data();
      const progress = data?.['progress'] as UnifiedProgress | undefined;
      callback(progress || null);
    }, (error: any) => {
      console.error('Error listening to progress:', error);
      callback(null);
    });
  }
}
