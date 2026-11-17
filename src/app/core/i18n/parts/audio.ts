/** Sessions: the list, the upload, the story tab and transcription. */
export interface AudioTranslations {
  untitledSession: string;
  defaultSessionTitle: (fileName: string) => string;
  defaultStoryTitle: string;
  noDate: string;
  noCampaignSelected: string;
  selectSession: string;
  page: {
    signedOutTitle: string;
    signedOutText: string;
    signedOutHelp: string;
    noCampaignTitle: string;
    noCampaignText: string;
    selectSessionText: string;
    noSessionsTitle: string;
    noSessionsText: string;
    uploadFirst: string;
  };
  list: {
    title: string;
    sessionsAvailable: (count: number) => string;
    sessionCount: (count: number) => string;
    close: string;
    newSession: string;
    empty: string;
    emptyHintUpload: string;
    emptyHintFirst: string;
    ariaLabel: string;
    statusUploading: string;
    statusProcessing: string;
    you: string;
  };
  upload: {
    mobileLabel: string;
    eyebrow: string;
    pageTitle: string;
    pageSubtitle: string;
    title: string;
    formats: string;
    dropHint: string;
    browse: string;
    moveUp: string;
    moveDown: string;
    removeFile: string;
    mergeSummary: (count: number, totalSize: string) => string;
    sessionName: string;
    sessionNamePlaceholder: string;
    sessionDate: string;
    keepAwake: string;
    keepAwakeUnsupported: string;
    clear: string;
    processing: string;
    mergeAndUpload: string;
    uploadAndProcess: string;
    failed: string;
  };
  uploadStages: {
    idle: string;
    compressing: string;
    uploading: string;
    transcribing: string;
    generating: string;
    completed: string;
    failed: string;
  };
  uploadErrors: {
    unsupportedType: (fileName: string) => string;
    wavTooLarge: (fileName: string) => string;
    tooLarge: (fileName: string) => string;
  };
  session: {
    cancelNotImplemented: string;
    retryNoCampaign: string;
    noStoredAudio: string;
    retranscribeConfirm: string;
    regenerateFailed: string;
    processingStartFailed: string;
  };
  story: {
    eyebrow: string;
    titleLabel: string;
    dateLabel: string;
    editDetails: string;
    deleteSession: string;
    deleteConfirm: string;
    tabStory: string;
    tabPodcasts: string;
    generatedStory: string;
    preview: string;
    editStory: string;
    reset: string;
    saveStory: string;
    downloadMarkdown: string;
    exportPdf: string;
    hideTranscript: string;
    showTranscript: string;
    empty: string;
  };
  corrections: {
    title: string;
    saving: string;
    saved: string;
    intro: string;
    label: string;
    placeholder: string;
    help: string;
    regenerate: string;
  };
  recording: {
    title: string;
    details: (duration: string, size: string) => string;
    retranscribe: string;
    retranscribeTitle: string;
    loading: string;
  };
}

