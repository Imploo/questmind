import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

setGlobalOptions({
  region: 'europe-west4',
  timeoutSeconds: 540,
  memory: '2GiB'
});

initializeApp();
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export { generatePodcastAudio } from './generate-podcast-audio';
