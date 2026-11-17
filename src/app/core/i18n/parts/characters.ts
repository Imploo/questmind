/** The character list, the character page and the dialogs around a character. */
export interface CharactersTranslations {
  defaultName: (number: number) => string;
  archive: string;
  unarchive: string;
  unarchiveFailed: string;
  list: {
    title: string;
    subtitle: string;
    import: string;
    loading: string;
    allArchivedTitle: string;
    allArchivedText: string;
    emptyTitle: string;
    emptyText: string;
    createCharacter: string;
    importInstead: string;
    archivedCount: (count: number) => string;
  };
  tile: {
    unarchiveNamed: (name: string) => string;
  };
  page: {
    breadcrumb: string;
    overview: string;
    updating: string;
    loading: string;
    selectTitle: string;
    selectText: string;
    selectToChat: string;
    switchVersionFailed: string;
    cloned: string;
    cloneFailed: string;
    archived: string;
    unarchived: string;
    archiveFailed: string;
    sidekickBusy: string;
  };
  actions: {
    menuLabel: string;
    more: string;
    downloadPdf: string;
    preparingPdf: string;
    history: string;
    convertRules: (version: string) => string;
    convertRulesTitle: (version: string) => string;
    clone: string;
    cloning: string;
    cloneTitle: string;
    shareTitle: string;
  };
  importDialog: {
    eyebrow: string;
    title: string;
    question: string;
    pdfOption: string;
    pdfText: string;
    linkOption: string;
    linkText: string;
    linkLabel: string;
    linkHelp: string;
    submit: string;
    importing: string;
    creating: string;
    failed: string;
    pdfFailed: string;
  };
  gallery: {
    title: string;
    empty: string;
    emptyHint: string;
    imageAlt: (number: number) => string;
    deleteImage: string;
    deleteConfirm: string;
    imageCount: (count: number) => string;
  };
  history: {
    eyebrow: string;
    title: string;
    active: string;
    makeActive: string;
    empty: string;
    commitInitial: string;
    commitAi: string;
    commitCloned: string;
    commitImported: (host: string) => string;
    sourceAi: string;
    sourceManual: string;
    sourceRestore: string;
  };
  rulesConversion: {
    convert: (version: string) => string;
    review: (version: string) => string;
    choices: string;
  };
}

export const charactersNl: CharactersTranslations = {
  defaultName: (number) => `Nieuw karakter ${number}`,
  archive: 'Archiveren',
  unarchive: 'Terugzetten',
  unarchiveFailed: 'Terugzetten is mislukt. Probeer het opnieuw.',
  list: {
    title: 'Jouw karakters',
    subtitle: 'Kies een karakter om te bekijken of te bewerken',
    import: 'Importeren',
    loading: 'Karakters laden',
    allArchivedTitle: 'Al je karakters zijn gearchiveerd',
    allArchivedText: 'Maak een nieuw karakter aan, of haal er een terug uit het archief hieronder.',
    emptyTitle: 'Nog geen karakters',
    emptyText: 'Maak je eerste karakter aan om te beginnen!',
    createCharacter: 'Karakter aanmaken',
    importInstead: 'Of importeer er een uit een PDF of via een link',
    archivedCount: (count) => `Gearchiveerd (${count})`,
  },
  tile: {
    unarchiveNamed: (name) => `${name} terugzetten`,
  },
  page: {
    breadcrumb: 'Kruimelpad',
    overview: 'Overzicht',
    updating: 'Karakter wordt bijgewerkt',
    loading: 'Karakter laden',
    selectTitle: 'Kies een karakter',
    selectText: 'Kies een karakter uit de lijst of maak een nieuw karakter aan.',
    selectToChat: 'Kies een karakter om te chatten',
    switchVersionFailed: 'Wisselen van versie is mislukt. Probeer het opnieuw.',
    cloned: 'Karakter gekloond — dit is nu je eigen kopie.',
    cloneFailed: 'Klonen is mislukt. Probeer het opnieuw.',
    archived: 'Karakter gearchiveerd — je vindt het terug onder "Gearchiveerd" in je karakterlijst.',
    unarchived: 'Karakter teruggezet in je karakterlijst.',
    archiveFailed: 'Archiveren is mislukt. Probeer het opnieuw.',
    sidekickBusy: 'The Sidekick is nog bezig. Probeer het daarna opnieuw.',
  },
  actions: {
    menuLabel: 'Acties voor dit karakter',
    more: 'Meer acties',
    downloadPdf: 'PDF downloaden',
    preparingPdf: 'PDF voorbereiden…',
    history: 'Geschiedenis',
    convertRules: (version) => `Omzetten naar ${version}-regels`,
    convertRulesTitle: (version) => `Bouw dit karakter opnieuw op volgens de ${version}-regels`,
    clone: 'Klonen',
    cloning: 'Bezig met klonen…',
    cloneTitle: 'Kopieer dit karakter naar je eigen account',
    shareTitle: 'Kopieer een link naar dit karakter',
  },
  importDialog: {
    eyebrow: 'Nieuw karakter',
    title: 'Karakter importeren',
    question: 'Waar komt het karakter vandaan?',
    pdfOption: 'PDF',
    pdfText: 'Upload een character sheet. De AI leest hem en vult een nieuw karakter in.',
    linkOption: 'Link',
    linkText: 'Plak de deellink van een QuestMind-karakter en krijg je eigen kopie.',
    linkLabel: 'Deellink',
    linkHelp:
      'De knop Delen op een character sheet kopieert de link. Je krijgt een kopie van het karakter zoals het gebouwd is, met de portretten; het origineel blijft zoals het is.',
    submit: 'Importeren',
    importing: 'Bezig met importeren…',
    creating: 'Karakter aanmaken…',
    failed: 'Het karakter kon niet worden geïmporteerd. Probeer het opnieuw.',
    pdfFailed: 'De PDF kon niet worden geïmporteerd. Probeer het opnieuw.',
  },
  gallery: {
    title: 'Galerij',
    empty: 'Nog geen afbeeldingen',
    emptyHint: 'Genereer afbeeldingen via de chat',
    imageAlt: (number) => `Karakterafbeelding ${number}`,
    deleteImage: 'Verwijder afbeelding',
    deleteConfirm: 'Afbeelding verwijderen?',
    imageCount: (count) => (count === 1 ? '1 afbeelding' : `${count} afbeeldingen`),
  },
  history: {
    eyebrow: 'Karakter',
    title: 'Versiegeschiedenis',
    active: 'Actief',
    makeActive: 'Actief maken',
    empty: 'Geen geschiedenis beschikbaar.',
    commitInitial: 'Karakter aangemaakt',
    commitAi: 'Bijgewerkt via de AI-chat',
    commitCloned: 'Gekloond van een gedeeld karakter',
    commitImported: (host) => `Geïmporteerd van ${host}`,
    sourceAi: 'AI',
    sourceManual: 'Handmatig',
    sourceRestore: 'Hersteld',
  },
  rulesConversion: {
    convert: (version) => `Zet dit karakter om naar de D&D 5e regels van ${version}.`,
    review: (version) =>
      `Loop het hele karakter na (race/species, background, ability scores, class en subclass features, feats, proficiencies, spells en beperkt gebruik) en werk alles bij naar de ${version}-versie.`,
    choices: 'Maak zelf de best passende keuze waar de regels om een keuze vragen en benoem die, zodat ik kan bijsturen.',
  },
};

