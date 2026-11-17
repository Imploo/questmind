/** The campaign story page, its versions and its podcasts. */
export interface CampaignStoryTranslations {
  title: string;
  intro: string;
  generate: string;
  versions: string;
  loading: string;
  changedSessions: (count: number) => string;
  sessionCount: (count: number) => string;
  versionFailed: (version: number) => string;
  generationFailed: string;
  startFailed: string;
  emptyNoSessions: string;
  emptyOwner: string;
  emptyMember: string;
  olderVersion: string;
  viewingVersion: (version: number) => string;
  backToLatest: string;
  untitled: string;
  downloadName: string;
  progress: {
    collecting: string;
    writing: string;
    done: string;
    failed: string;
  };
  drawer: {
    label: string;
    empty: string;
  };
  podcasts: {
    title: string;
    intro: string;
    generate: string;
    empty: string;
  };
}

export const campaignStoryNl: CampaignStoryTranslations = {
  title: 'Verhaal',
  intro: 'Het verhaal van de campagne tot nu toe, samengevat uit alle sessies.',
  generate: 'Nieuw verhaal genereren',
  versions: 'Versies',
  loading: 'Verhaal laden',
  changedSessions: (count) =>
    count === 1
      ? '1 nieuwe/gewijzigde sessie sinds de nieuwste versie.'
      : `${count} nieuwe/gewijzigde sessies sinds de nieuwste versie.`,
  sessionCount: (count) => (count === 1 ? '1 sessie' : `${count} sessies`),
  versionFailed: (version) => `Versie ${version} is mislukt.`,
  generationFailed: 'Het genereren van deze versie is mislukt.',
  startFailed: 'Genereren kon niet gestart worden. Probeer het opnieuw.',
  emptyNoSessions: 'Nog geen sessieverhalen om samen te vatten.',
  emptyOwner: 'Nog geen verhaal. Klik op "Nieuw verhaal genereren" om te beginnen.',
  emptyMember: 'De eigenaar van de campagne heeft nog geen verhaal gegenereerd.',
  olderVersion: 'Oudere versie',
  viewingVersion: (version) => `Je bekijkt versie ${version}.`,
  backToLatest: 'Terug naar nieuwste',
  untitled: 'Het verhaal tot nu toe',
  downloadName: 'campagne-verhaal',
  progress: {
    collecting: 'Sessieverhalen verzamelen...',
    writing: 'Verhaal schrijven...',
    done: 'Klaar',
    failed: 'Mislukt',
  },
  drawer: {
    label: 'Versies van het verhaal',
    empty: 'Nog geen versies.',
  },
  podcasts: {
    title: 'Podcast',
    intro: 'Twee hosts blikken terug op deze versie van het verhaal',
    generate: 'Podcast genereren',
    empty: 'Nog geen podcast voor deze versie.',
  },
};

export const campaignStoryEn: CampaignStoryTranslations = {
  title: 'Story',
  intro: 'The story of the campaign so far, summarised from all sessions.',
  generate: 'Generate new story',
  versions: 'Versions',
  loading: 'Loading story',
  changedSessions: (count) =>
    count === 1
      ? '1 new/changed session since the latest version.'
      : `${count} new/changed sessions since the latest version.`,
  sessionCount: (count) => (count === 1 ? '1 session' : `${count} sessions`),
  versionFailed: (version) => `Version ${version} failed.`,
  generationFailed: 'Generating this version failed.',
  startFailed: 'Generation could not be started. Please try again.',
  emptyNoSessions: 'No session stories to summarise yet.',
  emptyOwner: 'No story yet. Click "Generate new story" to begin.',
  emptyMember: 'The campaign owner has not generated a story yet.',
  olderVersion: 'Older version',
  viewingVersion: (version) => `You are viewing version ${version}.`,
  backToLatest: 'Back to latest',
  untitled: 'The story so far',
  downloadName: 'campaign-story',
  progress: {
    collecting: 'Collecting session stories...',
    writing: 'Writing the story...',
    done: 'Done',
    failed: 'Failed',
  },
  drawer: {
    label: 'Story versions',
    empty: 'No versions yet.',
  },
  podcasts: {
    title: 'Podcast',
    intro: 'Two hosts look back on this version of the story',
    generate: 'Generate podcast',
    empty: 'No podcast for this version yet.',
  },
};
