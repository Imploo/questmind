import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType, HttpHeaders, HttpRequest } from '@angular/common/http';
import { httpsCallable, type Functions } from 'firebase/functions';
import {doc, onSnapshot, updateDoc, type Firestore, type Unsubscribe, DocumentSnapshot} from 'firebase/firestore';
import { UnifiedProgress } from './audio-session.models';
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
  private http = inject(HttpClient);
  private functions: Functions;
  private firestore: Firestore;

  constructor() {
    this.functions = this.firebase.requireFunctions();
    this.firestore = this.firebase.requireFirestore();
  }

  /**
   * Start complete audio processing:
   * 1. Upload file to backend proxy endpoint (with progress)
   * 2. Backend streams file to Gemini Files API and returns fileUri
   * 3. Call transcribeAudioFast with the resulting fileUri
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

    // 1. Upload file to backend proxy (which forwards to Gemini)
    logger.info('[AudioCompleteProcessing] Uploading file via backend Gemini proxy...');
    const fileUri = await this.uploadToGemini(
      audioFile,
      campaignId,
      sessionId,
      sessionRef,
      onUploadProgress
    );

    logger.info(`[AudioCompleteProcessing] Upload complete, fileUri: ${fileUri}`);

    // 3. Store fileUri in Firestore
    await updateDoc(sessionRef, {
      geminiFileUri: fileUri,
      updatedAt: new Date(),
    });

    // 4. Call transcribeAudioFast (fire-and-forget on backend)
    const transcribe = httpsCallable(this.functions, 'transcribeAudioFast');
    await transcribe({
      campaignId,
      sessionId,
      fileUri,
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
   * Upload audio file directly to the Gemini resumable upload URL.
   * Returns the Gemini Files API fileUri on completion.
   */
  private uploadToGemini(
    file: File,
    campaignId: string,
    sessionId: string,
    sessionRef: ReturnType<typeof doc>,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      void (async () => {
        try {
          const auth = this.firebase.requireAuth();
          const currentUser = auth.currentUser;
          if (!currentUser) {
            reject(new Error('User must be signed in before uploading audio.'));
            return;
          }

          const idToken = await currentUser.getIdToken();
          const uploadUrl = 'api/uploadAudioToGemini';
          const mimeType = file.type || 'application/octet-stream';

          const req = new HttpRequest('POST', uploadUrl, file, {
            headers: new HttpHeaders({
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': mimeType,
              'X-File-Name': encodeURIComponent(file.name),
              'X-File-Size': String(file.size),
              'X-Mime-Type': mimeType,
              'X-Campaign-Id': campaignId,
              'X-Session-Id': sessionId,
            }),
            reportProgress: true,
          });

          let lastFirestoreUpdate = 0;
          let lastProgress = -1;

          this.http.request<{ fileUri?: string }>(req).subscribe({
            next: async (event) => {
              if (event.type === HttpEventType.UploadProgress && event.total) {
                const progress = Math.round((event.loaded / event.total) * 90);

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
              }

              if (event.type === HttpEventType.Response) {
                const uri = event.body?.fileUri;
                if (!uri) {
                  reject(new Error('Backend proxy did not return a Gemini file URI'));
                  return;
                }
                resolve(uri);
              }
            },
            error: reject,
          });
        } catch (error: unknown) {
          reject(error);
        }
      })();
    });
  }

}
