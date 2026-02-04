/**
 * Migration script to update AI settings with feature-specific configurations
 *
 * Run this script after deployment to add feature-specific AI parameters:
 * - transcription: Low temperature (0.3) for accuracy
 * - storyGeneration: Medium-high temperature (0.8) for creativity
 * - podcastScript: High temperature (0.9) for conversational tone
 *
 * Usage:
 * firebase functions:shell
 * > updateAISettings()
 */

import { getFirestore } from 'firebase-admin/firestore';

export async function updateAISettings() {
  const db = getFirestore();

  const newSettings = {
    features: {
      transcription: {
        model: 'gemini-3-flash',
        temperature: 0.3,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 128000
      },
      storyGeneration: {
        model: 'gemini-3-flash',
        temperature: 0.8,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 32000
      },
      podcastScript: {
        model: 'gemini-3-flash',
        temperature: 0.9,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192
      }
    }
  };

  await db.doc('settings/ai').set(newSettings, { merge: true });

  console.log('AI settings updated successfully:');
  console.log(JSON.stringify(newSettings, null, 2));

  return {
    success: true,
    message: 'AI settings updated with feature-specific configurations'
  };
}
