import { Injectable, inject } from '@angular/core';
import { httpsCallable, type Functions } from 'firebase/functions';
import { ref, uploadBytesResumable, type FirebaseStorage } from 'firebase/storage';
import { doc, onSnapshot, updateDoc, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { UnifiedProgress } from './audio-session.models';
import { FirebaseService } from '../../core/firebase.service';
import { BackgroundUploadService } from './background-upload.service';
import * as logger from '../../shared/logger';

export interface StartProcessingOptions {
  sessionTitle: string;
  sessionDate?: string;
  userCorrections?: string;
  transcriptionMode?: 'fast' | 'batch';
}

export interface ProcessingResult {
  sessionId: string;
  isBackground: boolean;
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
  private backgroundUpload = inject(BackgroundUploadService);
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
   * Attempts Background Fetch API first (for mobile resilience), then falls
   * back to foreground uploadBytesResumable.
   *
   * @param onUploadProgress - Optional callback for upload progress (0-99)
   * @returns Promise that resolves with session ID and whether upload is background
   */
  async startCompleteProcessing(
    campaignId: string,
    sessionId: string,
    audioFile: File,
    options: StartProcessingOptions,
    onUploadProgress?: (progress: number) => void
  ): Promise<ProcessingResult> {
    const transcriptionMode = options.transcriptionMode || 'batch';

    // Try background upload first
    if (this.backgroundUpload.isSupported()) {
      logger.info('[AudioCompleteProcessing] Background Fetch supported, attempting background upload');

      const registration = await this.backgroundUpload.startBackgroundUpload(
        audioFile,
        campaignId,
        sessionId,
        transcriptionMode,
        options.userCorrections
      );

      if (registration) {
        logger.info(`[AudioCompleteProcessing] Background upload started for session ${sessionId}`);
        return { sessionId, isBackground: true };
      }

      logger.warn('[AudioCompleteProcessing] Background upload failed, falling back to foreground');
    }

    // Foreground upload fallback
    const storagePath = `campaigns/${campaignId}/audio/${sessionId}/${audioFile.name}`;
    const storageRef = ref(this.storage, storagePath);

    const uploadTask = uploadBytesResumable(storageRef, audioFile);

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const rawProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 90;
          if (onUploadProgress) {
            onUploadProgress(rawProgress);
          }
        },
        (error) => {
          console.error('Upload error:', error);
          reject(error);
        },
        () => {
          resolve();
        }
      );
    });

    // Build storage URL in the format expected by backend
    const storageUrl = `gs://${this.storage.app.options.storageBucket}/${storagePath}`;

    // Save storage URL to Firestore before triggering transcription
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );
    await updateDoc(sessionRef, {
      storageUrl,
      updatedAt: new Date()
    });
    logger.info(`[AudioCompleteProcessing] Saved storage URL for session ${sessionId}: ${storageUrl}`);

    // Trigger transcription (fast or batch mode) to start the processing chain
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

    return { sessionId, isBackground: false };
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
