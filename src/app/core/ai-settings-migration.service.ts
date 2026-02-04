/**
 * Migration service to update AI settings with feature-specific configurations
 *
 * This service calls a Cloud Function to update settings with admin privileges:
 * - transcription: Low temperature (0.1) for accuracy
 * - storyGeneration: Medium temperature (0.4) for creativity
 * - podcastScript: High temperature (0.9) for conversational tone
 */

import { Injectable } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
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
      const functions = this.firebaseService.requireFunctions();

      // Call the Cloud Function to update AI settings
      const migrateAiSettings = httpsCallable(functions, 'migrateAiSettings');
      const result = await migrateAiSettings();

      const data = result.data as { success: boolean; message: string; settings?: AiSettings };

      console.log('AI settings updated successfully:');
      if (data.settings) {
        console.log(JSON.stringify(data.settings, null, 2));
      }

      return {
        success: data.success,
        message: data.message
      };
    } catch (error: any) {
      console.error('Error updating AI settings:', error);

      // Handle Firebase Functions errors
      let errorMessage = 'Failed to update AI settings';
      if (error?.code === 'unauthenticated') {
        errorMessage = 'You must be signed in to run migrations';
      } else if (error?.code === 'permission-denied') {
        errorMessage = 'You do not have permission to run migrations';
      } else if (error?.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