export const charactersEn: CharactersTranslations = {
  defaultName: (number) => `New Character ${number}`,
  archive: 'Archive',
  unarchive: 'Unarchive',
  unarchiveFailed: 'Unarchiving failed. Try again.',
  list: {
    title: 'Your Characters',
    subtitle: 'Select a character to view or edit',
    import: 'Import',
    loading: 'Loading characters',
    allArchivedTitle: 'All your characters are archived',
    allArchivedText: 'Create a new one, or bring one back from the archive below.',
    emptyTitle: 'No characters yet',
    emptyText: 'Create your first character to get started!',
    createCharacter: 'Create Character',
    importInstead: 'Or import one from a PDF or a link',
    archivedCount: (count) => `Archived (${count})`,
  },
  tile: {
    unarchiveNamed: (name) => `Unarchive ${name}`,
  },
  page: {
    breadcrumb: 'Breadcrumb',
    overview: 'Overview',
    updating: 'Updating character',
    loading: 'Loading character',
    selectTitle: 'Select a Character',
    selectText: 'Choose a character from the list or create a new one.',
    selectToChat: 'Select a character to chat',
    switchVersionFailed: 'Switching versions failed. Try again.',
    cloned: 'Character cloned — this is now your own copy.',
    cloneFailed: 'Cloning failed. Try again.',
    archived: 'Character archived — you can find it under "Archived" in your character list.',
    unarchived: 'Character put back in your character list.',
    archiveFailed: 'Archiving failed. Try again.',
    sidekickBusy: 'The Sidekick is still busy. Try again when it is done.',
  },
  actions: {
    menuLabel: 'Character actions',
    more: 'More actions',
    downloadPdf: 'Download PDF',
    preparingPdf: 'Preparing PDF…',
    history: 'History',
    convertRules: (version) => `Convert to ${version} rules`,
    convertRulesTitle: (version) => `Rebuild this character under the ${version} rules`,
    clone: 'Clone',
    cloning: 'Cloning…',
    cloneTitle: 'Copy this character to your own account',
    shareTitle: 'Copy a link to this character',
  },
  importDialog: {
    eyebrow: 'New character',
    title: 'Import a character',
    question: 'Where does the character come from?',
    pdfOption: 'PDF',
    pdfText: 'Upload a character sheet. The AI reads it and fills in a new character.',
    linkOption: 'Link',
    linkText: 'Paste the share link of a QuestMind character to get your own copy.',
    linkLabel: 'Share link',
    linkHelp:
      'The Share button on a character sheet copies its link. You get a copy of the character as built, with its portraits; the original stays as it is.',
    submit: 'Import',
    importing: 'Importing…',
    creating: 'Creating the character…',
    failed: 'The character could not be imported. Try again.',
    pdfFailed: 'The PDF could not be imported. Try again.',
  },
  gallery: {
    title: 'Gallery',
    empty: 'No images yet',
    emptyHint: 'Generate images in the chat',
    imageAlt: (number) => `Character image ${number}`,
    deleteImage: 'Delete image',
    deleteConfirm: 'Delete this image?',
    imageCount: (count) => (count === 1 ? '1 image' : `${count} images`),
  },
  history: {
    eyebrow: 'Character',
    title: 'Version History',
    active: 'Active',
    makeActive: 'Make active',
    empty: 'No history available.',
    commitInitial: 'Initial character creation',
    commitAi: 'Updated via AI chat',
    commitCloned: 'Cloned from a shared character',
    commitImported: (host) => `Imported from ${host}`,
    sourceAi: 'AI',
    sourceManual: 'Manual',
    sourceRestore: 'Restored',
  },
  rulesConversion: {
    convert: (version) => `Convert this character to the D&D 5e rules of ${version}.`,
    review: (version) =>
      `Go through the whole character (race/species, background, ability scores, class and subclass features, feats, proficiencies, spells and limited uses) and update everything to the ${version} version.`,
    choices: 'Where the rules ask for a choice, make the best fitting one yourself and name it, so I can adjust it.',
  },
};
