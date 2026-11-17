/** The character sheet: the app texts around the game terms. */
export interface SheetTranslations {
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
  rechargeManual: string;
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
}

export const sheetNl: SheetTranslations = {
  level: (level) => `Level ${level}`,
  enlargePortrait: 'Portret vergroten',
  portraitOf: (name) => `Portret van ${name}`,
  player: (name) => `Speler: ${name}`,
  rulesTag: (version) => `${version}-regels`,
  rulesTitle: (version) => `Gebouwd met de 5e-regels van ${version}`,
  archived: 'Gearchiveerd',
  spendHitDie: 'Hit die gebruiken',
  regainHitDie: 'Hit die terugkrijgen',
  noAttacks: 'Nog geen attacks ingesteld',
  noBonusActions: 'Geen bonus actions',
  noReactions: 'Geen reactions',
  noFeatures: 'Nog geen features',
  noEquipment: 'Geen equipment',
  noDescription: 'Geen beschrijving beschikbaar',
  sectionsLabel: 'Onderdelen van de sheet',
  rechargeManual: 'Handmatig',
  slotLabel: (level) => `Level ${level} slot`,
  useLabel: (name) => `gebruik van ${name}`,
  attackRoll: {
    attackBonus: 'Attack bonus',
    savingThrow: (ability) => `Het doelwit maakt een ${ability} saving throw`,
  },
  cast: {
    button: 'Cast',
    noSlots: 'Geen slots',
    spell: (name) => `${name} casten`,
    withoutSlot: 'Zonder slot',
    noSlotNeeded: 'Geen slot nodig',
    noSlotsAtLevel: 'Geen slots op dit level',
    upcast: (level) => `Level ${level} · upcast`,
    usesLeft: (count) => (count > 0 ? `Nog ${count} keer` : 'Niets meer over'),
    slotsLeft: (count) => (count <= 0 ? 'Niets meer over' : count === 1 ? 'Nog 1 slot' : `Nog ${count} slots`),
  },
  share: {
    copied: 'Link gekopieerd — iedereen met deze link kan dit karakter bekijken.',
    copyPrompt: 'Kopieer de link naar dit karakter:',
  },
};

export const sheetEn: SheetTranslations = {
  level: (level) => `Level ${level}`,
  enlargePortrait: 'Enlarge portrait',
  portraitOf: (name) => `Portrait of ${name}`,
  player: (name) => `Player: ${name}`,
  rulesTag: (version) => `${version} rules`,
  rulesTitle: (version) => `Built with the 5e rules of ${version}`,
  archived: 'Archived',
  spendHitDie: 'Spend a hit die',
  regainHitDie: 'Regain a hit die',
  noAttacks: 'No attacks configured',
  noBonusActions: 'No bonus actions',
  noReactions: 'No reactions',
  noFeatures: 'No features yet',
  noEquipment: 'No equipment',
  noDescription: 'No description available',
  sectionsLabel: 'Sections of the sheet',
  rechargeManual: 'Manual',
  slotLabel: (level) => `Level ${level} slot`,
  useLabel: (name) => `${name} use`,
  attackRoll: {
    attackBonus: 'Attack bonus',
    savingThrow: (ability) => `The target makes a ${ability} saving throw`,
  },
  cast: {
    button: 'Cast',
    noSlots: 'No slots',
    spell: (name) => `Cast ${name}`,
    withoutSlot: 'Without a slot',
    noSlotNeeded: 'No slot needed',
    noSlotsAtLevel: 'No slots at this level',
    upcast: (level) => `Level ${level} · upcast`,
    usesLeft: (count) => (count <= 0 ? 'None left' : count === 1 ? '1 use left' : `${count} uses left`),
    slotsLeft: (count) => (count <= 0 ? 'None left' : count === 1 ? '1 slot left' : `${count} slots left`),
  },
  share: {
    copied: 'Link copied — anyone with this link can view this character.',
    copyPrompt: 'Copy the link to this character:',
  },
};
