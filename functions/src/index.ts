import { initSentry } from './config/sentry.config';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';

// Initialize Sentry before everything else
initSentry();

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
  region: 'europe-west1',
  timeoutSeconds: 1200,
  memory: '2GiB'
});

initializeApp();

// Podcast generation (kept separate from transcription flow)
export { generatePodcastAudio } from './generate-podcast-audio';

// Audio upload — browser compresses audio, then proxies through backend to Gemini
// (Gemini resumable upload URLs block direct browser requests via CORS)
export { uploadAudioToGemini } from './upload-audio-to-gemini';

// Transcription
export { transcribeAudioFast } from './transcribe-audio-fast';

// Story generation (triggered after transcription)
export { storyGenerationWorker } from './workers/story-generation-worker';

// Character chat proxy
export { characterChat } from './character-chat';

// Image generation via fal.ai
export { generateImage } from './generate-image';

// Spell resolution (fallback when not found in static Spell.json)
export { resolveSpell } from './resolve-spell';
