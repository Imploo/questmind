import { Injectable, inject } from '@angular/core';
import { httpsCallable, type Functions } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL, type FirebaseStorage } from 'firebase/storage';
import { doc, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { ProcessingProgress } from './audio-session.models';
import { FirebaseService } from '../core/firebase.service';

export interface StartProcessingOptions {
  sessionTitle: string;
  sessionDate?: string;
  enableKankaContext?: boolean;
  userCorrections?: string;
}

/**
 * Unified service for complete audio processing
 *
 * Handles:
 * 1. Upload audio to Cloud Storage
 * 2. Call processAudioSession Cloud Function (fire-and-forget)
 * 3. Listen to progress updates via Firestore onSnapshot
 *
 * Complete pipeline: upload → transcribe → story → script → audio
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
   * Start complete audio processing
   *
   * @returns Promise that resolves when the Cloud Function is called (NOT when processing completes)
   */
  async startCompleteProcessing(
    campaignId: string,
    sessionId: string,
    audioFile: File,
    options: StartProcessingOptions
  ): Promise<void> {
    // 1. Upload audio to Cloud Storage
    const storagePath = `campaigns/${campaignId}/audio/${sessionId}/${audioFile.name}`;
    const storageRef = ref(this.storage, storagePath);

    await uploadBytes(storageRef, audioFile);

    const storageUrl = await getDownloadURL(storageRef);

    // 2. Call Cloud Function (fire-and-forget)
    const processAudio = httpsCallable(this.functions, 'processAudioSession');

    const request = {
      campaignId,
      sessionId,
      storageUrl,
      audioFileName: audioFile.name,
      audioFileSize: audioFile.size,
      sessionTitle: options.sessionTitle,
      sessionDate: options.sessionDate,
      enableKankaContext: options.enableKankaContext ?? false,
      userCorrections: options.userCorrections
    };

    const result = await processAudio(request);
  }

  /**
   * Listen to progress updates
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
      if (data) {
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
}
