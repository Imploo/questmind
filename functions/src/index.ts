import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';

/**
 * Shared CORS configuration for all callable functions
 */
export const SHARED_CORS = [
  'https://questmind.nl',
  'http://localhost:4200',
  /^https:\/\/.*\.web\.app$/,
  /^https:\/\/.*\.firebaseapp\.com$/
];

setGlobalOptions({
  region: 'europe-west4',
  timeoutSeconds: 1200,
  memory: '2GiB'
});

initializeApp();

export { generatePodcastAudio } from './generate-podcast-audio';
export { processAudioSession } from './process-audio-session';
export { retranscribeAudio } from './retranscribe-audio';
export { regenerateStory } from './regenerate-story';
