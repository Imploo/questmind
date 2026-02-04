/**
 * Migration service to update AI settings with feature-specific configurations
 *
 * This service provides a client-side migration that can be triggered via a button
 * to add feature-specific AI parameters:
 * - transcription: Low temperature (0.3) for accuracy
 * - storyGeneration: Medium-high temperature (0.8) for creativity
 * - podcastScript: High temperature (0.9) for conversational tone
 */

import { Injectable } from '@angular/core';
import { doc, setDoc } from 'firebase/firestore';
import { FirebaseService } from './firebase.service';

export interface AiSettings {
  features: {
    transcription: {
      model: string;
      temperature: number;
      topP: number;
      topK: number;
      maxOutputTokens: number;
    };
    storyGeneration: {
      model: string;
      temperature: number;
      topP: number;
      topK: number;
      maxOutputTokens: number;
    };
    podcastScript: {
      model: string;
      temperature: number;
      topP: number;
      topK: number;
      maxOutputTokens: number;
    };
  };
}

export interface MigrationResult {
  success: boolean;
  message: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AiSettingsMigrationService {
  constructor(private firebaseService: FirebaseService) {}

  async updateAISettings(): Promise<MigrationResult> {
    try {
      const firestore = this.firebaseService.requireFirestore();

      const newSettings: AiSettings = {
        features: {
          transcription: {
            model: 'gemini-3-flash',
            temperature: 0.1,
            topP: 1,
            topK: 40,
            maxOutputTokens: 128000
          },
          storyGeneration: {
            model: 'gemini-3-flash',
            temperature: 0.4,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 32000
          },
          podcastScript: {
            model: 'gemini-3-flash',
            temperature: 0.9,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 16000
          }
        }
      };

      // Update the settings/ai document with merge
      const settingsRef = doc(firestore, 'settings', 'ai');
      await setDoc(settingsRef, newSettings, { merge: true });

      console.log('AI settings updated successfully:');
      console.log(JSON.stringify(newSettings, null, 2));

      return {
        success: true,
        message: 'AI settings updated with feature-specific configurations'
      };
    } catch (error) {
      console.error('Error updating AI settings:', error);
      return {
        success: false,
        message: 'Failed to update AI settings',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
