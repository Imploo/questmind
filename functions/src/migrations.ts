/**
 * Callable Cloud Functions for running database migrations
 * These functions run with admin privileges to update protected collections
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Callable function to update AI settings with feature-specific configurations
 *
 * Security: Requires authentication. Add admin role check if needed.
 */
export const migrateAiSettings = onCall(async (request) => {
  // Require authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to run migrations');
  }

  // Optional: Add admin role check here
  // const adminRole = await checkAdminRole(request.auth.uid);
  // if (!adminRole) {
  //   throw new HttpsError('permission-denied', 'User must be an admin to run migrations');
  // }

  const db = getFirestore();

  const newSettings = {
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

  try {
    await db.doc('settings/ai').set(newSettings, { merge: true });

    console.log('AI settings updated successfully by user:', request.auth.uid);
    console.log(JSON.stringify(newSettings, null, 2));

    return {
      success: true,
      message: 'AI settings updated with feature-specific configurations',
      settings: newSettings
    };
  } catch (error) {
    console.error('Error updating AI settings:', error);
    throw new HttpsError('internal', 'Failed to update AI settings', error);
  }
});
