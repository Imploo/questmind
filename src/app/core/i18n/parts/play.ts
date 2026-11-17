/** Playing a character: hit points, rests, casting, trackers and the messages that follow. */
export interface PlayTranslations {
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
}

export const playNl: PlayTranslations = {
  hp: {
    amount: 'Aantal',
    heal: 'Herstellen',
    damage: 'Damage',
  },
  concentration: {
    active: 'Concentratie',
    spellMark: 'Spell met concentratie',
    on: (spell) => `Concentratie · ${spell}`,
    stop: (spell) => `Concentratie op ${spell} stoppen`,
  },
  conditions: {
    remove: (condition) => `${condition} verwijderen`,
    lowerExhaustion: 'Exhaustion verlagen',
    raiseExhaustion: 'Exhaustion verhogen',
    exhaustionHint: (maxLevel) => `Level 0–${maxLevel} · een long rest haalt er één level af`,
  },
  cast: {
    title: (spell) => `${spell} casten`,
    hint: 'Kies het slot level om mee te casten.',
    startsConcentration: 'Start concentratie',
    startsConcentrationEnding: (current) => `Start concentratie — ${current} stopt`,
  },
  rest: {
    title: 'Long rest nemen?',
    nothingToRestore: 'Alles is al op volle sterkte.',
    note: 'Conditions blijven zoals ze zijn. Je kunt de long rest direct daarna ongedaan maken.',
    confirm: 'Long rest nemen',
    slotsRestored: (count) => `${count} hersteld`,
    concentrationEnds: (spell) => `${spell} stopt`,
  },
  pips: {
    spend: (label) => `${label}: 1 gebruiken`,
    restore: (label) => `${label}: 1 terugzetten`,
    pip: (label, position, spent) => `${label} ${position}, ${spent ? 'gebruikt' : 'beschikbaar'}`,
    left: (left, total, label) => `${label}: ${left} van ${total} beschikbaar`,
  },
  tracker: {
    uses: 'Aantal keer',
    fewerUses: 'Eén keer minder',
    moreUses: 'Eén keer meer',
    rechargesOn: 'Laadt op bij',
    add: 'Tracker toevoegen',
    edit: 'Tracker bewerken',
    remove: 'Tracker verwijderen',
    summary: (uses, recharge) => {
      const when = recharge === 'shortRest' ? 'laadt op bij een short rest' : recharge === 'longRest' ? 'laadt op bij een long rest' : 'handmatig terugzetten';
      return `Tracker: ${uses} keer · ${when}`;
    },
  },
  coins: {
    amountLabel: (coin) => `Aantal ${coin} pieces`,
    change: (coin) => `${coin} aanpassen`,
    changeAmount: (amount, coin) => `${amount} ${coin}, aanpassen`,
  },
  inventory: {
    value: 'Waarde',
    valuePlaceholder: '20, 50 gp, 3 charges…',
    descriptionPlaceholder: 'Wat het is, wat het doet…',
    removeItem: 'Item verwijderen',
    noDescription: 'Geen beschrijving',
    addPlaceholder: 'Item toevoegen…',
    newItemName: 'Naam van het nieuwe item',
  },
  feats: {
    custom: 'Eigen feat',
    edit: 'Feat bewerken',
    remove: 'Feat verwijderen',
    descriptionPlaceholder: 'Wat de feat doet…',
    noDescription: 'Nog geen beschrijving',
    addPlaceholder: 'Feat toevoegen…',
    newFeatName: 'Naam van de nieuwe feat',
    usesLabel: (feat) => `${feat}`,
  },
  toast: {
    dismiss: 'Sluiten',
  },
  messages: {
    downToZero: 'Je staat op 0 HP — rol death saves aan het begin van elke beurt.',
    damageTaken: (damage) => `${damage} damage gekregen.`,
    damageTakenConcentrating: (damage, spell, saveDc) =>
      `${damage} damage gekregen. Je concentreert op ${spell} — maak een DC ${saveDc} Constitution save.`,
    healed: (hitPoints) => (hitPoints === 1 ? '1 hit point hersteld.' : `${hitPoints} hit points hersteld.`),
    tempHpSet: (hitPoints) => `Temporary hit points op ${hitPoints} gezet.`,
    itemRemoved: (item) => `${item} uit de inventaris verwijderd.`,
    featRemoved: (feat) => `Feat ${feat} verwijderd.`,
    cast: ({ spell, slotLevel, useSpent, concentrating, movedFrom }) => {
      const cost = useSpent ? ' — één keer gebruikt' : slotLevel === undefined ? '' : ` — level ${slotLevel} slot gebruikt`;
      const concentration = movedFrom ? `, concentratie gaat over van ${movedFrom}` : concentrating ? ', concentratie loopt' : '';
      return `${spell} gecast${cost}${concentration}.`;
    },
    shortRest: (recharged, pactSlots) => {
      const features = recharged.length ? [`${recharged.join(', ')} opgeladen`] : [];
      const slots = pactSlots ? [`${pactSlots} pact ${pactSlots === 1 ? 'slot' : 'slots'} hersteld`] : [];
      const summary = [...features, ...slots].join(', ') || 'niets om op te laden';
      return `Short rest — ${summary}. Besteed hit dice om te herstellen.`;
    },
    longRest: 'Long rest — hit points, spell slots en features hersteld.',
  },
};

