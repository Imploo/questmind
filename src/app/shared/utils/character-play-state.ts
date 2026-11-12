import { DndCharacter, LimitedUses, SpellSlot, UsesRecharge } from '../models/dnd-character.model';
import { CharacterPlayState } from '../models/character-play-state.model';
import { normalizeSpellSlots } from '../pdf/character-sheet-field-values';

export const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
] as const;

export const MAX_EXHAUSTION = 6;

export type UsesOwner = 'feature' | 'spell';

/** A feature or spell with a limited number of uses. */
export interface UsesTracker {
  key: string;
  name: string;
  max: number;
  recharge: UsesRecharge;
}

/** The play state with every gap filled in from the character and clamped to its limits. */
export interface ResolvedPlayState {
  hp: { current: number; max: number; temp: number };
  hitDice: { current: number; total: number; die: string };
  deathSaves: { successes: number; failures: number };
  slots: SpellSlot[];
  usesSpent: Record<string, number>;
  conditions: string[];
  exhaustion: number;
  concentration: string | null;
  inspiration: boolean;
}

export interface PlayStateResult {
  state: CharacterPlayState;
  /** One line describing what happened, shown to the player. */
  message: string;
}

export interface CastRequest {
  spellName: string;
  /** Slot level to spend; leave out when the spell costs no slot. */
  slotLevel?: number;
  /** Tracker to spend a use from instead of a slot. */
  usesKey?: string;
  concentrate: boolean;
}

export interface RestPreviewRow {
  label: string;
  value: string;
}

type State = CharacterPlayState | null | undefined;

export function usesKey(owner: UsesOwner, name: string): string {
  return `${owner}:${name.trim().toLowerCase()}`;
}

function clamp(value: number | undefined, min: number, max: number, fallback = min): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function validUses(uses: LimitedUses | undefined): uses is LimitedUses {
  return !!uses && typeof uses.max === 'number' && uses.max >= 1;
}

/** Every feature and spell that has a uses tracker. */
export function listTrackers(character: DndCharacter): UsesTracker[] {
  const trackers: UsesTracker[] = [];
  for (const feature of character.featuresAndTraits ?? []) {
    if (typeof feature === 'string' || !validUses(feature.uses)) continue;
    trackers.push({ key: usesKey('feature', feature.name), name: feature.name, max: Math.trunc(feature.uses.max), recharge: feature.uses.recharge });
  }
  for (const spell of character.spellcasting?.spells ?? []) {
    if (typeof spell === 'string' || !validUses(spell.uses)) continue;
    trackers.push({ key: usesKey('spell', spell.name), name: spell.name, max: Math.trunc(spell.uses.max), recharge: spell.uses.recharge });
  }
  return trackers;
}

export function resolvePlayState(character: DndCharacter, state: State): ResolvedPlayState {
  const max = Math.max(0, character.hitPoints?.max ?? 0);
  const hitDiceTotal = Math.max(0, character.hitDice?.total ?? 0);

  const slots = normalizeSpellSlots(character.spellcasting?.slots)
    .filter(slot => slot.total > 0)
    .map(slot => ({
      level: slot.level,
      total: slot.total,
      expended: clamp(state?.slotsExpended?.[String(slot.level)] ?? slot.expended, 0, slot.total),
    }));

  const usesSpent: Record<string, number> = {};
  for (const tracker of listTrackers(character)) {
    usesSpent[tracker.key] = clamp(state?.usesSpent?.[tracker.key], 0, tracker.max);
  }

  return {
    hp: {
      current: clamp(state?.hp?.current ?? character.hitPoints?.current, 0, max, max),
      max,
      temp: clamp(state?.hp?.temp ?? character.hitPoints?.temp, 0, Number.MAX_SAFE_INTEGER),
    },
    hitDice: {
      current: clamp(state?.hitDice ?? character.hitDice?.current, 0, hitDiceTotal, hitDiceTotal),
      total: hitDiceTotal,
      die: character.hitDice?.die ?? '',
    },
    deathSaves: {
      successes: clamp(state?.deathSaves?.successes ?? character.deathSaves?.successes, 0, 3),
      failures: clamp(state?.deathSaves?.failures ?? character.deathSaves?.failures, 0, 3),
    },
    slots,
    usesSpent,
    conditions: [...(state?.conditions ?? [])],
    exhaustion: clamp(state?.exhaustion, 0, MAX_EXHAUSTION),
    concentration: state?.concentration ?? null,
    inspiration: state?.inspiration === true,
  };
}

function toState(resolved: ResolvedPlayState): CharacterPlayState {
  return {
    hp: { current: resolved.hp.current, temp: resolved.hp.temp },
    hitDice: resolved.hitDice.current,
    deathSaves: { ...resolved.deathSaves },
    slotsExpended: Object.fromEntries(resolved.slots.map(slot => [String(slot.level), slot.expended])),
    usesSpent: { ...resolved.usesSpent },
    conditions: [...resolved.conditions],
    exhaustion: resolved.exhaustion,
    concentration: resolved.concentration,
    inspiration: resolved.inspiration,
  };
}

