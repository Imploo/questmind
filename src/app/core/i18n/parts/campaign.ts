/** Campaign settings, members, the campaign selector and the voice intro. */
export interface CampaignTranslations {
  defaultName: (name: string) => string;
  saving: string;
  roles: {
    owner: string;
    member: string;
  };
  selector: {
    campaign: string;
    campaigns: string;
    select: string;
    empty: string;
    newCampaign: string;
    createTitle: string;
    namePlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
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
}

export const campaignNl: CampaignTranslations = {
  defaultName: (name) => (name ? `Campagne van ${name}` : 'Mijn campagne'),
  saving: 'Opslaan...',
  roles: {
    owner: 'Eigenaar',
    member: 'Lid',
  },
  selector: {
    campaign: 'Campagne',
    campaigns: 'Campagnes',
    select: 'Selecteer een campagne',
    empty: 'Geen campagnes gevonden',
    newCampaign: 'Nieuwe campagne',
    createTitle: 'Nieuwe campagne aanmaken',
    namePlaceholder: 'Mijn D&D-campagne',
    descriptionLabel: 'Beschrijving (optioneel)',
    descriptionPlaceholder: 'Beschrijving van je campagne...',
  },
  settings: {
    title: 'Campagne-instellingen',
    general: 'Algemene instellingen',
    owner: 'Eigenaar van de campagne',
    kankaEnable: 'Kanka-integratie inschakelen',
    kankaCampaignId: 'Kanka-campagne-ID',
    kankaCampaignIdPlaceholder: 'bijv. 123456',
    kankaHelp: 'Wordt gebruikt voor de Kanka-integratie bij het genereren van verhalen.',
    allowMembersToCreateSessions: 'Leden mogen sessies aanmaken',
    save: 'Instellingen opslaan',
    saved: 'Instellingen opgeslagen!',
    transcription: 'Transcriptie',
    noCampaign: 'Geen campagne geselecteerd',
  },
  members: {
    title: (count) => `Leden (${count})`,
    inviteLabel: 'Lid uitnodigen',
    invitePlaceholder: 'naam@voorbeeld.nl',
    invite: 'Uitnodigen',
    inviting: 'Uitnodigen...',
    invited: 'De gebruiker is uitgenodigd!',
    removeConfirm: 'Weet je zeker dat je dit lid wilt verwijderen?',
  },
  voiceIntro: {
    title: 'Voorstelrondje (sprekerherkenning)',
    helpBefore:
      'Neem op hoe iedereen aan tafel zich voorstelt en upload de opname hier. Die wordt bij elke transcriptie meegestuurd, zodat de AI weet welke stem bij welk karakter hoort. Laat iedereen ongeveer 10–20 seconden praten, bijvoorbeeld:',
    helpExample: '"Hoi, ik ben Matt en ik speel Thorin, een dwarf fighter."',
    helpAfter:
      'De DM stelt zich voor als de DM. Gebruik dezelfde microfoonopstelling als tijdens je sessies en neem het opnieuw op als de groep verandert. Vul hieronder de spreekvolgorde in, zodat de AI weet welke naam bij welke stem hoort.',
    audioUnsupported: 'Je browser kan geen audio afspelen.',
    empty: 'Nog geen voorstelrondje geüpload.',
    upload: 'Opname uploaden',
    replace: 'Opname vervangen',
    uploadProgress: 'Voortgang van de upload van het voorstelrondje',
    removeConfirm:
      'Het voorstelrondje verwijderen? Transcripties gebruiken het dan niet meer om sprekers te herkennen.',
    unsupportedFileType:
      'Dit bestandstype wordt niet ondersteund. Kies een audiobestand (MP3, WAV, M4A, OGG).',
    fileTooLarge: (maxMb) => `Het bestand is te groot. De maximale grootte is ${maxMb}MB.`,
    wavTooLarge: (maxMb) => `Het bestand is te groot. De maximale grootte is ${maxMb}MB voor WAV.`,
    uploadFailed: 'Het voorstelrondje uploaden is mislukt',
    removeFailed: 'Het voorstelrondje verwijderen is mislukt',
  },
  voiceRoster: {
    label: 'Spreekvolgorde van het voorstelrondje',
    help: 'Beschrijf wie in welke volgorde spreekt in de opname hierboven, één persoon per regel. De AI gebruikt dit om elke stem in het voorstelrondje aan het juiste karakter te koppelen.',
    placeholder: '1. DM (Matt)\n2. Thorin, dwarf fighter (Jan)\n3. Lyra, elf wizard (Sanne)',
    save: 'Spreekvolgorde opslaan',
    empty: 'Geen spreekvolgorde opgegeven.',
    saveFailed: 'De spreekvolgorde opslaan is mislukt',
  },
  errors: {
    notConfigured: 'Firestore is niet geconfigureerd',
    campaignNotFound: 'Campagne niet gevonden',
    onlyOwnerCanInvite: 'Alleen de eigenaar van de campagne kan leden uitnodigen',
    userNotFound: (email) =>
      `Geen gebruiker gevonden met e-mailadres ${email}. Diegene moet eerst een account aanmaken.`,
    alreadyMember: 'Deze gebruiker is al lid van deze campagne',
    cannotRemoveOwner: 'De eigenaar van de campagne kan niet worden verwijderd',
    onlyOwnerCanRemove: 'Alleen de eigenaar van de campagne kan leden verwijderen',
    loadFailed: 'De campagnes laden is mislukt',
    createFailed: 'De campagne aanmaken is mislukt',
    saveFailed: 'De instellingen opslaan is mislukt',
    inviteFailed: 'De gebruiker uitnodigen is mislukt',
    removeMemberFailed: 'Het lid verwijderen is mislukt',
  },
};

export const campaignEn: CampaignTranslations = {
  defaultName: (name) => (name ? `${name} Campaign` : 'My Campaign'),
  saving: 'Saving...',
  roles: {
    owner: 'Owner',
    member: 'Member',
  },
  selector: {
    campaign: 'Campaign',
    campaigns: 'Campaigns',
    select: 'Select a campaign',
    empty: 'No campaigns found',
    newCampaign: 'New campaign',
    createTitle: 'Create a new campaign',
    namePlaceholder: 'My D&D campaign',
    descriptionLabel: 'Description (optional)',
    descriptionPlaceholder: 'Describe your campaign...',
  },
  settings: {
    title: 'Campaign Settings',
    general: 'General Settings',
    owner: 'Campaign Owner',
    kankaEnable: 'Enable Kanka Integration',
    kankaCampaignId: 'Kanka Campaign ID',
    kankaCampaignIdPlaceholder: 'e.g. 123456',
    kankaHelp: 'Used for Kanka integration when generating stories.',
    allowMembersToCreateSessions: 'Allow members to create sessions',
    save: 'Save Settings',
    saved: 'Settings saved successfully!',
    transcription: 'Transcription',
    noCampaign: 'No campaign selected',
  },
  members: {
    title: (count) => `Members (${count})`,
    inviteLabel: 'Invite Member',
    invitePlaceholder: 'user@example.com',
    invite: 'Invite',
    inviting: 'Inviting...',
    invited: 'User invited successfully!',
    removeConfirm: 'Are you sure you want to remove this member?',
  },
  voiceIntro: {
    title: 'Voice introduction (speaker recognition)',
    helpBefore:
      'Record everyone at the table introducing themselves, then upload it here. It is sent along with every transcription so the AI can tell which voice belongs to which character. Let each person talk for about 10–20 seconds, e.g.',
    helpExample: `"Hi, I'm Matt and I play Thorin, a dwarven fighter."`,
    helpAfter:
      'The DM introduces themselves as the DM. Use the same microphone setup as during your sessions and re-record when the party changes. Fill in the speaking order below so the AI knows which name belongs to which voice.',
    audioUnsupported: 'Your browser does not support audio playback.',
    empty: 'No voice introduction uploaded yet.',
    upload: 'Upload recording',
    replace: 'Replace recording',
    uploadProgress: 'Voice introduction upload progress',
    removeConfirm:
      'Remove the voice introduction? Transcriptions will no longer use it for speaker recognition.',
    unsupportedFileType: 'Unsupported file type. Please choose an audio file (MP3, WAV, M4A, OGG).',
    fileTooLarge: (maxMb) => `File is too large. Maximum size is ${maxMb}MB.`,
    wavTooLarge: (maxMb) => `File is too large. Maximum size is ${maxMb}MB for WAV.`,
    uploadFailed: 'Failed to upload voice introduction',
    removeFailed: 'Failed to remove voice introduction',
  },
  voiceRoster: {
    label: 'Speaking order of the introduction',
    help: 'Describe who speaks in which order in the recording above, one person per line. The AI uses this to link each voice in the introduction to the right character.',
    placeholder: '1. DM (Matt)\n2. Thorin, dwarven fighter (Jan)\n3. Lyra, elven wizard (Sanne)',
    save: 'Save speaking order',
    empty: 'No speaking order provided.',
    saveFailed: 'Failed to save speaking order',
  },
  errors: {
    notConfigured: 'Firestore is not configured',
    campaignNotFound: 'Campaign not found',
    onlyOwnerCanInvite: 'Only the campaign owner can invite users',
    userNotFound: (email) =>
      `No user found with email: ${email}. The user must create an account first.`,
    alreadyMember: 'User is already a member of this campaign',
    cannotRemoveOwner: 'Cannot remove the campaign owner',
    onlyOwnerCanRemove: 'Only the campaign owner can remove members',
    loadFailed: 'Failed to load campaigns',
    createFailed: 'Failed to create campaign',
    saveFailed: 'Failed to save settings',
    inviteFailed: 'Failed to invite user',
    removeMemberFailed: 'Failed to remove member',
  },
};
