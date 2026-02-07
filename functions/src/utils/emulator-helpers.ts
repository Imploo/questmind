/**
 * Utility helpers for Firebase Emulator testing
 */

import * as logger from './logger';
import { CallableRequest } from 'firebase-functions/v2/https';

/**
 * Checks if the function is running in the Firebase Emulator
 */
export function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}

/**
 * Ensures auth context exists for emulator testing
 * In production, auth will be enforced by Firebase
 * In emulator, provides a test user if no auth is present
 */
export function ensureAuthForTesting<T>(request: CallableRequest<T>): void {
  if (isEmulator() && !request.auth?.uid) {
    logger.warn('⚠️  EMULATOR MODE: Using test auth context');
    // Create a test auth context
    (request as any).auth = {
      uid: 'test-user-emulator',
      token: {
        email: 'test@emulator.local',
        email_verified: true
      }
    };
  }
}
