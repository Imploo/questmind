import {inject, Injectable} from '@angular/core';
import {type Functions, httpsCallable} from 'firebase/functions';
import {doc, type Firestore, updateDoc} from 'firebase/firestore';
import {Auth, getIdToken} from 'firebase/auth';
import {FirebaseService} from '../../core/firebase.service';
import {AudioCompressionService} from './audio-compression.service';
import {environment} from '../../../environments/environment';
import * as logger from '../../shared/logger';

export interface StartProcessingOptions {
  sessionTitle: string;
  sessionDate?: string;
  userCorrections?: string;
}

export interface ProcessingResult {
  sessionId: string;
}

export type UploadStage = 'compressing' | 'uploading';

import {UnifiedProgress} from './audio-session.models';
import {type Unsubscribe, onSnapshot, DocumentSnapshot} from 'firebase/firestore';

@Injectable({
  providedIn: 'root'
})
export class AudioCompleteProcessingService {
  private firebase = inject(FirebaseService);
  private audioCompression = inject(AudioCompressionService);
  private functions: Functions;
  private firestore: Firestore;
  private auth: Auth;

  constructor() {
    this.functions = this.firebase.requireFunctions();
    this.firestore = this.firebase.requireFirestore();
    this.auth = this.firebase.requireAuth();
  }

  /**
   * Start complete audio processing:
   * 1. Compress audio in the browser (Web Audio API + lamejs MP3 @ 16 kbps)
   * 2. POST compressed file to uploadAudioToGemini Cloud Function → Gemini Files API → fileUri
   * 3. Call transcribeAudioFast with the fileUri
   */
  async startCompleteProcessing(
    campaignId: string,
    sessionId: string,
    audioFile: File,
    options: StartProcessingOptions,
    onProgress?: (stage: UploadStage, progress: number) => void
  ): Promise<ProcessingResult> {
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    // ── 1. Compress audio in the browser ────────────────────────────────────
    logger.info('[AudioCompleteProcessing] Compressing audio before upload...');

    const compressionResult = await this.audioCompression.compress(
      audioFile,
      (compressionProgress) => onProgress?.('compressing', compressionProgress),
    );

    if (compressionResult.skipped) {
      logger.info('[AudioCompleteProcessing] Compression skipped — uploading original file');
    } else {
      logger.info('[AudioCompleteProcessing] Compression complete', {
        ratio: compressionResult.compressionRatio.toFixed(2),
        originalMb: (compressionResult.originalSize / 1_048_576).toFixed(1),
        compressedMb: (compressionResult.compressedSize / 1_048_576).toFixed(1),
      });
    }

    // ── 2. Upload compressed blob → Gemini Files API via Cloud Function ───────
    logger.info('[AudioCompleteProcessing] Uploading to Gemini via Cloud Function...');

    onProgress?.('uploading', 0);

    const uploadFileName = replaceExtension(audioFile.name, 'mp3');
    const fileUri = await this.uploadToGemini(
      compressionResult.blob,
      compressionResult.mimeType,
      uploadFileName,
      sessionRef,
      (uploadProgress) => onProgress?.('uploading', uploadProgress),
    );

    logger.info(`[AudioCompleteProcessing] Gemini upload complete: ${fileUri}`);

    // ── 3. Persist metadata + start transcription ─────────────────────────────
    await updateDoc(sessionRef, {
      audioCompressedSizeBytes: compressionResult.compressedSize,
      audioOriginalSizeBytes: compressionResult.originalSize,
      updatedAt: new Date(),
    });

    const transcribe = httpsCallable(this.functions, 'transcribeAudioFast');
    await transcribe({
      campaignId,
      sessionId,
      fileUri,
      audioFileName: uploadFileName,
      audioFileSize: compressionResult.compressedSize,
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
   * POST the compressed audio blob to the uploadAudioToGemini Cloud Function,
   * which proxies it to the Gemini Files API and returns a fileUri.
   */
  private async uploadToGemini(
    blob: Blob,
    mimeType: string,
    fileName: string,
    sessionRef: ReturnType<typeof doc>,
    onProgress?: (progress: number) => void,
  ): Promise<string> {
    const token = await getIdToken(this.auth.currentUser!);

    // XHR is used for upload progress tracking (fetch does not support it)
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', environment.uploadAudioUrl);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('X-Mime-Type', mimeType);
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
      xhr.setRequestHeader('X-File-Size', String(blob.size));

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 90);
          onProgress?.(progress);
          void updateDoc(sessionRef, {
            progress: {
              stage: 'uploading',
              progress,
              message: `Uploading audio... ${progress}%`,
              updatedAt: new Date(),
            },
          });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const body = JSON.parse(xhr.responseText) as { fileUri?: string };
          if (body.fileUri) {
            onProgress?.(100);
            resolve(body.fileUri);
          } else {
            reject(new Error('uploadAudioToGemini did not return a fileUri'));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload network error')));
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

      xhr.send(blob);
    });
  }
}

/** Replace the file extension, e.g. "session.wav" → "session.mp3". */
function replaceExtension(fileName: string, newExt: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  const base = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${base}.${newExt}`;
}
