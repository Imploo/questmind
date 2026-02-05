import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type FirebaseStorage
} from 'firebase/storage';

import { StorageMetadata, UploadProgress } from './audio-session.models';
import { FirebaseService } from '../../core/firebase.service';

const MAX_FILE_BYTES = 500 * 1024 * 1024;
const SUPPORTED_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg'
];

@Injectable({
  providedIn: 'root'
})
export class AudioStorageService {
  private readonly storage: FirebaseStorage | null;

  constructor(private readonly firebase: FirebaseService) {
    this.storage = this.firebase.storage;
  }

  validateFile(file: File): string | null {
    if (!SUPPORTED_TYPES.includes(file.type)) {
      return 'Unsupported file type. Please use MP3, WAV, M4A, or OGG.';
    }
    if (file.size > MAX_FILE_BYTES) {
      return 'File is too large. Maximum size is 500MB.';
    }
    return null;
  }

  uploadAudioFile(file: File, campaignId: string, sessionId: string): Observable<UploadProgress> {
    if (!this.storage) {
      return throwError(() => new Error('Firebase Storage is not configured.'));
    }
    const storagePath = this.getStoragePath(campaignId, sessionId, file.name);
    const storageRef = ref(this.storage, storagePath);

    return new Observable<UploadProgress>(observer => {
      const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

      const unsubscribe = uploadTask.on(
        'state_changed',
        snapshot => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          observer.next({
            sessionId,
            progress,
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
            status: snapshot.bytesTransferred >= snapshot.totalBytes ? 'completed' : 'uploading'
          });
        },
        error => {
          observer.error(error);
        },
        () => {
          observer.complete();
        }
      );

      return () => unsubscribe();
    });
  }

  async buildStorageMetadata(file: File, campaignId: string, sessionId: string): Promise<StorageMetadata> {
    if (!this.storage) {
      throw new Error('Firebase Storage is not configured.');
    }

    const storagePath = this.getStoragePath(campaignId, sessionId, file.name);
    const storageRef = ref(this.storage, storagePath);
    const downloadUrl = await getDownloadURL(storageRef);

    return {
      sessionId,
      campaignId,
      storagePath,
      downloadUrl,
      fileSize: file.size,
      contentType: file.type,
      uploadedAt: new Date().toISOString()
    };
  }

  getStoragePath(campaignId: string, sessionId: string, fileName: string): string {
    return `campaigns/${campaignId}/audio/${sessionId}/${fileName}`;
  }

  async fetchAudioFromUrl(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio from URL: ${response.status} ${response.statusText}`);
    }
    return await response.blob();
  }
}
