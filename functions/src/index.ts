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

// Podcast generation (kept separate from transcription flow)
export { generatePodcastAudio } from './generate-podcast-audio';

// New worker chain functions
export { downloadWorker } from './workers/download-worker';
export { chunkingWorker } from './workers/chunking-worker';
export { transcriptionWorker } from './workers/transcription-worker';
export { storyGenerationWorker } from './workers/story-generation-worker';
