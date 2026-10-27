import { Injectable, inject } from '@angular/core';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type FirebaseStorage
} from 'firebase/storage';
import { AuthService } from '../auth/auth.service';
import { FirebaseService } from '../core/firebase.service';
import { AudioCompressionService, toNormalizationOptions, type CompressionResult } from '../audio/services/audio-compression.service';
import { AiSettingsService } from '../core/services/ai-settings.service';
import { CampaignService } from './campaign.service';
import { CampaignVoiceIntro } from './campaign.models';
import * as logger from '../shared/logger';

/** Maximum size of the file the user selects (before compression). */
export const VOICE_INTRO_MAX_SOURCE_BYTES = 100 * 1024 * 1024;
/** Maximum size of the uploaded (compressed) file — mirrors storage.rules. */
export const VOICE_INTRO_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Maximum length of the introduction round. */
export const VOICE_INTRO_MAX_DURATION_SEC = 5 * 60;

/** Share of the overall progress spent on client-side compression. */
const COMPRESSION_PROGRESS_SHARE = 40;

/**
 * Manages the campaign voice intro (ticket #68): a recording in which everyone at
 * the table introduces themselves, used by the backend as a voice reference for
 * speaker attribution during transcription.
 */
@Injectable({ providedIn: 'root' })
export class CampaignVoiceIntroService {
  private readonly firebase = inject(FirebaseService);
  private readonly authService = inject(AuthService);
  private readonly campaignService = inject(CampaignService);
  private readonly compression = inject(AudioCompressionService);
  private readonly aiSettings = inject(AiSettingsService);

  /** Returns an error message, or null when the file can be used. */
  validateFile(file: File): string | null {
    if (!file.type.startsWith('audio/')) {
      return 'Unsupported file type. Please choose an audio file (MP3, WAV, M4A, OGG).';
    }
    if (file.size > VOICE_INTRO_MAX_SOURCE_BYTES) {
      return 'File is too large. Maximum size is 100MB.';
    }
    return null;
  }

  /**
   * Compress, upload and register a new voice intro. The previous intro (if any)
   * is deleted only after the campaign points at the new one.
   */
  async upload(
    campaignId: string,
    file: File,
    previous: CampaignVoiceIntro | undefined,
    onProgress: (progress: number) => void
  ): Promise<CampaignVoiceIntro> {
    const storage = this.requireStorage();
    const user = this.authService.currentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const validationError = this.validateFile(file);
    if (validationError) {
      throw new Error(validationError);
    }

    let compressed: CompressionResult;
    try {
      compressed = await this.compression.compress(
        file,
        (p) => onProgress(Math.round((p / 100) * COMPRESSION_PROGRESS_SHARE)),
        toNormalizationOptions(this.aiSettings.getAudioNormalizationConfig())
      );
    } catch (error: unknown) {
      logger.error('[VoiceIntro] Could not decode audio file:', error);
      throw new Error('Could not read this audio file. Please try a different format.');
    }

    if (compressed.durationSeconds > VOICE_INTRO_MAX_DURATION_SEC) {
      throw new Error('The introduction is too long. Keep it under 5 minutes.');
    }
    if (compressed.blob.size > VOICE_INTRO_MAX_UPLOAD_BYTES) {
      throw new Error('The audio file is too large after compression (max 25MB).');
    }

    const mimeType = compressed.skipped ? (file.type || 'audio/mpeg') : compressed.mimeType;
    const fileName = compressed.skipped ? file.name : replaceExtension(file.name, 'mp3');
    const storagePath = `campaigns/${campaignId}/voice-intro/${Date.now()}-${sanitizeFileName(fileName)}`;

    await this.uploadBlob(storage, storagePath, compressed.blob, mimeType, (p) =>
      onProgress(COMPRESSION_PROGRESS_SHARE + Math.round((p / 100) * (100 - COMPRESSION_PROGRESS_SHARE)))
    );

    const voiceIntro: CampaignVoiceIntro = {
      storagePath,
      fileName,
      mimeType,
      sizeBytes: compressed.blob.size,
      durationSec: Math.round(compressed.durationSeconds),
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.uid
    };
    await this.campaignService.updateVoiceIntro(campaignId, voiceIntro);

    if (previous && previous.storagePath !== storagePath) {
      await this.deleteFile(storage, previous.storagePath);
    }

    return voiceIntro;
  }

  /** Remove the voice intro from the campaign and delete its file. */
  async remove(campaignId: string, current: CampaignVoiceIntro): Promise<void> {
    const storage = this.requireStorage();
    await this.campaignService.updateVoiceIntro(campaignId, null);
    await this.deleteFile(storage, current.storagePath);
  }

  /** Download URL for playback in the settings page. */
  async getPlaybackUrl(voiceIntro: CampaignVoiceIntro): Promise<string> {
    return getDownloadURL(ref(this.requireStorage(), voiceIntro.storagePath));
  }

  private uploadBlob(
    storage: FirebaseStorage,
    storagePath: string,
    blob: Blob,
    contentType: string,
    onProgress: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(ref(storage, storagePath), blob, { contentType });
      task.on(
        'state_changed',
        (snapshot) => onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
        (error) => reject(error),
        () => resolve()
      );
    });
  }

  /** Best-effort cleanup: an orphaned file is harmless, so failures are only logged. */
  private async deleteFile(storage: FirebaseStorage, storagePath: string): Promise<void> {
    try {
      await deleteObject(ref(storage, storagePath));
    } catch (error: unknown) {
      logger.error('[VoiceIntro] Could not delete voice intro file:', { storagePath, error });
    }
  }

  private requireStorage(): FirebaseStorage {
    if (!this.firebase.storage) {
      throw new Error('Firebase Storage is not configured.');
    }
    return this.firebase.storage;
  }
}

function replaceExtension(fileName: string, extension: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${base}.${extension}`;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}
