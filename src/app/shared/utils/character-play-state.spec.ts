import { describe, it, expect } from 'vitest';
import { Coins, DndCharacter } from '../models/dnd-character.model';
import { en } from '../../core/i18n/en';
import { nl } from '../../core/i18n/nl';
import {
  addCustomFeat,
  addInventoryItem,
  applyDamage,
  applyHealing,
  applyPlayStateToCharacter,
  castSpell,
  currentPlayState,
  customFeatUsesKey,
  hasPactMagic,
  longRest,
  longRestPreview,
  removeCustomFeat,
  removeInventoryItem,
  resolvePlayState,
  setCoins,
  setCustomFeatUses,
  setSlotsExpended,
  setTempHp,
  setUsesSpent,
  shortRest,
  toggleCondition,
  updateCustomFeat,
  updateInventoryItem,
  usesKey,
} from './character-play-state';

const REBUKE = usesKey('feature', 'Hellish Rebuke');
const CHANNEL = usesKey('feature', 'Channel Divinity');
const MISTY = usesKey('spell', 'Misty Step');

function character(overrides: Partial<DndCharacter> = {}): DndCharacter {
  const ability = { score: 10, modifier: 0 };
  const save = { proficient: false, modifier: 0 };
  return {
    name: 'Vesper',
    class: 'Paladin',
    level: 5,
    race: 'Tiefling',
    experiencePoints: 0,
    abilities: { strength: ability, dexterity: ability, constitution: ability, intelligence: ability, wisdom: ability, charisma: ability },
    skills: [],
    savingThrows: { strength: save, dexterity: save, constitution: save, intelligence: save, wisdom: save, charisma: save },
    passiveWisdom: 10,
    proficiencies: [],
    languages: [],
    armorClass: 18,
    initiative: 0,
    speed: 30,
    hitPoints: { max: 44, current: 44, temp: 0 },
    hitDice: { total: 5, current: 5, die: 'd10' },
    deathSaves: { successes: 0, failures: 0 },
    attacks: [],
    spellcasting: {
      slots: [{ level: 2, total: 2, expended: 0 }, { level: 1, total: 4, expended: 1 }],
      spells: [
        { name: 'Bless', level: 1 },
        { name: 'Misty Step', level: 2, uses: { max: 1, recharge: 'longRest' } },
      ],
    },
    equipment: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    featuresAndTraits: [
      { name: 'Hellish Rebuke', description: '', source: 'Race', uses: { max: 1, recharge: 'longRest' } },
      { name: 'Channel Divinity', description: '', source: 'Class', uses: { max: 1, recharge: 'shortRest' } },
      { name: 'Darkvision', description: '', source: 'Race' },
    ],
    ...overrides,
  };
}

describe('resolvePlayState', () => {
  it('falls back to the values on the character when nothing is stored', () => {
    const resolved = resolvePlayState(character(), null);
    expect(resolved.hp).toEqual({ current: 44, max: 44, temp: 0 });
    expect(resolved.hitDice).toEqual({ current: 5, total: 5, die: 'd10' });
    expect(resolved.slots).toEqual([
      { level: 1, total: 4, expended: 1 },
      { level: 2, total: 2, expended: 0 },
    ]);
    expect(resolved.usesSpent).toEqual({ [REBUKE]: 0, [CHANNEL]: 0, [MISTY]: 0 });
    expect(resolved.conditions).toEqual([]);
    expect(resolved.concentration).toBeNull();
  });

  it('clamps stored values to the limits of the current build', () => {
    const resolved = resolvePlayState(character(), {
      hp: { current: 80, temp: 3 },
      hitDice: 9,
      slotsExpended: { '1': 7, '5': 2 },
      usesSpent: { [REBUKE]: 4, 'feature:gone': 1 },
      exhaustion: 12,
    });
    expect(resolved.hp.current).toBe(44);
    expect(resolved.hp.temp).toBe(3);
    expect(resolved.hitDice.current).toBe(5);
    expect(resolved.slots[0].expended).toBe(4);
    expect(resolved.slots).toHaveLength(2);
    expect(resolved.usesSpent[REBUKE]).toBe(1);
    expect(resolved.usesSpent).not.toHaveProperty('feature:gone');
    expect(resolved.exhaustion).toBe(6);
  });

  it('reads slots stored as a record', () => {
    const c = character({ spellcasting: { slots: { '1': { total: 2, expended: 1 }, '2': { total: 0, expended: 0 } } } });
    expect(resolvePlayState(c, null).slots).toEqual([{ level: 1, total: 2, expended: 1 }]);
  });
});