export const audioNl: AudioTranslations = {
  untitledSession: 'Naamloze sessie',
  defaultSessionTitle: (fileName) => `Sessie: ${fileName}`,
  defaultStoryTitle: 'Sessieverhaal',
  noDate: 'Geen datum',
  noCampaignSelected: 'Geen campagne geselecteerd.',
  selectSession: 'Selecteer een sessie',
  page: {
    signedOutTitle: 'Audiotranscriptie',
    signedOutText: 'Log in om audiosessies te uploaden en met AI transcripten en sessieverhalen te maken.',
    signedOutHelp: 'Je audiobestanden en transcripten worden veilig opgeslagen en zijn alleen voor jou toegankelijk.',
    noCampaignTitle: 'Selecteer een campagne',
    noCampaignText: 'Kies een campagne om sessies te uploaden en samen te werken met je groep.',
    selectSessionText: 'Kies een sessie uit de lijst om de details en het verhaal te bekijken.',
    noSessionsTitle: 'Nog geen sessies',
    noSessionsText: 'Upload je eerste audiosessie om te beginnen met AI-transcripten en sessieverhalen.',
    uploadFirst: 'Audiosessie uploaden',
  },
  list: {
    title: 'Sessies',
    sessionsAvailable: (count) => (count === 1 ? '1 sessie beschikbaar' : `${count} sessies beschikbaar`),
    sessionCount: (count) => (count === 1 ? '1 sessie' : `${count} sessies`),
    close: 'Sessielijst sluiten',
    newSession: 'Nieuwe sessie',
    empty: 'Nog geen sessies.',
    emptyHintUpload: 'Upload audio om te beginnen.',
    emptyHintFirst: 'Dit wordt je eerste!',
    ariaLabel: 'Sessielijst',
    statusUploading: 'Uploaden',
    statusProcessing: 'Verwerken',
    you: 'Jij',
  },
  upload: {
    mobileLabel: 'Nieuwe audiosessie',
    eyebrow: 'Nieuwe sessie',
    pageTitle: 'Nieuwe audiosessie uploaden',
    pageSubtitle: 'Upload en transcribeer de audio van je D&D-sessie',
    title: 'Sessie-audio uploaden',
    formats: 'WAV tot 4 GB; MP3, M4A of OGG tot 500 MB. Selecteer meerdere bestanden om ze samen te voegen.',
    dropHint: 'Sleep je audiobestanden hierheen, of',
    browse: 'blader',
    moveUp: 'Omhoog',
    moveDown: 'Omlaag',
    removeFile: 'Bestand verwijderen',
    mergeSummary: (count, totalSize) =>
      `${count} bestanden — ${totalSize} in totaal — worden samengevoegd tot één opname`,
    sessionName: 'Naam van de sessie',
    sessionNamePlaceholder: 'De grotten van de goblins',
    sessionDate: 'Datum van de sessie',
    keepAwake: 'Scherm aan houden tijdens het uploaden',
    keepAwakeUnsupported: '(Niet ondersteund op dit apparaat)',
    clear: 'Wissen',
    processing: 'Verwerken...',
    mergeAndUpload: 'Samenvoegen en uploaden',
    uploadAndProcess: 'Uploaden en verwerken',
    failed: 'De audio kon niet worden geüpload of verwerkt. Probeer het opnieuw.',
  },
  uploadStages: {
    idle: 'Klaar',
    compressing: 'Comprimeren',
    uploading: 'Uploaden',
    transcribing: 'Transcriberen',
    generating: 'Genereren',
    completed: 'Voltooid',
    failed: 'Mislukt',
  },
  uploadErrors: {
    unsupportedType: (fileName) =>
      `${fileName}: dit bestandstype wordt niet ondersteund. Gebruik MP3, WAV, M4A of OGG.`,
    wavTooLarge: (fileName) => `${fileName}: het WAV-bestand is te groot. De maximale grootte is 4 GB.`,
    tooLarge: (fileName) => `${fileName}: het bestand is te groot. De maximale grootte is 500 MB.`,
  },
  session: {
    cancelNotImplemented: 'Annuleren kan nog niet. De bewerking wordt op de achtergrond afgemaakt.',
    retryNoCampaign: 'Opnieuw proberen kan niet: er is geen campagne geselecteerd.',
    noStoredAudio: 'Geen opgeslagen audio; upload de opname opnieuw.',
    retranscribeConfirm:
      'De opname opnieuw transcriberen? Het huidige transcript en verhaal worden vervangen door nieuwe. Je correcties blijven bewaard en worden toegepast.',
    regenerateFailed: 'Het opnieuw genereren van het verhaal kon niet worden gestart. Probeer het opnieuw.',
    processingStartFailed: 'De verwerking kon niet worden gestart. Probeer het opnieuw.',
  },
  story: {
    eyebrow: 'Sessie',
    titleLabel: 'Titel van de sessie',
    dateLabel: 'Datum van de sessie',
    editDetails: 'Gegevens bewerken',
    deleteSession: 'Sessie verwijderen',
    deleteConfirm: 'Sessie verwijderen?',
    tabStory: 'Verhaal',
    tabPodcasts: 'Podcasts',
    generatedStory: 'Gegenereerd verhaal',
    preview: 'Voorbeeld',
    editStory: 'Verhaal bewerken',
    reset: 'Herstellen',
    saveStory: 'Verhaal opslaan',
    downloadMarkdown: 'Markdown downloaden',
    exportPdf: 'PDF exporteren',
    hideTranscript: 'Transcript verbergen',
    showTranscript: 'Voorbeeld van het transcript tonen',
    empty: 'Het sessieverhaal verschijnt hier zodra het genereren klaar is.',
  },
  corrections: {
    title: 'Correcties en aanwijzingen',
    saving: 'Opslaan...',
    saved: 'Opgeslagen ✓',
    intro:
      'Lees het verhaal na en zet hieronder je correcties. De AI past ze toe als je het verhaal opnieuw genereert.',
    label: 'Correcties',
    placeholder:
      "Voorbeeld: als je 'corikan' hoort, is de juiste naam 'Khuri-Khan'. De groep is in Waterdeep, niet in Baldur's Gate.",
    help: 'Correcties worden automatisch opgeslagen terwijl je typt. Opnieuw genereren vervangt het verhaal links.',
    regenerate: 'Verhaal opnieuw genereren',
  },
  recording: {
    title: 'Opname',
    details: (duration, size) => `${duration} · ${size} · gecomprimeerd en genormaliseerd`,
    retranscribe: 'Opnieuw transcriberen',
    retranscribeTitle: 'Transcribeer de opgeslagen opname opnieuw en genereer een nieuw verhaal',
    loading: 'Opname laden...',
  },
};