/** The complete, explicit play state as it stands now. Used as the undo point. */
export function currentPlayState(character: DndCharacter, state: State): CharacterPlayState {
  return toState(resolvePlayState(character, state));
}

/** Resolve, let `change` edit the resolved copy and turn it back into a storable state. */
function update(
  character: DndCharacter,
  state: State,
  change: (resolved: ResolvedPlayState) => string
): PlayStateResult {
  const resolved = resolvePlayState(character, state);
  const message = change(resolved);
  // Resolve once more so every value the change wrote is clamped to its limits.
  return { state: currentPlayState(character, toState(resolved)), message };
}

function positive(amount: number): number {
  return Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
}

/** Damage comes off temporary hit points first. Dropping to 0 ends concentration. */
export function applyDamage(character: DndCharacter, state: State, amount: number): PlayStateResult {
  const damage = positive(amount);
  return update(character, state, r => {
    const absorbed = Math.min(r.hp.temp, damage);
    r.hp.temp -= absorbed;
    r.hp.current = Math.max(0, r.hp.current - (damage - absorbed));

    if (r.hp.current === 0 && r.hp.max > 0) {
      r.concentration = null;
      return 'Down to 0 HP — roll death saves at the start of each turn.';
    }
    if (r.concentration && damage > 0) {
      const dc = Math.max(10, Math.floor(damage / 2));
      return `Took ${damage} damage. Concentrating on ${r.concentration} — make a DC ${dc} Constitution save.`;
    }
    return `Took ${damage} damage.`;
  });
}

/** Healing from 0 also clears the death saves. */
export function applyHealing(character: DndCharacter, state: State, amount: number): PlayStateResult {
  const healing = positive(amount);
  return update(character, state, r => {
    const before = r.hp.current;
    r.hp.current = Math.min(r.hp.max, r.hp.current + healing);
    if (r.hp.current > 0) r.deathSaves = { successes: 0, failures: 0 };
    return `Healed ${r.hp.current - before} hit points.`;
  });
}

export function setTempHp(character: DndCharacter, state: State, amount: number): PlayStateResult {
  const temp = positive(amount);
  return update(character, state, r => {
    r.hp.temp = temp;
    return `Temporary hit points set to ${temp}.`;
  });
}

export function setHitDice(character: DndCharacter, state: State, current: number): PlayStateResult {
  return update(character, state, r => {
    r.hitDice.current = current;
    return '';
  });
}

export function setDeathSaves(character: DndCharacter, state: State, successes: number, failures: number): PlayStateResult {
  return update(character, state, r => {
    r.deathSaves = { successes, failures };
    return '';
  });
}

export function setSlotsExpended(character: DndCharacter, state: State, level: number, expended: number): PlayStateResult {
  return update(character, state, r => {
    const slot = r.slots.find(s => s.level === level);
    if (slot) slot.expended = expended;
    return '';
  });
}

export function setUsesSpent(character: DndCharacter, state: State, key: string, spent: number): PlayStateResult {
  return update(character, state, r => {
    if (key in r.usesSpent) r.usesSpent[key] = spent;
    return '';
  });
}

export function toggleCondition(character: DndCharacter, state: State, condition: string): PlayStateResult {
  return update(character, state, r => {
    r.conditions = r.conditions.includes(condition)
      ? r.conditions.filter(c => c !== condition)
      : [...r.conditions, condition];
    return '';
  });
}

export function setExhaustion(character: DndCharacter, state: State, level: number): PlayStateResult {
  return update(character, state, r => {
    r.exhaustion = level;
    return '';
  });
}

export function setConcentration(character: DndCharacter, state: State, spellName: string | null): PlayStateResult {
  return update(character, state, r => {
    r.concentration = spellName;
    return '';
  });
}

export function setInspiration(character: DndCharacter, state: State, inspired: boolean): PlayStateResult {
  return update(character, state, r => {
    r.inspiration = inspired;
    return '';
  });
}

/** Spend a slot (or a use of the spell's own tracker) and start concentrating when asked. */
export function castSpell(character: DndCharacter, state: State, request: CastRequest): PlayStateResult {
  return update(character, state, r => {
    let cost = '';
    if (request.usesKey && request.usesKey in r.usesSpent) {
      r.usesSpent[request.usesKey] += 1;
      cost = ' — one use spent';
    } else if (request.slotLevel !== undefined) {
      const slot = r.slots.find(s => s.level === request.slotLevel);
      if (slot) {
        slot.expended += 1;
        cost = ` — level ${slot.level} slot used`;
      }
    }

    let concentration = '';
    if (request.concentrate) {
      const previous = r.concentration;
      r.concentration = request.spellName;
      concentration = previous && previous !== request.spellName
        ? `, concentration moves from ${previous}`
        : ', concentrating';
    }
    return `Cast ${request.spellName}${cost}${concentration}.`;
  });
}

