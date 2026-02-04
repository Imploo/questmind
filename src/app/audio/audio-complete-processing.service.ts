import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Firestore, doc, onSnapshot, Unsubscribe } from '@angular/fire/firestore';
import { ProcessingProgress } from './audio-session.models';

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
  private functions = inject(Functions);
  private storage = inject(Storage);
  private firestore = inject(Firestore);

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

    console.log(`Uploading audio to ${storagePath}...`);
    await uploadBytes(storageRef, audioFile);

    const audioStorageUrl = await getDownloadURL(storageRef);
    console.log(`Audio uploaded: ${audioStorageUrl}`);

    // 2. Call Cloud Function (fire-and-forget)
    const processAudio = httpsCallable(this.functions, 'processAudioSession');

    const request = {
      campaignId,
      sessionId,
      audioStorageUrl,
      audioFileName: audioFile.name,
      audioFileSize: audioFile.size,
      sessionTitle: options.sessionTitle,
      sessionDate: options.sessionDate,
      enableKankaContext: options.enableKankaContext ?? false,
      userCorrections: options.userCorrections
    };

    console.log('Calling processAudioSession Cloud Function...');
    const result = await processAudio(request);

    console.log('Cloud Function called successfully:', result);
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