export const audioEn: AudioTranslations = {
  untitledSession: 'Untitled Session',
  defaultSessionTitle: (fileName) => `Session: ${fileName}`,
  defaultStoryTitle: 'Session Story',
  noDate: 'No date',
  noCampaignSelected: 'No campaign selected.',
  selectSession: 'Select a session',
  page: {
    signedOutTitle: 'Audio Transcription',
    signedOutText: 'Sign in to upload audio sessions and generate AI-powered transcriptions and session stories.',
    signedOutHelp: 'Your audio files and transcriptions will be securely stored and accessible only to you.',
    noCampaignTitle: 'Select a campaign',
    noCampaignText: 'Choose a campaign to upload sessions and collaborate with your group.',
    selectSessionText: 'Choose a session from the list to view its details and story.',
    noSessionsTitle: 'No sessions yet',
    noSessionsText:
      'Upload your first audio session to get started with AI-powered transcriptions and session stories.',
    uploadFirst: 'Upload Audio Session',
  },
  list: {
    title: 'Sessions',
    sessionsAvailable: (count) => (count === 1 ? '1 session available' : `${count} sessions available`),
    sessionCount: (count) => (count === 1 ? '1 session' : `${count} sessions`),
    close: 'Close session list',
    newSession: 'New Session',
    empty: 'No sessions yet.',
    emptyHintUpload: 'Upload audio to begin.',
    emptyHintFirst: 'This will be your first!',
    ariaLabel: 'Session list',
    statusUploading: 'Uploading',
    statusProcessing: 'Processing',
    you: 'You',
  },
  upload: {
    mobileLabel: 'New Audio Session',
    eyebrow: 'New session',
    pageTitle: 'Upload New Audio Session',
    pageSubtitle: 'Upload and transcribe your D&D session audio',
    title: 'Upload Session Audio',
    formats: 'WAV up to 4GB; MP3, M4A or OGG up to 500MB. Select multiple files to merge.',
    dropHint: 'Drag and drop your audio files here, or',
    browse: 'browse',
    moveUp: 'Move up',
    moveDown: 'Move down',
    removeFile: 'Remove file',
    mergeSummary: (count, totalSize) => `${count} files — ${totalSize} total — will be merged into one recording`,
    sessionName: 'Session name',
    sessionNamePlaceholder: 'The Goblin Warrens',
    sessionDate: 'Session date',
    keepAwake: 'Keep screen awake during upload',
    keepAwakeUnsupported: '(Not supported on this device)',
    clear: 'Clear',
    processing: 'Processing...',
    mergeAndUpload: 'Merge & Upload',
    uploadAndProcess: 'Upload & Process',
    failed: 'The audio could not be uploaded or processed. Please try again.',
  },
  uploadStages: {
    idle: 'Ready',
    compressing: 'Compressing',
    uploading: 'Uploading',
    transcribing: 'Transcribing',
    generating: 'Generating',
    completed: 'Complete',
    failed: 'Failed',
  },
  uploadErrors: {
    unsupportedType: (fileName) => `${fileName}: Unsupported file type. Please use MP3, WAV, M4A, or OGG.`,
    wavTooLarge: (fileName) => `${fileName}: WAV file is too large. Maximum size is 4GB.`,
    tooLarge: (fileName) => `${fileName}: File is too large. Maximum size is 500MB.`,
  },
  session: {
    cancelNotImplemented:
      'Operation cancellation is not yet implemented. The operation will complete in the background.',
    retryNoCampaign: 'Cannot retry: No campaign selected.',
    noStoredAudio: 'No stored audio; upload the recording again.',
    retranscribeConfirm:
      'Transcribe the recording again? The current transcript and story will be replaced by new ones. Your corrections are kept and applied.',
    regenerateFailed: 'Story regeneration could not be started. Please try again.',
    processingStartFailed: 'Processing could not be started. Please try again.',
  },
  story: {
    eyebrow: 'Session',
    titleLabel: 'Session title',
    dateLabel: 'Session date',
    editDetails: 'Edit details',
    deleteSession: 'Delete session',
    deleteConfirm: 'Delete session?',
    tabStory: 'Story',
    tabPodcasts: 'Podcasts',
    generatedStory: 'Generated Story',
    preview: 'Preview',
    editStory: 'Edit story',
    reset: 'Reset',
    saveStory: 'Save Story',
    downloadMarkdown: 'Download Markdown',
    exportPdf: 'Export PDF',
    hideTranscript: 'Hide transcript',
    showTranscript: 'Show transcript preview',
    empty: 'The session story will appear here once generation completes.',
  },
  corrections: {
    title: 'Corrections & Guidance',
    saving: 'Saving...',
    saved: 'Saved ✓',
    intro: 'Review the story and add corrections below. The AI will apply these when you regenerate the story.',
    label: 'Corrections',
    placeholder:
      "Example: When you hear 'corikan', the correct name is 'Khuri-Khan'. The party is in Waterdeep, not Baldur's Gate.",
    help: 'Corrections auto-save as you type. Regenerating replaces the story on the left.',
    regenerate: 'Regenerate Story',
  },
  recording: {
    title: 'Recording',
    details: (duration, size) => `${duration} · ${size} · compressed & normalized`,
    retranscribe: 'Re-transcribe',
    retranscribeTitle: 'Transcribe the stored recording again and generate a new story',
    loading: 'Loading recording...',
  },
};
