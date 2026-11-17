/**
 * Messages for things that went wrong. `reasons` holds one text per `reason`
 * the backend sends along with a refused call (see `callableErrorMessage`).
 */
export interface ErrorsTranslations {
  generic: string;
  permissionDenied: string;
  unauthenticated: string;
  tooManyRequests: string;
  unavailable: string;
  notFound: string;
  technicalDetails: string;
  reasons: {
    voiceIntroTooLong: string;
    importLinkMissing: string;
    importLinkInvalid: string;
    importLinkNotQuestmind: string;
    importLinkNotCharacter: string;
    importCharacterNotFound: string;
    importCharacterUnreadable: string;
    storyAlreadyGenerating: string;
    noSessionStories: string;
    storyVersionNotReady: string;
    podcastAlreadyGenerating: string;
    podcastNotReady: string;
    sessionHasNoStory: string;
    noUploadedAudio: string;
    noTranscription: string;
    messageLength: string;
    messageAlreadySent: string;
    attachmentNotPdf: string;
    attachmentTooLarge: string;
  };
}

export const errorsNl: ErrorsTranslations = {
  generic: 'Er ging iets mis. Probeer het opnieuw.',
  permissionDenied:
    'Je hebt geen rechten voor deze actie. Alleen leden of de eigenaar van de campagne (of het karakter) mogen dit.',
  unauthenticated: 'Je bent niet ingelogd. Log opnieuw in en probeer het nog eens.',
  tooManyRequests: 'Te veel verzoeken op dit moment. Wacht even en probeer het opnieuw.',
  unavailable: 'De server reageert niet. Controleer je verbinding en probeer het opnieuw.',
  notFound: 'Dit bestaat niet (meer).',
  technicalDetails: 'Technische details',
  reasons: {
    voiceIntroTooLong: 'Het voorstelrondje is te lang. Houd het onder de 5 minuten.',
    importLinkMissing: 'Plak een link naar een karakter.',
    importLinkInvalid: 'Dat lijkt geen link te zijn.',
    importLinkNotQuestmind: 'Alleen links naar een QuestMind-karakter kunnen worden geïmporteerd.',
    importLinkNotCharacter: 'Die link verwijst niet naar een karakter.',
    importCharacterNotFound: 'Er is geen karakter gevonden op die link.',
    importCharacterUnreadable: 'Het karakter op die link kon niet worden gelezen.',
    storyAlreadyGenerating: 'Er wordt al een verhaal gegenereerd.',
    noSessionStories: 'Er zijn nog geen sessieverhalen om samen te vatten.',
    storyVersionNotReady: 'Deze versie van het verhaal is nog niet klaar.',
    podcastAlreadyGenerating: 'Er wordt al een podcast gegenereerd.',
    podcastNotReady: 'Deze podcast is nog niet klaar om te delen.',
    sessionHasNoStory: 'Deze sessie heeft nog geen verhaal.',
    noUploadedAudio: 'Er is geen geüploade audio gevonden voor deze sessie.',
    noTranscription: 'Deze sessie heeft nog geen transcript.',
    messageLength: 'Je bericht is leeg of te lang.',
    messageAlreadySent: 'Dit bericht is al verstuurd.',
    attachmentNotPdf: 'Alleen PDF-bijlagen worden ondersteund.',
    attachmentTooLarge: 'De bijlage is groter dan 10 MB.',
  },
};

export const errorsEn: ErrorsTranslations = {
  generic: 'Something went wrong. Please try again.',
  permissionDenied:
    'You are not allowed to do this. Only members or the owner of the campaign (or the character) can.',
  unauthenticated: 'You are not signed in. Sign in again and retry.',
  tooManyRequests: 'Too many requests right now. Wait a moment and try again.',
  unavailable: 'The server is not responding. Check your connection and try again.',
  notFound: 'This does not exist (any more).',
  technicalDetails: 'Technical details',
  reasons: {
    voiceIntroTooLong: 'The introduction is too long. Keep it under 5 minutes.',
    importLinkMissing: 'Paste a link to a character.',
    importLinkInvalid: 'That does not look like a link.',
    importLinkNotQuestmind: 'Only links to a QuestMind character can be imported.',
    importLinkNotCharacter: 'That link does not point to a character.',
    importCharacterNotFound: 'No character was found at that link.',
    importCharacterUnreadable: 'The character at that link could not be read.',
    storyAlreadyGenerating: 'A story is already being generated.',
    noSessionStories: 'There are no session stories to summarise yet.',
    storyVersionNotReady: 'This version of the story is not ready yet.',
    podcastAlreadyGenerating: 'A podcast is already being generated.',
    podcastNotReady: 'This podcast is not ready to share yet.',
    sessionHasNoStory: 'This session has no story yet.',
    noUploadedAudio: 'No uploaded audio was found for this session.',
    noTranscription: 'This session has no transcript yet.',
    messageLength: 'Your message is empty or too long.',
    messageAlreadySent: 'This message was already sent.',
    attachmentNotPdf: 'Only PDF attachments are supported.',
    attachmentTooLarge: 'The attachment is larger than 10 MB.',
  },
};
