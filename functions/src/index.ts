import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';

setGlobalOptions({
  region: 'europe-west4',
  timeoutSeconds: 540,
  memory: '2GiB'
});

initializeApp();

export { generatePodcastAudio } from './generate-podcast-audio';
