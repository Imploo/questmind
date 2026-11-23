/**
 * Every text of the app, by key — and nothing but the keys. Both languages
 * (`nl.ts`, `en.ts`) must fill in all of it, so a missing translation breaks
 * the build. A text that takes values or has a plural is a function; everything
 * else is a plain string. One key is one complete sentence.
 */
export interface Translations {
  /** Words and short phrases used all over the app. */
  common: {
    save: string;
    cancel: string;
    confirm: string;
    delete: string;
    remove: string;
    close: string;
    edit: string;
    add: string;
    create: string;
    rename: string;
    back: string;
    retry: string;
    undo: string;
    copy: string;
    share: string;
    download: string;
    upload: string;
    search: string;
    settings: string;
    yes: string;
    no: string;
    loading: string;
    busy: string;
    done: string;
    failed: string;
    unknown: string;
    none: string;
    optional: string;
    notAvailable: string;
    name: string;
    description: string;
    email: string;
    language: string;
    signIn: string;
    version: (version: number | string) => string;
  };

  /**
   * Messages for things that went wrong. `reasons` holds one text per `reason`
   * the backend sends along with a refused call (see `callableErrorMessage`).
   */
  errors: {
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
      kankaUnavailable: string;
      storyVersionNotReady: string;
      podcastAlreadyGenerating: string;
      podcastNotReady: string;
      podcastGenerating: string;
      sessionHasNoStory: string;
      noUploadedAudio: string;
      noTranscription: string;
      messageLength: string;
      messageAlreadySent: string;
      attachmentNotPdf: string;
      attachmentTooLarge: string;
    };
  };

  /** The app frame: the update bar and the loading screen. */
  app: {
    updateAvailable: string;
    refresh: string;
    loading: string;
  };

  /** The nav rail, the top bars and the panel switcher. */
  nav: {
    characters: string;
    campaigns: string;
    admin: string;
    mainNavigation: string;
    openMenu: string;
    closeMenu: string;
    openProfile: string;
    panels: string;
    sheet: string;
    chat: string;
    chatUnread: string;
  };

  /** The profile drawer. */
  profile: {
    eyebrow: string;
    title: string;
    languageHint: string;
    signOut: string;
  };

  /** Signing in, signing up and resetting a password. */
  auth: {
    subtitleSignIn: string;
    subtitleSignUp: string;
    subtitleReset: string;
    signingIn: string;
    signInWithGoogle: string;
    or: string;
    terms: string;
    resetSent: string;
    signInFailed: string;
    passwordLabel: string;
    emailPlaceholder: string;
    emailRequired: string;
    emailInvalid: string;
    passwordRequired: string;
    passwordTooShort: (minLength: number) => string;
    passwordHint: (minLength: number) => string;
    sending: string;
    processing: string;
    createAccount: string;
    sendResetLink: string;
    signIn: string;
    haveAccount: string;
    signInLink: string;
    backToSignIn: string;
    forgotPassword: string;
    noAccount: string;
    signUpLink: string;
    errors: {
      generic: string;
      failed: string;
      invalidEmail: string;
      userDisabled: string;
      userNotFound: string;
      wrongPassword: string;
      emailInUse: string;
      weakPassword: string;
      notAllowed: string;
      popupBlocked: string;
      cancelled: string;
      network: string;
      tooManyRequests: string;
      invalidCredential: string;
    };
  };

  /** The campaign list, the campaign page, its settings, members and the voice intro. */
  campaign: {
    defaultName: (name: string) => string;
    saving: string;
    roles: {
      owner: string;
      member: string;
    };
    list: {
      title: string;
      intro: string;
      loading: string;
      empty: string;
      newCampaign: string;
      createTitle: string;
      createLabel: string;
      namePlaceholder: string;
      descriptionLabel: string;
      descriptionPlaceholder: string;
      open: string;
      processing: (count: number) => string;
    };
    page: {
      back: string;
      sessions: (count: number) => string;
      players: (count: number) => string;
      lastPlayed: (day: string) => string;
      settings: string;
      newSession: string;
      tabsLabel: string;
      tabs: {
        story: string;
        sessions: string;
        podcasts: string;
      };
    };
    settings: {
      title: string;
      general: string;
      owner: string;
      kankaEnable: string;
      kankaCampaignId: string;
      kankaCampaignIdPlaceholder: string;
      kankaHelp: string;
      allowMembersToCreateSessions: string;
      save: string;
      saved: string;
      transcription: string;
      noCampaign: string;
    };
    members: {
      title: (count: number) => string;
      inviteLabel: string;
      invitePlaceholder: string;
      invite: string;
      inviting: string;
      invited: string;
      removeConfirm: string;
    };
    voiceIntro: {
      title: string;
      helpBefore: string;
      helpExample: string;
      helpAfter: string;
      audioUnsupported: string;
      empty: string;
      upload: string;
      replace: string;
      uploadProgress: string;
      removeConfirm: string;
      unsupportedFileType: string;
      fileTooLarge: (maxMb: number) => string;
      wavTooLarge: (maxMb: number) => string;
      uploadFailed: string;
      removeFailed: string;
    };
    voiceRoster: {
      label: string;
      help: string;
      placeholder: string;
      save: string;
      empty: string;
      saveFailed: string;
    };
    errors: {
      notConfigured: string;
      campaignNotFound: string;
      onlyOwnerCanInvite: string;
      userNotFound: (email: string) => string;
      alreadyMember: string;
      cannotRemoveOwner: string;
      onlyOwnerCanRemove: string;
      loadFailed: string;
      createFailed: string;
      saveFailed: string;
      inviteFailed: string;
      removeMemberFailed: string;
    };
  };

  /** The campaign story page, its versions and its podcasts. */
  campaignStory: {
    title: string;
    generate: string;
    update: string;
    versions: string;
    loading: string;
    changedSessions: (count: number) => string;
    coversUntil: (day: string) => string;
    updatedOn: (date: string) => string;
    upToDate: string;
    noStory: string;
    readySessions: (count: number) => string;
    write: string;
    latestVersion: (version: number) => string;
    sessionNotIncluded: string;
    sessionNotIncludedHelp: string;
    sessionChanged: string;
    sessionChangedHelp: string;
    updateCampaignStory: string;
    sessionCount: (count: number) => string;
    journalCount: (count: number) => string;
    versionFailed: (version: number) => string;
    generationFailed: string;
    startFailed: string;
    emptyTitle: string;
    emptyNoSessions: string;
    emptyWaiting: string;
    emptyKanka: string;
    emptyOwner: (count: number) => string;
    emptyMember: string;
    uploadFirst: string;
    toSessions: string;
    olderVersion: string;
    viewingVersion: (version: number) => string;
    backToLatest: string;
    untitled: string;
    downloadName: string;
    /** In the line under the version number, when the owner edited the version by hand. */
    edited: string;
    edit: {
      button: string;
      titleLabel: string;
      contentLabel: string;
      help: string;
      save: string;
    };
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
  };

  /** Editing a story (of a session or of the campaign) together with the other members. */
  storyEdit: {
    /** Someone else holds the lock on the story. */
    lockedBy: (name: string) => string;
    /** While this member has the form open: someone else took the lock over. */
    takenOver: (name: string) => string;
    /** A member whose name is not known. */
    someone: string;
    startFailed: string;
    changedBy: (name: string) => string;
    changedBySomeone: string;
    conflictHelp: string;
    keepMine: string;
    loadCurrent: string;
    showCurrent: string;
    newVersionBeingWritten: string;
    confirmGenerate: (name: string) => string;
    saveFailed: string;
  };

  /** Sessions: the list, the upload, the story tab and transcription. */
  audio: {
    untitledSession: string;
    defaultSessionTitle: (fileName: string) => string;
    defaultStoryTitle: string;
    noDate: string;
    noCampaignSelected: string;
    page: {
      breadcrumb: string;
      previous: string;
      next: string;
      previousLabel: (title: string) => string;
      nextLabel: (title: string) => string;
      notFoundTitle: string;
      notFoundText: string;
    };
    list: {
      ariaLabel: string;
      emptyTitle: string;
      emptyText: string;
      uploadFirst: string;
      statusUploading: string;
      statusProcessing: string;
      you: string;
      podcast: string;
    };
    upload: {
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
      edited: string;
      preview: string;
      editStory: string;
      editHelp: string;
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
      treatment: string;
      downloadTitle: string;
      retranscribe: string;
      retranscribeTitle: string;
      play: string;
      pause: string;
      position: string;
    };
  };

  /** Podcasts: the library, a podcast version with its player, sharing and the public share page. */
  podcast: {
    label: string;
    versionTitle: (version: number) => string;
    downloadTitle: string;
    delete: string;
    deleteLabel: (version: number) => string;
    deleteConfirm: (version: number) => string;
    deleteFailed: string;
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
      intro: string;
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
  };

  /** Progress of a session, a podcast or a campaign story. */
  progress: {
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
  };

  /** The chat with The Sidekick. */
  chat: {
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
  };

  /** The character list, the character page and the dialogs around a character. */
  characters: {
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
  };

  /** The character sheet: the app texts around the game terms. */
  sheet: {
    level: (level: number) => string;
    enlargePortrait: string;
    portraitOf: (name: string) => string;
    player: (name: string) => string;
    rulesTag: (version: string) => string;
    rulesTitle: (version: string) => string;
    archived: string;
    spendHitDie: string;
    regainHitDie: string;
    noAttacks: string;
    noBonusActions: string;
    noReactions: string;
    noFeatures: string;
    noEquipment: string;
    noDescription: string;
    sectionsLabel: string;
    slotLabel: (level: number) => string;
    useLabel: (name: string) => string;
    attackRoll: {
      attackBonus: string;
      savingThrow: (ability: string) => string;
    };
    cast: {
      button: string;
      noSlots: string;
      spell: (name: string) => string;
      withoutSlot: string;
      noSlotNeeded: string;
      noSlotsAtLevel: string;
      upcast: (level: number) => string;
      usesLeft: (count: number) => string;
      slotsLeft: (count: number) => string;
    };
    share: {
      copied: string;
      copyPrompt: string;
    };
  };

  /** Playing a character: hit points, rests, casting, trackers and the messages that follow. */
  play: {
    hp: {
      amount: string;
      heal: string;
      damage: string;
    };
    concentration: {
      active: string;
      spellMark: string;
      on: (spell: string) => string;
      stop: (spell: string) => string;
    };
    conditions: {
      remove: (condition: string) => string;
      lowerExhaustion: string;
      raiseExhaustion: string;
      exhaustionHint: (maxLevel: number) => string;
    };
    cast: {
      title: (spell: string) => string;
      hint: string;
      startsConcentration: string;
      startsConcentrationEnding: (current: string) => string;
    };
    rest: {
      title: string;
      nothingToRestore: string;
      note: string;
      confirm: string;
      slotsRestored: (count: number) => string;
      concentrationEnds: (spell: string) => string;
    };
    pips: {
      spend: (label: string) => string;
      restore: (label: string) => string;
      pip: (label: string, position: number, spent: boolean) => string;
      left: (left: number, total: number, label: string) => string;
    };
    tracker: {
      uses: string;
      fewerUses: string;
      moreUses: string;
      rechargesOn: string;
      manual: string;
      add: string;
      edit: string;
      remove: string;
      summary: (uses: number, recharge: 'shortRest' | 'longRest' | 'manual') => string;
    };
    coins: {
      amountLabel: (coin: string) => string;
      change: (coin: string) => string;
      changeAmount: (amount: number, coin: string) => string;
    };
    inventory: {
      value: string;
      valuePlaceholder: string;
      descriptionPlaceholder: string;
      removeItem: string;
      noDescription: string;
      addPlaceholder: string;
      newItemName: string;
    };
    feats: {
      custom: string;
      edit: string;
      remove: string;
      descriptionPlaceholder: string;
      noDescription: string;
      addPlaceholder: string;
      newFeatName: string;
      usesLabel: (feat: string) => string;
    };
    toast: {
      dismiss: string;
    };
    messages: {
      downToZero: string;
      damageTaken: (damage: number) => string;
      damageTakenConcentrating: (damage: number, spell: string, saveDc: number) => string;
      healed: (hitPoints: number) => string;
      tempHpSet: (hitPoints: number) => string;
      itemRemoved: (item: string) => string;
      featRemoved: (feat: string) => string;
      cast: (cast: {
        spell: string;
        /** Level of the slot that was spent; left out when the cast cost no slot. */
        slotLevel?: number;
        /** A use of the spell's own tracker was spent instead of a slot. */
        useSpent?: boolean;
        /** The spell took over concentration. */
        concentrating?: boolean;
        /** The other spell that concentration moved away from. */
        movedFrom?: string;
      }) => string;
      shortRest: (recharged: string[], pactSlots: number) => string;
      longRest: string;
    };
  };
}
