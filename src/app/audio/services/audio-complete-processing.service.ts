import { Injectable, inject } from '@angular/core';
import { httpsCallable, type Functions } from 'firebase/functions';
import { doc, onSnapshot, updateDoc, type Firestore, type Unsubscribe, DocumentSnapshot } from 'firebase/firestore';
import { UnifiedProgress } from './audio-session.models';
import { AudioStorageService } from './audio-storage.service';
import { FirebaseService } from '../../core/firebase.service';
import * as logger from '../../shared/logger';

export interface StartProcessingOptions {
  sessionTitle: string;
  sessionDate?: string;
  userCorrections?: string;
}

export interface ProcessingResult {
  sessionId: string;
}

@Injectable({
  providedIn: 'root'
})
export class AudioCompleteProcessingService {
  private firebase = inject(FirebaseService);
  private audioStorage = inject(AudioStorageService);
  private functions: Functions;
  private firestore: Firestore;

  constructor() {
    this.functions = this.firebase.requireFunctions();
    this.firestore = this.firebase.requireFirestore();
  }

  /**
   * Start complete audio processing:
   * 1. Upload file directly to GCS (with progress)
   * 2. Build gs:// URI and pass to transcribeAudioFast
   */
  async startCompleteProcessing(
    campaignId: string,
    sessionId: string,
    audioFile: File,
    options: StartProcessingOptions,
    onUploadProgress?: (progress: number) => void
  ): Promise<ProcessingResult> {
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    // 1. Upload directly to GCS with progress tracking
    logger.info('[AudioCompleteProcessing] Uploading file directly to GCS...');
    const gsUri = await this.uploadToGCS(
      audioFile,
      campaignId,
      sessionId,
      sessionRef,
      onUploadProgress
    );

    logger.info(`[AudioCompleteProcessing] Upload complete, gsUri: ${gsUri}`);

    // 2. Store gsUri in Firestore
    await updateDoc(sessionRef, {
      gsUri,
      updatedAt: new Date(),
    });

    // 3. Call transcribeAudioFast (fire-and-forget on backend)
    const transcribe = httpsCallable(this.functions, 'transcribeAudioFast');
    await transcribe({
      campaignId,
      sessionId,
      gsUri,
      audioFileName: audioFile.name,
      audioFileSize: audioFile.size,
      userCorrections: options.userCorrections,
    });

    return { sessionId };
  }

  /**
   * Listen to unified progress updates via Firestore onSnapshot.
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

    return onSnapshot(sessionRef, (snapshot: DocumentSnapshot) => {
      if (!snapshot.exists()) {
        logger.warn(`Session ${sessionId} does not exist`);
        callback(null);
        return;
      }
      const data = snapshot.data();
      const progress = data?.['progress'] as UnifiedProgress | undefined;
      callback(progress || null);
    }, (error: unknown) => {
      console.error('Error listening to progress:', error);
      callback(null);
    });
  }

  /**
   * Upload audio file directly to Google Cloud Storage.
   * Returns the gs:// URI on completion.
   */
  private uploadToGCS(
    file: File,
    campaignId: string,
    sessionId: string,
    sessionRef: ReturnType<typeof doc>,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const storagePath = this.audioStorage.getStoragePath(campaignId, sessionId, file.name);
      const bucket = this.firebase.storage?.app.options['storageBucket'] as string;
      const gsUri = `gs://${bucket}/${storagePath}`;

      let lastFirestoreUpdate = 0;
      let lastProgress = -1;

      this.audioStorage.uploadAudioFile(file, campaignId, sessionId).subscribe({
        next: async (event) => {
          const progress = Math.min(event.progress, 99);

          if (onProgress) {
            onProgress(progress);
          }

          const now = Date.now();
          const delta = progress - lastProgress;
          if (delta >= 5 || now - lastFirestoreUpdate >= 1500) {
            lastProgress = progress;
            lastFirestoreUpdate = now;
            void updateDoc(sessionRef, {
              progress: {
                stage: 'uploading',
                progress,
                message: `Uploading audio... ${progress}%`,
                updatedAt: new Date(),
              },
            });
          }
        },
        error: reject,
        complete: () => resolve(gsUri),
      });
    });
  }
}
