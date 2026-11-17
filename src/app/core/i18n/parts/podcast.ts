/** Podcasts: the library, a podcast version with its player, sharing and the public share page. */
export interface PodcastTranslations {
  label: string;
  versionTitle: (version: number) => string;
  downloadTitle: string;
  generationFailed: string;
  script: string;
  host1: string;
  host2: string;
  status: {
    ready: string;
    audioMissing: string;
    generatingAudio: string;
  };
  steps: {
    starting: string;
    script: string;
    audio: string;
    uploading: string;
    done: string;
    failed: string;
  };
  player: {
    play: (version: number) => string;
    pause: (version: number) => string;
    position: (version: number) => string;
    positionValue: (elapsed: string, total: string) => string;
    speed: string;
    speedValue: (speed: string) => string;
    speedLabel: (speed: string) => string;
    loadFailed: string;
  };
  session: {
    title: string;
    intro: string;
    generate: string;
    durationHint: string;
    listTitle: (count: number) => string;
    empty: string;
    voicesHint: string;
    startFailed: string;
  };
  library: {
    title: string;
    intro: string;
    selectCampaign: string;
    emptyTitle: string;
    emptyText: string;
    playDay: (date: string) => string;
    playDayUnknown: string;
    versionCount: (count: number) => string;
    footer: string;
  };
  share: {
    copyLinkTitle: string;
    creating: string;
    copied: string;
    copiedToast: string;
    copyPrompt: string;
    failed: string;
  };
  sharePage: {
    loading: string;
    audioUnsupported: string;
    notFoundTitle: string;
    notFoundText: string;
    madeWith: string;
  };
}

export const podcastNl: PodcastTranslations = {
  label: 'Podcast',
  versionTitle: (version) => `Podcast v${version}`,
  downloadTitle: 'Podcast downloaden',
  generationFailed: 'Het genereren van deze podcast is mislukt.',
  script: 'Script',
  host1: 'Host 1',
  host2: 'Host 2',
  status: {
    ready: 'Klaar',
    audioMissing: 'Audio ontbreekt',
    generatingAudio: 'Audio genereren...',
  },
  steps: {
    starting: 'Podcastgeneratie starten...',
    script: 'Podcastscript schrijven...',
    audio: 'Audio genereren...',
    uploading: 'Podcast opslaan...',
    done: 'Klaar',
    failed: 'Mislukt',
  },
  player: {
    play: (version) => `Speel podcast v${version}`,
    pause: (version) => `Pauzeer podcast v${version}`,
    position: (version) => `Positie in podcast v${version}`,
    positionValue: (elapsed, total) => `${elapsed} van ${total}`,
    speed: 'Afspeelsnelheid',
    speedValue: (speed) => `${speed}×`,
    speedLabel: (speed) => `Afspeelsnelheid: ${speed}×`,
    loadFailed: 'De audio kon niet worden geladen. Probeer het later opnieuw.',
  },
  session: {
    title: 'Sessiepodcast',
    intro: 'Genereer een boeiende audio recap met twee hosts die de sessie bespreken',
    generate: 'Genereer Podcast',
    durationHint: 'Dit kan 2-3 minuten duren. De complete MP3 wordt gegenereerd en opgeslagen.',
    listTitle: (count) => `Gegenereerde Podcasts (${count})`,
    empty: 'Nog geen podcasts gegenereerd. Klik op "Genereer Podcast" om te beginnen.',
    voicesHint: 'Podcasts gebruiken AI-stemmen die natuurlijk klinkend Nederlands spreken',
    startFailed: 'De podcast kon niet worden gestart. Probeer het opnieuw.',
  },
  library: {
    title: 'Podcastbibliotheek',
    intro: 'Bekijk alle sessiepodcasts. Elke speeldag is een audiosessie met een eigen verhaal en podcastversies.',
    selectCampaign: 'Selecteer een campagne om de podcasts te bekijken.',
    emptyTitle: 'Nog geen podcasts gegenereerd.',
    emptyText: 'Genereer een podcast vanuit een sessieverhaal om deze hier te zien.',
    playDay: (date) => `Speeldag: ${date}`,
    playDayUnknown: 'Speeldag: onbekend',
    versionCount: (count) => (count === 1 ? '1 versie' : `${count} versies`),
    footer:
      'Podcasts worden opgeslagen als MP3 en gebruiken AI-stemmen voor Nederlandse audio met natuurlijke intonatie.',
  },
  share: {
    copyLinkTitle: 'Deelbare link kopiëren',
    creating: 'Link maken...',
    copied: 'Link gekopieerd',
    copiedToast: 'Link gekopieerd — iedereen met deze link kan de podcast beluisteren.',
    copyPrompt: 'Kopieer de deelbare link:',
    failed: 'Deelbare link maken is mislukt. Probeer het opnieuw.',
  },
  sharePage: {
    loading: 'Podcast laden...',
    audioUnsupported: 'Je browser ondersteunt het audio-element niet.',
    notFoundTitle: 'Podcast niet gevonden',
    notFoundText: 'Deze link bestaat niet (meer).',
    madeWith: 'Gemaakt met QuestMind',
  },
};

