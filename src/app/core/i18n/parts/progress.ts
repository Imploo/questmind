/** Progress of a session, a podcast or a campaign story. */
export interface ProgressTranslations {
  processing: string;
  stages: {
    idle: string;
    compressing: string;
    uploading: string;
    processingAudio: string;
    transcribing: string;
    generatingStory: string;
    generatingPodcastScript: string;
    generatingPodcastAudio: string;
    completed: string;
    failed: string;
  };
  segmentCount: (current: number, total: number) => string;
  partCount: (current: number, total: number) => string;
  percentComplete: (percent: number) => string;
  backgroundUpload: string;
  backgroundUploadHint: string;
  almostDone: string;
  remainingHours: (hours: number, minutes: number) => string;
  remainingMinutes: (minutes: number) => string;
  remainingSeconds: (seconds: number) => string;
  failedMessage: string;
  timedOut: string;
}

export const progressNl: ProgressTranslations = {
  processing: 'Verwerken',
  stages: {
    idle: 'Inactief',
    compressing: 'Audio comprimeren',
    uploading: 'Bestand uploaden',
    processingAudio: 'Audio verwerken',
    transcribing: 'Audio transcriberen',
    generatingStory: 'Verhaal genereren',
    generatingPodcastScript: 'Podcastscript genereren',
    generatingPodcastAudio: 'Podcastaudio genereren',
    completed: 'Voltooid',
    failed: 'Mislukt',
  },
  segmentCount: (current, total) => `Segment ${current} van ${total}`,
  partCount: (current, total) => `Deel ${current} van ${total}`,
  percentComplete: (percent) => `${percent}% voltooid`,
  backgroundUpload: 'Uploaden op de achtergrond...',
  backgroundUploadHint: 'Het uploaden gaat op de achtergrond door. Je kunt de app sluiten.',
  almostDone: 'Bijna klaar...',
  remainingHours: (hours, minutes) => `nog ~${hours} u ${minutes} min`,
  remainingMinutes: (minutes) => `nog ~${minutes} min`,
  remainingSeconds: (seconds) => `nog ~${seconds} s`,
  failedMessage: 'Er ging iets mis bij het verwerken van deze sessie.',
  timedOut: 'Dit duurde te lang en is gestopt. Probeer het opnieuw.',
};

export const progressEn: ProgressTranslations = {
  processing: 'Processing',
  stages: {
    idle: 'Idle',
    compressing: 'Compressing Audio',
    uploading: 'Uploading File',
    processingAudio: 'Processing Audio',
    transcribing: 'Transcribing Audio',
    generatingStory: 'Generating Story',
    generatingPodcastScript: 'Generating Podcast Script',
    generatingPodcastAudio: 'Generating Podcast Audio',
    completed: 'Completed',
    failed: 'Failed',
  },
  segmentCount: (current, total) => `Segment ${current} of ${total}`,
  partCount: (current, total) => `Part ${current} of ${total}`,
  percentComplete: (percent) => `${percent}% complete`,
  backgroundUpload: 'Uploading in the background...',
  backgroundUploadHint: 'Upload continues in the background. You can close the app.',
  almostDone: 'Almost done...',
  remainingHours: (hours, minutes) => `~${hours}h ${minutes}m remaining`,
  remainingMinutes: (minutes) => `~${minutes}m remaining`,
  remainingSeconds: (seconds) => `~${seconds}s remaining`,
  failedMessage: 'Something went wrong while processing this session.',
  timedOut: 'This took too long and was stopped. Please try again.',
};
