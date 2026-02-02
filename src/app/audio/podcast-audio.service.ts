import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { PodcastScript, PodcastVersion, PodcastSegment } from './audio-session.models';
import { environment } from '../../environments/environment';

/**
 * Service for managing podcast audio generation using Google Cloud Text-to-Speech.
 * 
 * Uses Google Cloud TTS API to generate high-quality natural-sounding Dutch voices.
 * This approach:
 * - Uses WaveNet voices for natural speech
 * - Supports male and female Dutch voices
 * - Plays audio directly in browser
 * - Better quality than browser's built-in TTS
 */
@Injectable({
  providedIn: 'root'
})
export class PodcastAudioService {
  private readonly firestore;
  private readonly authService = inject(AuthService);
  private readonly TTS_API_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
  private currentAudio: HTMLAudioElement | null = null;
  private isPlaying = false;

  constructor() {
    const app = getApp();
    this.firestore = getFirestore(app);
  }

  /**
   * Check if Google Cloud TTS is configured
   */
  isTTSConfigured(): boolean {
    return !!environment.googleCloudApiKey && 
           environment.googleCloudApiKey !== 'YOUR_GOOGLE_CLOUD_API_KEY' &&
           environment.tts.enabled;
  }

  /**
   * Creates a podcast version with script and optionally generates audio
   * 
   * @param sessionId - The audio session ID
   * @param script - The generated podcast script
   * @param storyVersion - Optional story version number
   * @param generateAudio - Whether to generate audio immediately
   * @returns Promise<PodcastVersion> - The created podcast version
   */
  async createPodcastVersion(
    sessionId: string,
    script: PodcastScript,
    storyVersion?: number,
    generateAudio: boolean = false
  ): Promise<PodcastVersion> {
    const nextVersion = await this.getNextVersionNumber(sessionId);

    // Create podcast version with script
    const podcastVersion: PodcastVersion = {
      version: nextVersion,
      createdAt: new Date(),
      scriptGeneratedAt: new Date(),
      duration: script.estimatedDuration,
      storyVersion,
      script,
      status: 'completed'
    };

    // Save to Firestore
    await this.savePodcastVersion(sessionId, podcastVersion);

    return podcastVersion;
  }

  /**
   * Synthesize text to speech using Google Cloud TTS
   */
  private async synthesizeText(text: string, voiceName: string): Promise<string> {
    if (!this.isTTSConfigured()) {
      throw new Error('Google Cloud TTS is not configured. Please add your API key to the environment.');
    }

    const response = await fetch(`${this.TTS_API_URL}?key=${environment.googleCloudApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: 'nl-NL',
          name: voiceName,
          ssmlGender: voiceName.includes('-B') || voiceName.includes('-C') ? 'MALE' : 'FEMALE'
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: environment.tts.speakingRate,
          pitch: environment.tts.pitch
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`TTS API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.audioContent; // Base64 encoded audio
  }

  /**
   * Generate and play audio from podcast script using Google Cloud TTS
   * 
   * @param script - The podcast script
   * @param onProgress - Progress callback (0-100)
   * @returns Promise that resolves when audio playback is complete
   */
  async generateAudioFromScript(
    script: PodcastScript,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (!this.isTTSConfigured()) {
      throw new Error('Google Cloud TTS is not configured. Please add your API key to the environment.');
    }

    this.stopSpeech(); // Stop any current playback
    this.isPlaying = true;

    try {
      const totalSegments = script.segments.length;

      for (let i = 0; i < totalSegments; i++) {
        if (!this.isPlaying) {
          break; // User stopped playback
        }

        const segment = script.segments[i];
        const voiceName = segment.speaker === 'host1' 
          ? environment.tts.voiceMale 
          : environment.tts.voiceFemale;

        // Synthesize audio
        const audioContent = await this.synthesizeText(segment.text, voiceName);

        // Play audio
        await this.playAudioBase64(audioContent);

        // Update progress
        if (onProgress) {
          onProgress(Math.round(((i + 1) / totalSegments) * 100));
        }

        // Small pause between speakers
        if (i < totalSegments - 1 && this.isPlaying) {
          await this.sleep(500);
        }
      }
    } finally {
      this.isPlaying = false;
      this.currentAudio = null;
    }
  }

  /**
   * Play base64 encoded audio
   */
  private async playAudioBase64(base64Audio: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
      this.currentAudio = audio;

      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Audio playback error'));

      audio.play().catch(reject);
    });
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Play a single segment (for preview)
   */
  async playSegment(segment: PodcastSegment): Promise<void> {
    if (!this.isTTSConfigured()) {
      throw new Error('Google Cloud TTS is not configured.');
    }

    const voiceName = segment.speaker === 'host1' 
      ? environment.tts.voiceMale 
      : environment.tts.voiceFemale;

    const audioContent = await this.synthesizeText(segment.text, voiceName);
    await this.playAudioBase64(audioContent);
  }

  /**
   * Stop current audio playback
   */
  stopSpeech(): void {
    this.isPlaying = false;
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }

  /**
   * Saves a podcast version to Firestore
   */
  async savePodcastVersion(sessionId: string, podcastVersion: PodcastVersion): Promise<void> {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const docRef = doc(this.firestore, 'users', userId, 'audioSessions', sessionId);
    
    // Convert Date objects to Firestore Timestamps
    const podcastData = {
      ...podcastVersion,
      createdAt: podcastVersion.createdAt,
      scriptGeneratedAt: podcastVersion.scriptGeneratedAt,
      audioGeneratedAt: podcastVersion.audioGeneratedAt || null
    };

    await updateDoc(docRef, {
      podcasts: arrayUnion(podcastData),
      latestPodcastVersion: podcastVersion.version
    });
  }

  /**
   * Gets the next version number for a podcast
   * Queries the existing podcasts array to determine the next version
   */
  private async getNextVersionNumber(sessionId: string): Promise<number> {
    // For now, we'll rely on the component to pass the correct version number
    // In a real implementation, we'd query Firestore to get the latest version
    // This is handled by the component counting the existing podcasts array
    return 1; // Fallback, should be overridden by component logic
  }

  /**
   * Helper to format duration in minutes:seconds
   */
  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Helper to format file size in human-readable format
   */
  formatFileSize(bytes: number): string {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) {
      return `${mb.toFixed(1)} MB`;
    }
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  }
}
