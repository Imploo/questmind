import {inject, Injectable} from '@angular/core';
import {type Functions, httpsCallable} from 'firebase/functions';
import {doc, type DocumentReference, type Firestore, updateDoc} from 'firebase/firestore';
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
   *
   * Unified progress ranges:
   *   Compressing: 0–60%
   *   Uploading:  60–70%
   *   (Transcribing 70-80% and Generating Story 80-100% are handled by backend)
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

    let lastFirestoreWrite = 0;
    const compressionResult = await this.audioCompression.compress(
      audioFile,
      (compressionProgress) => {
        onProgress?.('compressing', compressionProgress);
        // Throttled Firestore write (every 2s)
        const now = Date.now();
        if (now - lastFirestoreWrite >= 2000 || compressionProgress >= 100) {
          lastFirestoreWrite = now;
          const overallProgress = Math.round(compressionProgress * 0.6);
          this.writeProgress(sessionRef, 'compressing', overallProgress,
            `Compressing audio... ${Math.round(compressionProgress)}%`);
        }
      },
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

    // ── 2. Upload + transcribe ──────────────────────────────────────────────
    return this.uploadAndTranscribe(
      campaignId,
      sessionId,
      compressionResult.blob,
      replaceExtension(audioFile.name, 'mp3'),
      { originalSize: compressionResult.originalSize, compressedSize: compressionResult.compressedSize },
      options,
      (uploadProgress) => onProgress?.('uploading', uploadProgress),
    );
  }

  /**
   * Upload a pre-compressed audio blob and start transcription.
   * Use this when compression is handled externally (e.g. multi-file concatenation).
   */
  async uploadAndTranscribe(
    campaignId: string,
    sessionId: string,
    blob: Blob,
    fileName: string,
    sizeInfo: { originalSize: number; compressedSize: number },
    options: StartProcessingOptions,
    onProgress?: (progress: number) => void,
  ): Promise<ProcessingResult> {
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );

    logger.info('[AudioCompleteProcessing] Uploading to Gemini via Cloud Function...');

    onProgress?.(0);

    const fileUri = await this.uploadToGemini(
      blob,
      'audio/mpeg',
      fileName,
      sessionRef,
      (uploadProgress) => onProgress?.(uploadProgress),
    );

    logger.info(`[AudioCompleteProcessing] Gemini upload complete: ${fileUri}`);

    await updateDoc(sessionRef, {
      audioCompressedSizeBytes: sizeInfo.compressedSize,
      audioOriginalSizeBytes: sizeInfo.originalSize,
      updatedAt: new Date(),
    });

    const transcribe = httpsCallable(this.functions, 'transcribeAudioFast');
    await transcribe({
      campaignId,
      sessionId,
      fileUri,
      audioFileName: fileName,
      audioFileSize: sizeInfo.compressedSize,
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
   * Write a failure to Firestore progress field.
   */
  async writeFailure(campaignId: string, sessionId: string, error: string): Promise<void> {
    const sessionRef = doc(
      this.firestore,
      `campaigns/${campaignId}/audioSessions/${sessionId}`
    );
    await updateDoc(sessionRef, {
      progress: {
        stage: 'failed',
        progress: 0,
        message: `Failed: ${error}`,
        error,
        updatedAt: new Date(),
      },
      status: 'failed',
    });
  }

  /**
   * POST the compressed audio blob to the uploadAudioToGemini Cloud Function,
   * which proxies it to the Gemini Files API and returns a fileUri.
   *
   * Upload progress maps to 60–70% of unified progress range.
   */
  private async uploadToGemini(
    blob: Blob,
    mimeType: string,
    fileName: string,
    sessionRef: DocumentReference,
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
          const uploadPercent = Math.round((event.loaded / event.total) * 100);
          onProgress?.(uploadPercent);
          // Map upload 0-100% to unified 60-70%
          const overallProgress = 60 + Math.round((event.loaded / event.total) * 10);
          this.writeProgress(sessionRef, 'uploading', overallProgress,
            `Uploading audio... ${uploadPercent}%`);
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

  private writeProgress(
    sessionRef: DocumentReference,
    stage: string,
    progress: number,
    message: string,
  ): void {
    void updateDoc(sessionRef, {
      progress: {
        stage,
        progress,
        message,
        updatedAt: new Date(),
      },
    });
  }
}

/** Replace the file extension, e.g. "session.wav" → "session.mp3". */
function replaceExtension(fileName: string, newExt: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  const base = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${base}.${newExt}`;
}
