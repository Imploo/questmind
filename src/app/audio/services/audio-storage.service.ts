import { Injectable, inject } from '@angular/core';
import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref,
  uploadBytesResumable,
  type FirebaseStorage
} from 'firebase/storage';

import { AudioSource } from './audio-session.models';
import { FirebaseService } from '../../core/firebase.service';

/** Content types by extension, for files the browser reports without a MIME type. */
const AUDIO_CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
};

/**
 * Session audio in Firebase Storage: the uploaded source files (processed by the
 * backend) and the processed recording used for playback and re-transcription.
 */
@Injectable({
  providedIn: 'root'
})
export class AudioStorageService {
  private readonly firebase = inject(FirebaseService);

  /** Upload one source file to the session's `source/` folder. */
  async uploadSource(
    blob: Blob,
    campaignId: string,
    sessionId: string,
    index: number,
    fileName: string,
    onProgress?: (bytesTransferred: number) => void
  ): Promise<AudioSource> {
    const storagePath = `${this.sessionFolder(campaignId, sessionId)}/source/${index}-${sanitizeFileName(fileName)}`;
    const mimeType = await this.uploadFile(blob, storagePath, fileName, onProgress);
    return { storagePath, fileName, mimeType, sizeBytes: blob.size };
  }

  /**
   * Upload an audio blob to `storagePath` (resumable), reporting bytes
   * transferred. Returns the content type it was stored with.
   */
  async uploadFile(
    blob: Blob,
    storagePath: string,
    fileName: string,
    onProgress?: (bytesTransferred: number) => void
  ): Promise<string> {
    const mimeType = resolveContentType(blob, fileName);
    const uploadTask = uploadBytesResumable(ref(this.requireStorage(), storagePath), blob, {
      contentType: mimeType
    });

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        snapshot => onProgress?.(snapshot.bytesTransferred),
        reject,
        () => resolve()
      );
    });
    return mimeType;
  }

  getDownloadUrl(storagePath: string): Promise<string> {
    return getDownloadURL(ref(this.requireStorage(), storagePath));
  }

  deleteFile(storagePath: string): Promise<void> {
    return deleteObject(ref(this.requireStorage(), storagePath));
  }

  /** Delete everything stored for a session (recording and any leftover sources). */
  async deleteSessionAudio(campaignId: string, sessionId: string): Promise<void> {
    const storage = this.requireStorage();
    const folder = this.sessionFolder(campaignId, sessionId);
    const [root, sources] = await Promise.all([
      listAll(ref(storage, folder)),
      listAll(ref(storage, `${folder}/source`)),
    ]);
    await Promise.all([...root.items, ...sources.items].map(item => deleteObject(item)));
  }

  private sessionFolder(campaignId: string, sessionId: string): string {
    return `campaigns/${campaignId}/audio/${sessionId}`;
  }

  private requireStorage(): FirebaseStorage {
    if (!this.firebase.storage) {
      throw new Error('Firebase Storage is not configured.');
    }
    return this.firebase.storage;
  }
}

function resolveContentType(blob: Blob, fileName: string): string {
  if (blob.type.startsWith('audio/')) {
    return blob.type;
  }
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_CONTENT_TYPES[extension] ?? 'audio/mpeg';
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^\w.-]+/g, '_');
}
