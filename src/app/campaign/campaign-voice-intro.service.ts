import { Injectable, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../core/firebase.service';
import { AudioStorageService, sanitizeFileName } from '../audio/services/audio-storage.service';
import { isWavFile, prepareForUpload } from '../audio/services/wav-to-mp3';
import { CampaignService } from './campaign.service';
import { CampaignVoiceIntro } from './campaign.models';
import * as logger from '../shared/logger';

/** Maximum size of a selected file that is uploaded as-is (M4A, MP3, …). */
export const VOICE_INTRO_MAX_SOURCE_BYTES = 100 * 1024 * 1024;
/** WAV is compressed in the browser first, so a larger file is fine. */
export const VOICE_INTRO_MAX_WAV_BYTES = 500 * 1024 * 1024;

/** Share of the overall progress spent on preparing (WAV compression) and uploading. */
const PREPARE_PROGRESS_SHARE = 30;
const UPLOAD_PROGRESS_SHARE = 60;

/**
 * Manages the campaign voice intro (ticket #68): a recording in which everyone at
 * the table introduces themselves, used by the backend as a voice reference for
 * speaker attribution during transcription.
 *
 * Goes through the same pipeline as session audio: WAV is compressed in the
 * browser, the file is uploaded as a source, and the backend normalizes and
 * encodes it (processVoiceIntro), sets it on the campaign and removes the
 * previous intro.
 */
@Injectable({ providedIn: 'root' })
export class CampaignVoiceIntroService {
  private readonly firebase = inject(FirebaseService);
  private readonly campaignService = inject(CampaignService);
  private readonly audioStorage = inject(AudioStorageService);

  /** Returns an error message, or null when the file can be used. */
  validateFile(file: File): string | null {
    const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(file.name);
    if (!isAudio) {
      return 'Unsupported file type. Please choose an audio file (MP3, WAV, M4A, OGG).';
    }
    if (isWavFile(file) ? file.size > VOICE_INTRO_MAX_WAV_BYTES : file.size > VOICE_INTRO_MAX_SOURCE_BYTES) {
      return isWavFile(file)
        ? 'File is too large. Maximum size is 500MB for WAV.'
        : 'File is too large. Maximum size is 100MB.';
    }
    return null;
  }

  /** Upload a new voice intro and let the backend process and register it. */
  async upload(
    campaignId: string,
    file: File,
    onProgress: (progress: number) => void
  ): Promise<CampaignVoiceIntro> {
    const validationError = this.validateFile(file);
    if (validationError) {
      throw new Error(validationError);
    }

    const prepared = await prepareForUpload(file, (p) =>
      onProgress(Math.round((p / 100) * PREPARE_PROGRESS_SHARE))
    );

    const sourcePath = `campaigns/${campaignId}/voice-intro/source/${Date.now()}-${sanitizeFileName(prepared.fileName)}`;
    await this.audioStorage.uploadFile(prepared.blob, sourcePath, prepared.fileName, (bytes) =>
      onProgress(PREPARE_PROGRESS_SHARE + Math.round((bytes / prepared.blob.size) * UPLOAD_PROGRESS_SHARE))
    );

    const process = httpsCallable<{ campaignId: string; sourcePath: string }, CampaignVoiceIntro>(
      this.firebase.requireFunctions(),
      'processVoiceIntro'
    );
    const result = await process({ campaignId, sourcePath });
    onProgress(100);
    return result.data;
  }

  /** Remove the voice intro from the campaign and delete its file. */
  async remove(campaignId: string, current: CampaignVoiceIntro): Promise<void> {
    await this.campaignService.updateVoiceIntro(campaignId, null);
    // Best-effort cleanup: an orphaned file is harmless, so failures are only logged.
    await this.audioStorage.deleteFile(current.storagePath).catch((error: unknown) =>
      logger.error('[VoiceIntro] Could not delete voice intro file:', { storagePath: current.storagePath, error })
    );
  }

  /** Download URL for playback in the settings page. */
  getPlaybackUrl(voiceIntro: CampaignVoiceIntro): Promise<string> {
    return this.audioStorage.getDownloadUrl(voiceIntro.storagePath);
  }
}