/** Pact Magic slots come back on a short rest. Only recognised for a single-class warlock. */
export function hasPactMagic(character: DndCharacter): boolean {
  const cls = character.class ?? '';
  return /^\s*warlock\b/i.test(cls) && !/[/,&+]/.test(cls);
}

function rechargeUses(character: DndCharacter, r: ResolvedPlayState, recharges: UsesRecharge[]): string[] {
  const recharged: string[] = [];
  for (const tracker of listTrackers(character)) {
    if (!recharges.includes(tracker.recharge)) continue;
    if (r.usesSpent[tracker.key] > 0) recharged.push(tracker.name);
    r.usesSpent[tracker.key] = 0;
  }
  return recharged;
}

function restoreSlots(r: ResolvedPlayState): number {
  const restored = r.slots.reduce((sum, slot) => sum + slot.expended, 0);
  r.slots.forEach(slot => (slot.expended = 0));
  return restored;
}

/** Short rest: short-rest trackers recharge, and Pact Magic slots for a warlock. */
export function shortRest(character: DndCharacter, state: State): PlayStateResult {
  return update(character, state, r => {
    const recharged = rechargeUses(character, r, ['shortRest']);
    const slots = hasPactMagic(character) ? restoreSlots(r) : 0;

    const parts: string[] = [];
    if (recharged.length) parts.push(`${recharged.join(', ')} recharged`);
    if (slots) parts.push(`${slots} pact ${slots === 1 ? 'slot' : 'slots'} restored`);
    const summary = parts.length ? parts.join(', ') : 'nothing to recharge';
    return `Short rest — ${summary}. Spend hit dice to heal.`;
  });
}

function hitDiceRegained(r: ResolvedPlayState): number {
  const regain = Math.max(1, Math.floor(r.hitDice.total / 2));
  return Math.min(r.hitDice.total, r.hitDice.current + regain);
}

function applyLongRest(character: DndCharacter, r: ResolvedPlayState): { slots: number; recharged: string[] } {
  r.hp.current = r.hp.max;
  r.hp.temp = 0;
  r.deathSaves = { successes: 0, failures: 0 };
  r.hitDice.current = hitDiceRegained(r);
  r.exhaustion = Math.max(0, r.exhaustion - 1);
  r.concentration = null;
  return { slots: restoreSlots(r), recharged: rechargeUses(character, r, ['shortRest', 'longRest']) };
}

/**
 * Long rest: full hit points, all slots, short- and long-rest trackers, half the hit
 * dice (at least one), one level of exhaustion less. Conditions stay as they are.
 */
export function longRest(character: DndCharacter, state: State): PlayStateResult {
  return update(character, state, r => {
    applyLongRest(character, r);
    return 'Long rest — hit points, spell slots and features restored.';
  });
}

/** What a long rest would change, for the confirmation dialog. Unchanged values are left out. */
export function longRestPreview(character: DndCharacter, state: State): RestPreviewRow[] {
  const before = resolvePlayState(character, state);
  const after = resolvePlayState(character, state);
  const { slots, recharged } = applyLongRest(character, after);

  const rows: RestPreviewRow[] = [];
  if (after.hp.current !== before.hp.current) {
    rows.push({ label: 'Hit points', value: `${before.hp.current} → ${after.hp.current}` });
  }
  if (before.hp.temp > 0) rows.push({ label: 'Temporary hit points', value: `${before.hp.temp} → 0` });
  if (slots > 0) rows.push({ label: 'Spell slots', value: `${slots} restored` });
  if (recharged.length) rows.push({ label: 'Features', value: recharged.join(', ') });
  if (after.hitDice.current !== before.hitDice.current) {
    rows.push({ label: 'Hit dice', value: `${before.hitDice.current} → ${after.hitDice.current}` });
  }
  if (before.exhaustion > 0) rows.push({ label: 'Exhaustion', value: `${before.exhaustion} → ${after.exhaustion}` });
  if (before.concentration) rows.push({ label: 'Concentration', value: `${before.concentration} ends` });
  return rows;
}

/**
 * The character with the live values written into it, for places that only know the
 * character itself (the AI chat).
 */
export function applyPlayStateToCharacter(character: DndCharacter, state: State): DndCharacter {
  if (!state) return character;
  const r = resolvePlayState(character, state);
  const result: DndCharacter = {
    ...character,
    hitPoints: { ...character.hitPoints, current: r.hp.current, temp: r.hp.temp },
    hitDice: { ...character.hitDice, current: r.hitDice.current },
    deathSaves: { ...r.deathSaves },
  };
  if (character.spellcasting?.slots) {
    const expended = new Map(r.slots.map(slot => [slot.level, slot.expended]));
    result.spellcasting = {
      ...character.spellcasting,
      slots: normalizeSpellSlots(character.spellcasting.slots).map(slot => ({
        ...slot,
        expended: expended.get(slot.level) ?? slot.expended,
      })),
    };
  }
  return result;
}
