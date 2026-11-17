/** The chat with The Sidekick. */
export interface ChatTranslations {
  earlierConversations: string;
  newConversation: string;
  today: string;
  yesterday: string;
  emptyTitle: string;
  emptyExample: string;
  loadEarlierMessages: string;
  you: string;
  typing: string;
  versionLink: (version: number) => string;
  openVersionHistory: string;
  undoUpdateHint: string;
  abilityScoreWarningsTitle: string;
  abilityScoreWarningsHint: string;
  generatedImageAlt: (index: number) => string;
  enlargedImageAlt: string;
  composer: {
    messageLabel: string;
    placeholder: string;
    placeholderWithAttachment: string;
    send: string;
    moreActions: string;
    importPdf: string;
    generateImageAction: string;
    imageTrigger: string;
    imageMode: string;
    imageModeHint: string;
    removeAttachment: string;
    dropPdf: string;
    importCharacterMessage: string;
  };
  reply: {
    failed: string;
    tooManyRequests: string;
    stale: string;
    sendFailed: string;
  };
  characterUpdate: {
    running: string;
    done: string;
    failed: string;
    cancelled: string;
  };
  attachment: {
    notPdf: string;
    tooLarge: string;
    unreadable: string;
  };
  history: {
    title: string;
    withCharacter: (name: string) => string;
    search: string;
    lastSevenDays: string;
    older: string;
    confirmDelete: (title: string) => string;
    newTitle: string;
    actionsFor: (title: string) => string;
    updated: (version: number | undefined) => string;
    hasImages: string;
    noResults: (query: string) => string;
    empty: string;
    showMore: string;
    renameFailed: string;
    deleteFailed: string;
  };
}

export const chatNl: ChatTranslations = {
  earlierConversations: 'Eerdere gesprekken',
  newConversation: 'Nieuw gesprek',
  today: 'Vandaag',
  yesterday: 'Gisteren',
  emptyTitle: 'Vraag iets over je karakter!',
  emptyExample: 'Probeer: "Verander mijn class naar Rogue"',
  loadEarlierMessages: 'Eerdere berichten laden',
  you: 'Jij',
  typing: 'The Sidekick is aan het typen',
  versionLink: (version) => `versie ${version}`,
  openVersionHistory: 'Versiegeschiedenis openen',
  undoUpdateHint: 'Terug naar de versie van voor deze aanpassing',
  abilityScoreWarningsTitle: 'De ability scores volgen de regels niet:',
  abilityScoreWarningsHint: 'Vraag The Sidekick om dit te herstellen.',
  generatedImageAlt: (index) => `Gegenereerde afbeelding ${index}`,
  enlargedImageAlt: 'Vergrote afbeelding',
  composer: {
    messageLabel: 'Bericht',
    placeholder: 'Typ een bericht...',
    placeholderWithAttachment: 'Importeer dit karakter (of voeg instructies toe)...',
    send: 'Verstuur',
    moreActions: 'Meer acties',
    importPdf: 'PDF importeren',
    generateImageAction: 'Genereer afbeelding',
    imageTrigger: 'maak afbeelding',
    imageMode: 'Afbeelding genereren',
    imageModeHint: 'Stuurt naar Gemini beeldgenerator',
    removeAttachment: 'Bijlage verwijderen',
    dropPdf: 'Laat je PDF hier los',
    importCharacterMessage: 'Importeer dit karakter',
  },
  reply: {
    failed: 'Het antwoord is niet gelukt. Probeer het opnieuw.',
    tooManyRequests: 'Te veel verzoeken op dit moment. Wacht even en probeer het opnieuw.',
    stale: 'Er kwam geen antwoord. Probeer het opnieuw.',
    sendFailed: 'Het bericht kon niet worden verstuurd. Probeer het opnieuw.',
  },
  characterUpdate: {
    running: 'Karakter wordt aangepast...',
    done: 'Karakter is aangepast!',
    failed: 'Karakter aanpassen mislukt.',
    cancelled: 'Karakter aanpassen geannuleerd.',
  },
  attachment: {
    notPdf: 'Alleen PDF-bestanden worden ondersteund.',
    tooLarge: 'De PDF is groter dan 10 MB.',
    unreadable: 'De PDF kon niet worden gelezen.',
  },
  history: {
    title: 'Gesprekken',
    withCharacter: (name) => `met ${name}`,
    search: 'Zoek in gesprekken',
    lastSevenDays: 'Afgelopen 7 dagen',
    older: 'Ouder',
    confirmDelete: (title) => `“${title}” verwijderen? Dit kan niet ongedaan worden gemaakt.`,
    newTitle: 'Nieuwe titel',
    actionsFor: (title) => `Acties voor ${title}`,
    updated: (version) => (version ? `Aangepast · v${version}` : 'Aangepast'),
    hasImages: 'Afbeelding',
    noResults: (query) => `Geen gesprekken gevonden voor “${query}”.`,
    empty: 'Nog geen gesprekken met dit karakter.',
    showMore: 'Toon meer',
    renameFailed: 'Hernoemen is niet gelukt.',
    deleteFailed: 'Gesprek verwijderen is niet gelukt.',
  },
};

