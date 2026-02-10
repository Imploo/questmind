import { Injectable, inject } from '@angular/core';
import { httpsCallable, type Functions } from 'firebase/functions';
import { ref, uploadBytesResumable, type FirebaseStorage } from 'firebase/storage';
import { doc, onSnapshot, updateDoc, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { SessionProgress, UnifiedProgress } from './audio-session.models';
import { FirebaseService } from '../../core/firebase.service';
import * as logger from '../../shared/logger';

export interface StartProcessingOptions {
  sessionTitle: string;
  sessionDate?: string;
  userCorrections?: string;
  transcriptionMode?: 'fast' | 'batch';
}

export interface ProcessingResult {
  sessionId: string;
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
   * Start complete audio processing using foreground upload.
   *
   * @param onUploadProgress - Optional callback for upload progress (0-99)
   * @returns Promise that resolves with session ID
   */
  async startCompleteProcessing(
    campaignId: string,
    sessionId: string,
    audioFile: File,
    options: StartProcessingOptions,
    onUploadProgress?: (progress: number) => void
  ): Promise<ProcessingResult> {
    const transcriptionMode = options.transcriptionMode || 'batch';

    await this.startForegroundUpload(
      campaignId,
      sessionId,
      audioFile,
      { ...options, transcriptionMode },
      onUploadProgress
    );

    return { sessionId };
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

  private async startForegroundUpload(
    campaignId: string,
    sessionId: string,
    audioFile: File,
    options: StartProcessingOptions,
    onUploadProgress?: (progress: number) => void
  ): Promise<void> {
    const storagePath = `campaigns/${campaignId}/audio/${sessionId}/${audioFile.name}`;
    const storageRef = ref(this.storage, storagePath);
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    const startedAt = new Date();
    let lastProgress = -1;
    let lastUpdateTime = 0;

    const updateProgress = async (progress: number, message: string): Promise<void> => {
      const now = new Date();
      const progressPayload: SessionProgress = {
        stage: 'uploading',
        progress,
        message,
        startedAt,
        updatedAt: now,
      };
      try {
        await updateDoc(sessionRef, {
          progress: progressPayload,
          updatedAt: now,
        });
      } catch (error) {
        console.error('Failed to update upload progress:', error);
      }
    };

    await updateProgress(0, 'Uploading audio...');

    const uploadTask = uploadBytesResumable(storageRef, audioFile);

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const rawProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 90;
          if (onUploadProgress) {
            onUploadProgress(rawProgress);
          }

          const progressPercent = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          const now = Date.now();
          const timeElapsed = now - lastUpdateTime;
          const progressDelta = progressPercent - lastProgress;

          if (progressPercent === 100 || progressDelta >= 5 || timeElapsed >= 1500) {
            lastProgress = progressPercent;
            lastUpdateTime = now;
            void updateProgress(progressPercent, `Uploading audio... ${progressPercent}%`);
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

    const storageUrl = `gs://${this.storage.app.options.storageBucket}/${storagePath}`;

    await updateDoc(sessionRef, {
      storageUrl,
      updatedAt: new Date()
    });
    logger.info(`[AudioCompleteProcessing] Saved storage URL for session ${sessionId}: ${storageUrl}`);

    await updateProgress(100, 'Upload complete, starting transcription...');

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
  }
}