export const playEn: PlayTranslations = {
  hp: {
    amount: 'Amount',
    heal: 'Heal',
    damage: 'Damage',
  },
  concentration: {
    active: 'Concentrating',
    spellMark: 'Concentration spell',
    on: (spell) => `Concentrating · ${spell}`,
    stop: (spell) => `Stop concentrating on ${spell}`,
  },
  conditions: {
    remove: (condition) => `Remove ${condition}`,
    lowerExhaustion: 'Lower exhaustion',
    raiseExhaustion: 'Raise exhaustion',
    exhaustionHint: (maxLevel) => `Level 0–${maxLevel} · a long rest removes one level`,
  },
  cast: {
    title: (spell) => `Cast ${spell}`,
    hint: 'Choose the slot level to cast at.',
    startsConcentration: 'Starts concentration',
    startsConcentrationEnding: (current) => `Starts concentration — ${current} ends`,
  },
  rest: {
    title: 'Take a long rest?',
    nothingToRestore: 'Everything is already at full strength.',
    note: 'Conditions stay as they are. You can undo the rest right afterwards.',
    confirm: 'Take long rest',
    slotsRestored: (count) => `${count} restored`,
    concentrationEnds: (spell) => `${spell} ends`,
  },
  pips: {
    spend: (label) => `Spend 1 of ${label}`,
    restore: (label) => `Restore 1 of ${label}`,
    pip: (label, position, spent) => `${label} ${position}, ${spent ? 'spent' : 'available'}`,
    left: (left, total, label) => `${left} of ${total} ${label} available`,
  },
  tracker: {
    uses: 'Uses',
    fewerUses: 'Fewer uses',
    moreUses: 'More uses',
    rechargesOn: 'Recharges on',
    add: 'Add tracker',
    edit: 'Edit tracker',
    remove: 'Remove tracker',
    summary: (uses, recharge) => {
      const when = recharge === 'shortRest' ? 'recharges on a short rest' : recharge === 'longRest' ? 'recharges on a long rest' : 'reset by hand';
      return `Tracker: ${uses} ${uses === 1 ? 'use' : 'uses'} · ${when}`;
    },
  },
  coins: {
    amountLabel: (coin) => `${coin} pieces`,
    change: (coin) => `Change ${coin}`,
    changeAmount: (amount, coin) => `${amount} ${coin}, change`,
  },
  inventory: {
    value: 'Value',
    valuePlaceholder: '20, 50 gp, 3 charges…',
    descriptionPlaceholder: 'What it is, what it does…',
    removeItem: 'Remove item',
    noDescription: 'No description',
    addPlaceholder: 'Add an item…',
    newItemName: 'Name of the new item',
  },
  feats: {
    custom: 'Custom feat',
    edit: 'Edit feat',
    remove: 'Remove feat',
    descriptionPlaceholder: 'What the feat does…',
    noDescription: 'No description yet',
    addPlaceholder: 'Add a feat…',
    newFeatName: 'Name of the new feat',
    usesLabel: (feat) => `${feat} use`,
  },
  toast: {
    dismiss: 'Dismiss',
  },
  messages: {
    downToZero: 'Down to 0 HP — roll death saves at the start of each turn.',
    damageTaken: (damage) => `Took ${damage} damage.`,
    damageTakenConcentrating: (damage, spell, saveDc) =>
      `Took ${damage} damage. Concentrating on ${spell} — make a DC ${saveDc} Constitution save.`,
    healed: (hitPoints) => (hitPoints === 1 ? 'Healed 1 hit point.' : `Healed ${hitPoints} hit points.`),
    tempHpSet: (hitPoints) => `Temporary hit points set to ${hitPoints}.`,
    itemRemoved: (item) => `Removed ${item} from the inventory.`,
    featRemoved: (feat) => `Removed the feat ${feat}.`,
    cast: ({ spell, slotLevel, useSpent, concentrating, movedFrom }) => {
      const cost = useSpent ? ' — one use spent' : slotLevel === undefined ? '' : ` — level ${slotLevel} slot used`;
      const concentration = movedFrom ? `, concentration moves from ${movedFrom}` : concentrating ? ', concentrating' : '';
      return `Cast ${spell}${cost}${concentration}.`;
    },
    shortRest: (recharged, pactSlots) => {
      const features = recharged.length ? [`${recharged.join(', ')} recharged`] : [];
      const slots = pactSlots ? [`${pactSlots} pact ${pactSlots === 1 ? 'slot' : 'slots'} restored`] : [];
      const summary = [...features, ...slots].join(', ') || 'nothing to recharge';
      return `Short rest — ${summary}. Spend hit dice to heal.`;
    },
    longRest: 'Long rest — hit points, spell slots and features restored.',
  },
};