export const podcastEn: PodcastTranslations = {
  label: 'Podcast',
  versionTitle: (version) => `Podcast v${version}`,
  downloadTitle: 'Download podcast',
  generationFailed: 'Generating this podcast failed.',
  script: 'Script',
  host1: 'Host 1',
  host2: 'Host 2',
  status: {
    ready: 'Ready',
    audioMissing: 'Audio missing',
    generatingAudio: 'Generating audio...',
  },
  steps: {
    starting: 'Starting podcast generation...',
    script: 'Writing podcast script...',
    audio: 'Generating audio...',
    uploading: 'Saving podcast...',
    done: 'Done',
    failed: 'Failed',
  },
  player: {
    play: (version) => `Play podcast v${version}`,
    pause: (version) => `Pause podcast v${version}`,
    position: (version) => `Position in podcast v${version}`,
    positionValue: (elapsed, total) => `${elapsed} of ${total}`,
    speed: 'Playback speed',
    speedValue: (speed) => `${speed}×`,
    speedLabel: (speed) => `Playback speed: ${speed}×`,
    loadFailed: 'The audio could not be loaded. Please try again later.',
  },
  session: {
    title: 'Session Podcast',
    intro: 'Generate an engaging audio recap with two hosts discussing the session',
    generate: 'Generate Podcast',
    durationHint: 'This can take 2-3 minutes. The complete MP3 is generated and saved.',
    listTitle: (count) => `Generated Podcasts (${count})`,
    empty: 'No podcasts generated yet. Click "Generate Podcast" to begin.',
    voicesHint: 'Podcasts use AI voices that speak natural-sounding Dutch',
    startFailed: 'Failed to start podcast generation. Please try again.',
  },
  library: {
    title: 'Podcast Library',
    intro: 'Browse all session podcasts. Every play day is an audio session with its own story and podcast versions.',
    selectCampaign: 'Select a campaign to view its podcasts.',
    emptyTitle: 'No podcasts generated yet.',
    emptyText: 'Generate a podcast from a session story to see it here.',
    playDay: (date) => `Play day: ${date}`,
    playDayUnknown: 'Play day: unknown',
    versionCount: (count) => (count === 1 ? '1 version' : `${count} versions`),
    footer: 'Podcasts are stored as MP3 and use AI voices for Dutch audio with natural intonation.',
  },
  share: {
    copyLinkTitle: 'Copy shareable link',
    creating: 'Creating link...',
    copied: 'Link copied',
    copiedToast: 'Link copied — anyone with this link can listen to the podcast.',
    copyPrompt: 'Copy the shareable link:',
    failed: 'Creating the shareable link failed. Please try again.',
  },
  sharePage: {
    loading: 'Loading podcast...',
    audioUnsupported: 'Your browser does not support the audio element.',
    notFoundTitle: 'Podcast not found',
    notFoundText: 'This link does not exist (any more).',
    madeWith: 'Made with QuestMind',
  },
};