export const chatEn: ChatTranslations = {
  earlierConversations: 'Earlier conversations',
  newConversation: 'New conversation',
  today: 'Today',
  yesterday: 'Yesterday',
  emptyTitle: 'Ask about your character!',
  emptyExample: 'Try: "Change my class to Rogue"',
  loadEarlierMessages: 'Load earlier messages',
  you: 'You',
  typing: 'The Sidekick is typing',
  versionLink: (version) => `version ${version}`,
  openVersionHistory: 'Open version history',
  undoUpdateHint: 'Back to the version from before this update',
  abilityScoreWarningsTitle: 'The ability scores do not follow the rules:',
  abilityScoreWarningsHint: 'Ask The Sidekick to fix this.',
  generatedImageAlt: (index) => `Generated image ${index}`,
  enlargedImageAlt: 'Enlarged image',
  composer: {
    messageLabel: 'Message',
    placeholder: 'Type a message...',
    placeholderWithAttachment: 'Import this character (or add instructions)...',
    send: 'Send',
    moreActions: 'More actions',
    importPdf: 'Import PDF',
    generateImageAction: 'Generate image',
    imageTrigger: 'generate image',
    imageMode: 'Generate image',
    imageModeHint: 'Sends to the Gemini image generator',
    removeAttachment: 'Remove attachment',
    dropPdf: 'Drop PDF here',
    importCharacterMessage: 'Import this character',
  },
  reply: {
    failed: 'The answer could not be completed. Please try again.',
    tooManyRequests: 'Too many requests right now. Wait a moment and try again.',
    stale: 'No answer came. Please try again.',
    sendFailed: 'The message could not be sent. Please try again.',
  },
  characterUpdate: {
    running: 'Updating character...',
    done: 'Character updated!',
    failed: 'Updating the character failed.',
    cancelled: 'Character update cancelled.',
  },
  attachment: {
    notPdf: 'Only PDF files are supported.',
    tooLarge: 'PDF file exceeds 10 MB limit.',
    unreadable: 'Failed to read PDF file.',
  },
  history: {
    title: 'Conversations',
    withCharacter: (name) => `with ${name}`,
    search: 'Search conversations',
    lastSevenDays: 'Previous 7 days',
    older: 'Older',
    confirmDelete: (title) => `Delete “${title}”? This cannot be undone.`,
    newTitle: 'New title',
    actionsFor: (title) => `Actions for ${title}`,
    updated: (version) => (version ? `Updated · v${version}` : 'Updated'),
    hasImages: 'Image',
    noResults: (query) => `No conversations found for “${query}”.`,
    empty: 'No conversations with this character yet.',
    showMore: 'Show more',
    renameFailed: 'Renaming failed.',
    deleteFailed: 'Deleting the conversation failed.',
  },
};
