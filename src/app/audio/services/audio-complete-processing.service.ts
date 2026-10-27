import {inject, Injectable} from '@angular/core';
import {type Functions, httpsCallable} from 'firebase/functions';
import {FirebaseService} from '../../core/firebase.service';
import {AudioStorageService} from './audio-storage.service';
import {AudioSessionStateService} from './audio-session-state.service';
import {PreparedUpload, isWavFile, prepareForUpload} from './wav-to-mp3';
import {AudioRecording, AudioSource} from './audio-session.models';
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

/** Writes to one session document. */
type SessionPatcher = (patch: Record<string, unknown>) => Promise<void>;

@Injectable({
  providedIn: 'root'
})
export class AudioCompleteProcessingService {
  private firebase = inject(FirebaseService);
  private audioStorage = inject(AudioStorageService);
  private sessionState = inject(AudioSessionStateService);
  private functions: Functions;

  constructor() {
    this.functions = this.firebase.requireFunctions();
  }

  /**
   * Start complete audio processing for one or more recordings:
   * 1. WAV files are compressed in the browser (streaming, mono 24 kHz MP3) so
   *    the upload is 10–20× smaller. Other formats (M4A, MP3, …) are already
   *    compressed and are uploaded as-is.
   * 2. Upload the files to the session's `source/` folder in Firebase Storage.
   * 3. Call processSessionAudio. From here everything runs in the backend, so
   *    the browser can be closed: ffmpeg joins, downmixes, normalizes and
   *    encodes the files into the stored recording, which is then transcribed
   *    and turned into a story — each step its own task.
   *
   * Unified progress ranges:
   *   Compressing (WAV only): 0–25%
   *   Uploading:             25–50%
   *   (Processing 50-70%, Transcribing 70-80% and Generating Story 80-100% run in the backend)
   */
  async startCompleteProcessing(
    campaignId: string,
    sessionId: string,
    audioFiles: File[],
    options: StartProcessingOptions,
    onProgress?: (stage: UploadStage, progress: number) => void
  ): Promise<ProcessingResult> {
    if (audioFiles.length === 0) {
      throw new Error('startCompleteProcessing requires at least one audio file');
    }

    const patchSession: SessionPatcher = (patch) =>
      this.sessionState.patchSessionDoc(campaignId, sessionId, patch);

    // ── 1. Compress WAV files in the browser ────────────────────────────────
    const prepared = await this.prepareUploads(audioFiles, (compressionProgress) => {
      onProgress?.('compressing', compressionProgress);
      this.writeProgressThrottled(patchSession, 'compressing', Math.round(compressionProgress * 0.25),
        `Compressing WAV audio... ${compressionProgress}%`, compressionProgress >= 100);
    });

    // ── 2. Upload the files ─────────────────────────────────────────────────
    const totalBytes = prepared.reduce((sum, p) => sum + p.blob.size, 0);
    let uploadedBefore = 0;
    const sources: AudioSource[] = [];
    for (let i = 0; i < prepared.length; i++) {
      const { blob, fileName } = prepared[i];
      sources.push(await this.audioStorage.uploadSource(blob, campaignId, sessionId, i, fileName, (bytes) => {
        const uploadProgress = Math.round(((uploadedBefore + bytes) / totalBytes) * 100);
        onProgress?.('uploading', uploadProgress);
        this.writeProgressThrottled(patchSession, 'uploading', 25 + Math.round(uploadProgress * 0.25),
          `Uploading audio... ${uploadProgress}%`, uploadProgress >= 100);
      }));
      uploadedBefore += blob.size;
    }

    await patchSession({
      audioSources: sources,
      audioOriginalSizeBytes: audioFiles.reduce((sum, f) => sum + f.size, 0),
      updatedAt: new Date(),
    });

    // ── 3. Hand over to the backend ─────────────────────────────────────────
    await this.processUploadedSources(campaignId, sessionId, options.userCorrections);

    return { sessionId };
  }

  /**
   * Start backend processing of the session's uploaded sources (also used to
   * retry when processing failed — the sources are kept until it succeeds).
   */
  async processUploadedSources(
    campaignId: string,
    sessionId: string,
    userCorrections?: string,
  ): Promise<{ success: boolean; message: string }> {
    const process = httpsCallable<
      { campaignId: string; sessionId: string; userCorrections?: string },
      { success: boolean; message: string }
    >(this.functions, 'processSessionAudio');
    const result = await process({ campaignId, sessionId, userCorrections });
    return result.data;
  }

  /**
   * Start (re-)transcription of a session from its stored recording. The
   * backend cuts it into segments using the current segmentation settings.
   */
  async transcribeStoredRecording(
    campaignId: string,
    sessionId: string,
    recording: AudioRecording,
    userCorrections?: string,
  ): Promise<{ success: boolean; message: string }> {
    const transcribe = httpsCallable<
      {
        campaignId: string;
        sessionId: string;
        storagePath: string;
        audioFileName: string;
        audioFileSize: number;
        userCorrections?: string;
      },
      { success: boolean; message: string }
    >(this.functions, 'transcribeAudioFast');

    const result = await transcribe({
      campaignId,
      sessionId,
      storagePath: recording.storagePath,
      audioFileName: recording.fileName,
      audioFileSize: recording.sizeBytes,
      userCorrections,
    });
    return result.data;
  }

  /**
   * Write a failure to Firestore progress field.
   */
  async writeFailure(campaignId: string, sessionId: string, error: string): Promise<void> {
    await this.sessionState.patchSessionDoc(campaignId, sessionId, {
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

  private lastProgressWrite = 0;

  /** Firestore progress write, at most once per second (always when `force`). */
  private writeProgressThrottled(
    patchSession: SessionPatcher,
    stage: string,
    progress: number,
    message: string,
    force: boolean,
  ): void {
    const now = Date.now();
    if (force || now - this.lastProgressWrite >= 1000) {
      this.lastProgressWrite = now;
      this.writeProgress(patchSession, stage, progress, message);
    }
  }

  /** Prepare every file for upload; progress (0–100) is weighted by the size of the WAV files. */
  private async prepareUploads(
    files: File[],
    onProgress: (progress: number) => void,
  ): Promise<PreparedUpload[]> {
    const wavBytes = files.filter(isWavFile).reduce((sum, f) => sum + f.size, 0);
    let doneBytes = 0;
    const prepared: PreparedUpload[] = [];

    for (const file of files) {
      const upload = await prepareForUpload(file, (p) =>
        onProgress(Math.round(((doneBytes + (p / 100) * file.size) / wavBytes) * 100))
      );
      if (isWavFile(file)) {
        doneBytes += file.size;
        logger.info('[AudioCompleteProcessing] Prepared WAV for upload', {
          file: file.name,
          compressed: upload.blob !== file,
          originalMb: (file.size / 1_048_576).toFixed(1),
          uploadMb: (upload.blob.size / 1_048_576).toFixed(1),
        });
      }
      prepared.push(upload);
    }
    return prepared;
  }

  private writeProgress(
    patchSession: SessionPatcher,
    stage: string,
    progress: number,
    message: string,
  ): void {
    void patchSession({
      progress: {
        stage,
        progress,
        message,
        updatedAt: new Date(),
      },
    }).catch((error: unknown) => logger.warn('[AudioCompleteProcessing] Failed to write progress', error));
  }
}