describe('hit points', () => {
  it('takes damage from temporary hit points first', () => {
    const { state, message } = applyDamage(character(), { hp: { current: 30, temp: 5 } }, 8);
    expect(state.hp).toEqual({ current: 27, temp: 0 });
    expect(message(en.play)).toBe('Took 8 damage.');
    expect(message(nl.play)).toBe('8 damage gekregen.');
  });

  it('asks for a concentration save with DC 10 or half the damage', () => {
    const base = { hp: { current: 40, temp: 0 }, concentration: 'Bless' };
    expect(applyDamage(character(), base, 6).message(en.play)).toContain('DC 10 Constitution save');
    expect(applyDamage(character(), base, 27).message(en.play)).toContain('DC 13 Constitution save');
    expect(applyDamage(character(), base, 6).state.concentration).toBe('Bless');
  });

  it('writes the concentration save as one sentence per language', () => {
    const { message } = applyDamage(character(), { hp: { current: 40, temp: 0 }, concentration: 'Bless' }, 27);
    expect(message(en.play)).toBe('Took 27 damage. Concentrating on Bless — make a DC 13 Constitution save.');
    expect(message(nl.play)).toBe('27 damage gekregen. Je concentreert op Bless — maak een DC 13 Constitution save.');
  });

  it('stops at 0 and ends concentration', () => {
    const { state, message } = applyDamage(character(), { hp: { current: 5, temp: 0 }, concentration: 'Bless' }, 20);
    expect(state.hp?.current).toBe(0);
    expect(state.concentration).toBeNull();
    expect(message(en.play)).toContain('death saves');
    expect(message(nl.play)).toContain('death saves');
  });

  it('heals up to the maximum and clears death saves', () => {
    const { state, message } = applyHealing(
      character(),
      { hp: { current: 0, temp: 0 }, deathSaves: { successes: 1, failures: 2 } },
      50
    );
    expect(state.hp?.current).toBe(44);
    expect(state.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(message(en.play)).toBe('Healed 44 hit points.');
    expect(message(nl.play)).toBe('44 hit points hersteld.');
  });

  it('says nothing after an action that needs no announcement', () => {
    expect(toggleCondition(character(), null, 'Poisoned').message(en.play)).toBe('');
    expect(removeInventoryItem(character(), null, 'missing').message(nl.play)).toBe('');
  });

  it('replaces temporary hit points instead of stacking them', () => {
    const { state, message } = setTempHp(character(), { hp: { current: 30, temp: 5 } }, 3);
    expect(state.hp).toEqual({ current: 30, temp: 3 });
    expect(message(en.play)).toBe('Temporary hit points set to 3.');
  });

  it('ignores negative and invalid amounts', () => {
    expect(applyDamage(character(), null, -5).state.hp?.current).toBe(44);
    expect(applyHealing(character(), { hp: { current: 10, temp: 0 } }, Number.NaN).state.hp?.current).toBe(10);
  });
});

describe('slots, uses and conditions', () => {
  it('sets expended slots within the total', () => {
    expect(setSlotsExpended(character(), null, 1, 3).state.slotsExpended).toEqual({ '1': 3, '2': 0 });
    expect(setSlotsExpended(character(), null, 1, 9).state.slotsExpended?.['1']).toBe(4);
    expect(setSlotsExpended(character(), null, 1, -1).state.slotsExpended?.['1']).toBe(0);
  });

  it('sets spent uses within the maximum and ignores unknown trackers', () => {
    expect(setUsesSpent(character(), null, REBUKE, 1).state.usesSpent?.[REBUKE]).toBe(1);
    expect(setUsesSpent(character(), null, REBUKE, 5).state.usesSpent?.[REBUKE]).toBe(1);
    expect(setUsesSpent(character(), null, 'feature:unknown', 1).state.usesSpent).not.toHaveProperty('feature:unknown');
  });

  it('toggles a condition', () => {
    const on = toggleCondition(character(), null, 'Poisoned').state;
    expect(on.conditions).toEqual(['Poisoned']);
    expect(toggleCondition(character(), on, 'Poisoned').state.conditions).toEqual([]);
  });
});

describe('castSpell', () => {
  it('spends a slot of the chosen level and starts concentrating', () => {
    const { state, message } = castSpell(character(), null, { spellName: 'Bless', slotLevel: 2, concentrate: true });
    expect(state.slotsExpended).toEqual({ '1': 1, '2': 1 });
    expect(state.concentration).toBe('Bless');
    expect(message(en.play)).toBe('Cast Bless — level 2 slot used, concentrating.');
    expect(message(nl.play)).toBe('Bless gecast — level 2 slot gebruikt, concentratie loopt.');
  });

  it('reports which spell loses concentration', () => {
    const { state, message } = castSpell(
      character(),
      { concentration: 'Bless' },
      { spellName: 'Shield of Faith', slotLevel: 1, concentrate: true }
    );
    expect(state.concentration).toBe('Shield of Faith');
    expect(message(en.play)).toBe('Cast Shield of Faith — level 1 slot used, concentration moves from Bless.');
    expect(message(nl.play)).toBe('Shield of Faith gecast — level 1 slot gebruikt, concentratie gaat over van Bless.');
  });

  it('spends a use of the spell tracker instead of a slot', () => {
    const { state, message } = castSpell(character(), null, { spellName: 'Misty Step', usesKey: MISTY, concentrate: false });
    expect(state.usesSpent?.[MISTY]).toBe(1);
    expect(state.slotsExpended).toEqual({ '1': 1, '2': 0 });
    expect(message(en.play)).toBe('Cast Misty Step — one use spent.');
    expect(message(nl.play)).toBe('Misty Step gecast — één keer gebruikt.');
  });

  it('leaves concentration alone for a spell that needs none', () => {
    const { state, message } = castSpell(character(), { concentration: 'Bless' }, { spellName: 'Cure Wounds', slotLevel: 1, concentrate: false });
    expect(state.concentration).toBe('Bless');
    expect(message(en.play)).toBe('Cast Cure Wounds — level 1 slot used.');
    expect(message(nl.play)).toBe('Cure Wounds gecast — level 1 slot gebruikt.');
  });

  it('casts a spell that costs nothing', () => {
    const { message } = castSpell(character(), null, { spellName: 'Guidance', concentrate: true });
    expect(message(en.play)).toBe('Cast Guidance, concentrating.');
    expect(message(nl.play)).toBe('Guidance gecast, concentratie loopt.');
  });
});

describe('rests', () => {
  const worn = {
    hp: { current: 12, temp: 5 },
    hitDice: 1,
    deathSaves: { successes: 1, failures: 1 },
    slotsExpended: { '1': 4, '2': 1 },
    usesSpent: { [REBUKE]: 1, [CHANNEL]: 1, [MISTY]: 1 },
    conditions: ['Poisoned'],
    exhaustion: 2,
    concentration: 'Bless',
    inspiration: true,
  };

  it('recharges only short-rest trackers on a short rest', () => {
    const { state, message } = shortRest(character(), worn);
    expect(state.usesSpent).toEqual({ [REBUKE]: 1, [CHANNEL]: 0, [MISTY]: 1 });
    expect(state.slotsExpended).toEqual({ '1': 4, '2': 1 });
    expect(state.hp).toEqual({ current: 12, temp: 5 });
    expect(message(en.play)).toBe('Short rest — Channel Divinity recharged. Spend hit dice to heal.');
    expect(message(nl.play)).toBe('Short rest — Channel Divinity opgeladen. Besteed hit dice om te herstellen.');
  });

  it('sums up a short rest in one sentence per language', () => {
    const warlock = shortRest(character({ class: 'Warlock' }), worn).message;
    expect(warlock(en.play)).toBe('Short rest — Channel Divinity recharged, 5 pact slots restored. Spend hit dice to heal.');
    expect(warlock(nl.play)).toBe('Short rest — Channel Divinity opgeladen, 5 pact slots hersteld. Besteed hit dice om te herstellen.');

    const oneSlot = shortRest(character({ class: 'Warlock' }), { slotsExpended: { '1': 0, '2': 1 } }).message;
    expect(oneSlot(en.play)).toBe('Short rest — 1 pact slot restored. Spend hit dice to heal.');
    expect(oneSlot(nl.play)).toBe('Short rest — 1 pact slot hersteld. Besteed hit dice om te herstellen.');

    const fresh = shortRest(character(), null).message;
    expect(fresh(en.play)).toBe('Short rest — nothing to recharge. Spend hit dice to heal.');
    expect(fresh(nl.play)).toBe('Short rest — niets om op te laden. Besteed hit dice om te herstellen.');
  });

  it('restores pact slots on a short rest for a warlock', () => {
    const warlock = character({ class: 'Warlock' });
    expect(shortRest(warlock, worn).state.slotsExpended).toEqual({ '1': 0, '2': 0 });
    expect(hasPactMagic(character({ class: 'Warlock 3 / Sorcerer 2' }))).toBe(false);
    expect(hasPactMagic(character({ class: 'Paladin' }))).toBe(false);
  });

  it('restores everything on a long rest but keeps conditions', () => {
    const { state, message } = longRest(character(), worn);
    expect(message(en.play)).toBe(en.play.messages.longRest);
    expect(message(nl.play)).toBe(nl.play.messages.longRest);
    expect(state.hp).toEqual({ current: 44, temp: 0 });
    expect(state.hitDice).toBe(3);
    expect(state.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(state.slotsExpended).toEqual({ '1': 0, '2': 0 });
    expect(state.usesSpent).toEqual({ [REBUKE]: 0, [CHANNEL]: 0, [MISTY]: 0 });
    expect(state.exhaustion).toBe(1);
    expect(state.concentration).toBeNull();
    expect(state.conditions).toEqual(['Poisoned']);
    expect(state.inspiration).toBe(true);
  });

  it('regains at least one hit die and never more than the total', () => {
    expect(longRest(character({ hitDice: { total: 1, current: 0, die: 'd8' } }), null).state.hitDice).toBe(1);
    expect(longRest(character(), { hitDice: 4 }).state.hitDice).toBe(5);
  });

  it('previews only what a long rest changes', () => {
    expect(longRestPreview(character(), worn)).toEqual([
      { kind: 'hitPoints', before: 12, after: 44 },
      { kind: 'temporaryHitPoints', before: 5, after: 0 },
      { kind: 'spellSlots', restored: 5 },
      { kind: 'features', recharged: ['Hellish Rebuke', 'Channel Divinity', 'Misty Step'] },
      { kind: 'hitDice', before: 1, after: 3 },
      { kind: 'exhaustion', before: 2, after: 1 },
      { kind: 'concentration', spell: 'Bless' },
    ]);
    expect(longRestPreview(character({ spellcasting: undefined }), null)).toEqual([]);
  });
});

describe('currentPlayState', () => {
  it('writes every field explicitly so it can be stored and restored', () => {
    expect(currentPlayState(character(), null)).toEqual({
      hp: { current: 44, temp: 0 },
      hitDice: 5,
      deathSaves: { successes: 0, failures: 0 },
      slotsExpended: { '1': 1, '2': 0 },
      usesSpent: { [REBUKE]: 0, [CHANNEL]: 0, [MISTY]: 0 },
      conditions: [],
      exhaustion: 0,
      concentration: null,
      inspiration: false,
      inventory: [],
      feats: [],
      coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    });
  });
});

describe('coins', () => {
  const built = { cp: 4, sp: 0, ep: 0, gp: 15, pp: 0 };
  const purse = { cp: 0, sp: 7, ep: 0, gp: 120, pp: 2 };

  it('starts from the purse of the build until the player has one of their own', () => {
    expect(resolvePlayState(character({ coins: built }), null).coins).toEqual(built);
    expect(resolvePlayState(character({ coins: built }), { coins: purse }).coins).toEqual(purse);
  });

  it('keeps the purse whichever version of the character it is resolved against', () => {
    const { state } = setCoins(character({ coins: built }), null, purse);
    expect(state.coins).toEqual(purse);
    expect(resolvePlayState(character({ coins: { ...built, gp: 900 } }), state).coins).toEqual(purse);
  });

  it('stores whole, non-negative amounts and fills in a missing coin type', () => {
    const { state } = setCoins(character(), null, { cp: -3, sp: 2.9, gp: Number.NaN, pp: 1 } as Coins);
    expect(state.coins).toEqual({ cp: 0, sp: 2, ep: 0, gp: 0, pp: 1 });
  });

  it('survives another play action', () => {
    expect(applyDamage(character({ coins: built }), { coins: purse }, 5).state.coins).toEqual(purse);
  });
});

describe('inventory', () => {
  const rope = { id: 'a', name: 'Rope', value: '50 ft', description: 'Hempen' };

  it('adds an item with a trimmed name and ignores a blank one', () => {
    const { state } = addInventoryItem(character(), null, 'a', '  Rope ');
    expect(state.inventory).toEqual([{ id: 'a', name: 'Rope', value: '', description: '' }]);
    expect(addInventoryItem(character(), state, 'b', '   ').state.inventory).toHaveLength(1);
  });

  it('does not add the same id twice', () => {
    expect(addInventoryItem(character(), { inventory: [rope] }, 'a', 'Rope again').state.inventory).toEqual([rope]);
  });

  it('updates the value and description of one item', () => {
    const torch = { id: 'b', name: 'Torch', value: '3', description: '' };
    const { state } = updateInventoryItem(character(), { inventory: [rope, torch] }, 'b', { value: '2' });
    expect(state.inventory).toEqual([rope, { ...torch, value: '2' }]);
    expect(updateInventoryItem(character(), state, 'a', { description: 'Silk' }).state.inventory?.[0].description).toBe('Silk');
  });

  it('removes an item and says which one', () => {
    const { state, message } = removeInventoryItem(character(), { inventory: [rope] }, 'a');
    expect(state.inventory).toEqual([]);
    expect(message(en.play)).toBe('Removed Rope from the inventory.');
    expect(message(nl.play)).toBe('Rope uit de inventaris verwijderd.');
  });

  it('keeps the inventory through a long rest and other play actions', () => {
    expect(longRest(character(), { inventory: [rope] }).state.inventory).toEqual([rope]);
    expect(applyDamage(character(), { inventory: [rope] }, 5).state.inventory).toEqual([rope]);
  });

  it('drops stored items without an id or a name', () => {
    const broken = [{ id: '', name: 'x', value: '', description: '' }, { id: 'c', name: '', value: '', description: '' }, rope];
    expect(resolvePlayState(character(), { inventory: broken }).inventory).toEqual([rope]);
  });
});

describe('custom feats', () => {
  const boon = { id: 'boon', name: "Stormcaller's Boon", description: 'Call lightning.' };
  const BOON = customFeatUsesKey('boon');
  const tracked = { ...boon, uses: { max: 2, recharge: 'longRest' as const } };

  it('adds a feat with a trimmed name and ignores a blank one or a known id', () => {
    const { state } = addCustomFeat(character(), null, 'boon', "  Stormcaller's Boon ");
    expect(state.feats).toEqual([{ id: 'boon', name: "Stormcaller's Boon", description: '' }]);
    expect(addCustomFeat(character(), state, 'b', '   ').state.feats).toHaveLength(1);
    expect(addCustomFeat(character(), state, 'boon', 'Again').state.feats).toEqual(state.feats);
  });

  it('changes the name and the text, and keeps the name when the new one is blank', () => {
    const { state } = updateCustomFeat(character(), { feats: [boon] }, 'boon', { name: ' Boon ', description: ' Thunder. ' });
    expect(state.feats).toEqual([{ id: 'boon', name: 'Boon', description: 'Thunder.' }]);
    expect(updateCustomFeat(character(), state, 'boon', { name: '  ' }).state.feats).toEqual(state.feats);
  });

  it('gives a feat a tracker next to those of the build', () => {
    const { state } = setCustomFeatUses(character(), { feats: [boon] }, 'boon', { max: 2, recharge: 'longRest' });
    expect(state.feats).toEqual([tracked]);
    expect(state.usesSpent).toEqual({ [REBUKE]: 0, [CHANNEL]: 0, [MISTY]: 0, [BOON]: 0 });
    expect(setUsesSpent(character(), state, BOON, 5).state.usesSpent?.[BOON]).toBe(2);
  });

  it('keeps the spent uses when the feat is renamed and clamps them to a smaller tracker', () => {
    const spent = { feats: [tracked], usesSpent: { [BOON]: 2 } };
    expect(updateCustomFeat(character(), spent, 'boon', { name: 'Boon' }).state.usesSpent?.[BOON]).toBe(2);
    expect(setCustomFeatUses(character(), spent, 'boon', { max: 1, recharge: 'manual' }).state.usesSpent?.[BOON]).toBe(1);
  });

  it('drops the spent uses with the tracker and leaves no empty tracker behind', () => {
    const { state } = setCustomFeatUses(character(), { feats: [tracked], usesSpent: { [BOON]: 1 } }, 'boon', null);
    expect(state.feats).toEqual([boon]);
    expect(state.usesSpent).not.toHaveProperty(BOON);
  });

  it('recharges on the rest of its tracker', () => {
    const short = { ...boon, id: 'short', name: 'Second Skin', uses: { max: 1, recharge: 'shortRest' as const } };
    const manual = { ...boon, id: 'manual', name: 'Wild Card', uses: { max: 3, recharge: 'manual' as const } };
    const spent = {
      feats: [tracked, short, manual],
      usesSpent: { [BOON]: 2, [customFeatUsesKey('short')]: 1, [customFeatUsesKey('manual')]: 3 },
    };

    const rested = shortRest(character(), spent);
    expect(rested.state.usesSpent).toMatchObject({ [BOON]: 2, [customFeatUsesKey('short')]: 0, [customFeatUsesKey('manual')]: 3 });
    expect(rested.message(en.play)).toContain('Second Skin recharged');

    expect(longRest(character(), spent).state.usesSpent).toMatchObject({ [BOON]: 0, [customFeatUsesKey('short')]: 0, [customFeatUsesKey('manual')]: 3 });
    expect(longRestPreview(character(), spent)).toContainEqual({ kind: 'features', recharged: ["Stormcaller's Boon", 'Second Skin'] });
  });

  it('removes a feat with its spent uses and says which one', () => {
    const { state, message } = removeCustomFeat(character(), { feats: [tracked], usesSpent: { [BOON]: 1 } }, 'boon');
    expect(state.feats).toEqual([]);
    expect(state.usesSpent).not.toHaveProperty(BOON);
    expect(message(en.play)).toBe("Removed the feat Stormcaller's Boon.");
    expect(message(nl.play)).toBe("Feat Stormcaller's Boon verwijderd.");
  });

  it('keeps the feats through another play action', () => {
    expect(applyDamage(character(), { feats: [tracked] }, 5).state.feats).toEqual([tracked]);
  });

  it('drops broken feats and trackers from what was stored', () => {
    const broken = [
      { id: '', name: 'x', description: '' },
      { id: 'c', name: '', description: '' },
      { ...boon, uses: { max: 0, recharge: 'longRest' as const } },
      { id: 'd', name: 'Pool', description: '', uses: { max: 250.7, recharge: 'weekly' as never } },
    ];
    expect(resolvePlayState(character(), { feats: broken }).feats).toEqual([
      boon,
      { id: 'd', name: 'Pool', description: '', uses: { max: 99, recharge: 'manual' } },
    ]);
  });
});

describe('applyPlayStateToCharacter', () => {
  it('returns the character untouched without play state', () => {
    const c = character();
    expect(applyPlayStateToCharacter(c, null)).toBe(c);
  });

  it('writes the live values into a copy', () => {
    const c = character();
    const live = applyPlayStateToCharacter(c, {
      hp: { current: 20, temp: 4 },
      hitDice: 2,
      deathSaves: { successes: 0, failures: 1 },
      slotsExpended: { '1': 3 },
      coins: { cp: 0, sp: 0, ep: 0, gp: 30, pp: 0 },
    });
    expect(live.coins.gp).toBe(30);
    expect(live.hitPoints).toEqual({ max: 44, current: 20, temp: 4 });
    expect(live.hitDice).toEqual({ total: 5, current: 2, die: 'd10' });
    expect(live.deathSaves).toEqual({ successes: 0, failures: 1 });
    expect(live.spellcasting?.slots).toEqual([
      { level: 1, total: 4, expended: 3 },
      { level: 2, total: 2, expended: 0 },
    ]);
    expect(c.hitPoints.current).toBe(44);
  });
});
