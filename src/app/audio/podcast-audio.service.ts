import { Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { PodcastScript } from './audio-session.models';

/**
 * Service for generating and playing stored podcast MP3 files.
 */
@Injectable({
  providedIn: 'root'
})
export class PodcastAudioService {
  private readonly functions = getFunctions(getApp(), 'europe-west1');
  private currentAudio: HTMLAudioElement | null = null;

  /**
   * Generate a complete MP3 via Cloud Function using Gemini 2.5 Flash TTS.
   */
  async generatePodcastMP3(
    sessionId: string,
    version: number,
    script: PodcastScript,
    onProgress?: (progress: number, message: string) => void
  ): Promise<{ audioUrl: string; fileSize: number; duration: number }> {
    if (onProgress) {
      onProgress(0, 'Starting audio generation...');
    }

    try {
      const generateAudio = httpsCallable<
        {
          sessionId: string;
          version: number;
          script: PodcastScript;
        },
        {
          success: boolean;
          audioUrl: string;
          fileSize: number;
          duration: number;
        }
      >(this.functions, 'generatePodcastAudio');

      if (onProgress) {
        onProgress(20, 'Synthesizing with Gemini 2.5 Flash TTS...');
      }

      const result = await generateAudio({
        sessionId,
        version,
        script
      });

      if (!result.data?.success) {
        throw new Error('Failed to generate audio');
      }

      if (onProgress) {
        onProgress(100, 'Audio ready!');
      }

      return {
        audioUrl: result.data.audioUrl,
        fileSize: result.data.fileSize,
        duration: result.data.duration
      };
    } catch (error) {
      console.error('Error generating podcast MP3:', error);
      throw new Error('Failed to generate podcast audio. Please try again.');
    }
  }

  /**
   * Play a single segment (for preview)
   */
  playPodcastMP3(audioUrl: string): HTMLAudioElement {
    this.stopPlayback();
    const audio = new Audio(audioUrl);
    this.currentAudio = audio;
    void audio.play();
    return audio;
  }

  downloadPodcastMP3(audioUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = filename;
    link.click();
  }

  stopPlayback(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }
}
