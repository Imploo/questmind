import type { DndCharacter } from '../schemas/dnd-character.schema';
import type { Language } from '../utils/language';

/**
 * Deterministic checks of a character's ability scores (D&D 5e, PHB 2014 + Tasha's).
 *
 * Point buy and the standard array constrain the *base* scores, before racial,
 * ASI and feat bonuses. The character therefore carries per ability its `base`
 * and its `bonuses`, and `abilityScoreMethod` says which rules apply. Rolled or
 * other scores only get the bookkeeping check (base + bonuses = score).
 */

export const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

/** Point buy cost of a base score (PHB p. 13). */
export const POINT_BUY_COST: Readonly<Record<number, number>> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

export type AbilityScoreIssueCode =
  | 'missingBase'
  | 'baseOutOfRange'
  | 'pointBuyBudget'
  | 'standardArray'
  | 'bonusMismatch';

/** What is wrong, as data: the texts in both languages are built from it. */
export type AbilityScoreIssueFacts =
  | { code: 'bonusMismatch'; ability: AbilityKey; base: number; bonuses: { amount: number; source: string }[]; expected: number; score: number }
  | { code: 'missingBase'; method: 'pointBuy' | 'standardArray'; missing: AbilityKey[] }
  | { code: 'baseOutOfRange'; ability: AbilityKey; base: number }
  | { code: 'pointBuyBudget'; cost: number; bases: { ability: AbilityKey; base: number }[] }
  | { code: 'standardArray'; bases: number[] };

export interface AbilityScoreIssue {
  code: AbilityScoreIssueCode;
  ability?: AbilityKey;
  /** English: the feedback the generator gets when it is asked for a correction. */
  message: string;
  facts: AbilityScoreIssueFacts;
}

type Abilities = DndCharacter['abilities'];
type AbilityEntry = Abilities[AbilityKey];

const LABEL: Record<AbilityKey, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

/**
 * One issue as a sentence. Ability abbreviations, "point buy", "standard array" and
 * "base" are game terms and stay English in both languages; the source of a bonus is
 * text from the character itself.
 */
function describeIssue(facts: AbilityScoreIssueFacts, language: Language): string {
  const nl = language === 'nl';
  switch (facts.code) {
    case 'bonusMismatch': {
      const parts = [`base ${facts.base}`, ...facts.bonuses.map(b => `${b.amount >= 0 ? '+' : ''}${b.amount} (${b.source})`)];
      const sum = `${LABEL[facts.ability]}: ${parts.join(' ')} = ${facts.expected}`;
      return nl ? `${sum}, maar de score is ${facts.score}.` : `${sum}, but the score is ${facts.score}.`;
    }
    case 'missingBase': {
      const method = facts.method === 'pointBuy' ? 'Point buy' : 'Standard array';
      const missing = facts.missing.map(key => LABEL[key]).join(', ');
      return nl
        ? `${method} heeft voor alle zes abilities een base score nodig; ontbreekt: ${missing || 'een of meer abilities'}.`
        : `${method} needs a base score for all six abilities; missing: ${missing || 'one or more abilities'}.`;
    }
    case 'baseOutOfRange':
      return nl
        ? `${LABEL[facts.ability]}: point buy base ${facts.base} valt buiten ${POINT_BUY_MIN}-${POINT_BUY_MAX}.`
        : `${LABEL[facts.ability]}: point buy base ${facts.base} is outside ${POINT_BUY_MIN}-${POINT_BUY_MAX}.`;
    case 'pointBuyBudget': {
      const breakdown = facts.bases.map(({ ability, base }) => `${LABEL[ability]} ${base} (${POINT_BUY_COST[base]})`).join(', ');
      return nl
        ? `Point buy kost ${facts.cost} punten, het maximum is ${POINT_BUY_BUDGET}: ${breakdown}.`
        : `Point buy costs ${facts.cost} points, the maximum is ${POINT_BUY_BUDGET}: ${breakdown}.`;
    }
    case 'standardArray':
      return nl
        ? `De base scores van de standard array moeten precies ${STANDARD_ARRAY.join(', ')} zijn (elk één keer); nu: ${facts.bases.join(', ')}.`
        : `Standard array base scores must be exactly ${STANDARD_ARRAY.join(', ')} (each once); got ${facts.bases.join(', ')}.`;
  }
}

function issue(facts: AbilityScoreIssueFacts): AbilityScoreIssue {
  return {
    code: facts.code,
    ...('ability' in facts ? { ability: facts.ability } : {}),
    message: describeIssue(facts, 'en'),
    facts,
  };
}

/** The warning that is stored with a version and shown to the owner, in their language. */
export function abilityScoreWarning(issue: AbilityScoreIssue, language: Language): string {
  return language === 'en' ? issue.message : describeIssue(issue.facts, language);
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Total point buy cost of six base scores, or null if one is outside 8-15. */
export function pointBuyCost(bases: number[]): number | null {
  let total = 0;
  for (const base of bases) {
    const cost = POINT_BUY_COST[base];
    if (cost === undefined) return null;
    total += cost;
  }
  return total;
}

function entries(abilities: Abilities | undefined): [AbilityKey, AbilityEntry][] {
  if (!abilities) return [];
  return ABILITY_KEYS.filter(key => abilities[key]).map(key => [key, abilities[key]]);
}

function bonusTotal(entry: AbilityEntry): number {
  return (entry.bonuses ?? []).reduce((sum, bonus) => sum + (bonus.amount ?? 0), 0);
}

/**
 * Sets every ability modifier to floor((score - 10) / 2). Returns a new character
 * plus a description of each correction; the input is not changed.
 */
export function fixAbilityModifiers<T extends Pick<DndCharacter, 'abilities'>>(character: T): { character: T; fixes: string[] } {
  if (!character.abilities) return { character, fixes: [] };
  const fixes: string[] = [];
  const abilities = { ...character.abilities };
  for (const [key, entry] of entries(character.abilities)) {
    const expected = abilityModifier(entry.score);
    if (entry.modifier !== expected) {
      fixes.push(`${LABEL[key]} modifier ${entry.modifier} -> ${expected}`);
      abilities[key] = { ...entry, modifier: expected };
    }
  }
  return { character: fixes.length ? { ...character, abilities } : character, fixes };
}

/** All rule violations of the ability scores. Modifiers are not checked: fix them with fixAbilityModifiers. */
export function validateAbilityScores(character: Pick<DndCharacter, 'abilities' | 'abilityScoreMethod'>): AbilityScoreIssue[] {
  const issues: AbilityScoreIssue[] = [];
  const list = entries(character.abilities);
  const method = character.abilityScoreMethod;

  // Bookkeeping, for every method: the bonuses must explain the final score.
  for (const [key, entry] of list) {
    if (entry.base === undefined) continue;
    const expected = entry.base + bonusTotal(entry);
    if (expected !== entry.score) {
      issues.push(issue({
        code: 'bonusMismatch',
        ability: key,
        base: entry.base,
        bonuses: (entry.bonuses ?? []).map(b => ({ amount: b.amount, source: b.source })),
        expected,
        score: entry.score,
      }));
    }
  }

  if (method !== 'pointBuy' && method !== 'standardArray') return issues;

  const missing = list.filter(([, entry]) => entry.base === undefined).map(([key]) => key);
  if (missing.length || list.length < ABILITY_KEYS.length) {
    issues.push(issue({ code: 'missingBase', method, missing }));
    return issues;
  }

  const bases = list.map(([, entry]) => entry.base as number);

  if (method === 'pointBuy') {
    for (const [key, entry] of list) {
      if (entry.base! < POINT_BUY_MIN || entry.base! > POINT_BUY_MAX) {
        issues.push(issue({ code: 'baseOutOfRange', ability: key, base: entry.base! }));
      }
    }
    const cost = pointBuyCost(bases);
    if (cost !== null && cost > POINT_BUY_BUDGET) {
      issues.push(issue({
        code: 'pointBuyBudget',
        cost,
        bases: list.map(([key, entry]) => ({ ability: key, base: entry.base! })),
      }));
    }
  } else {
    const sorted = [...bases].sort((a, b) => b - a);
    if (sorted.some((base, i) => base !== STANDARD_ARRAY[i])) {
      issues.push(issue({ code: 'standardArray', bases: sorted }));
    }
  }

  return issues;
}

/** True when the draft changed anything that the ability score rules look at. */
export function abilityScoresChanged(
  before: Pick<DndCharacter, 'abilities' | 'abilityScoreMethod'> | undefined,
  after: Pick<DndCharacter, 'abilities' | 'abilityScoreMethod'>
): boolean {
  if (!before?.abilities) return true;
  if (before.abilityScoreMethod !== after.abilityScoreMethod) return true;
  const key = (entry: AbilityEntry | undefined) => JSON.stringify([entry?.score, entry?.base, entry?.bonuses ?? []]);
  return ABILITY_KEYS.some(ability => key(before.abilities[ability]) !== key(after.abilities?.[ability]));
}

/** Correction instructions for the JSON generator; always English, whatever the user's language. */
export function formatAbilityFeedback(issues: Pick<AbilityScoreIssue, 'code' | 'ability' | 'message'>[]): string {
  return [
    'Your previous JSON breaks the D&D 5e ability score rules:',
    ...issues.map(issue => `- ${issue.message}`),
    '',
    `Fix the ability scores and return the COMPLETE character JSON again. Point buy: base 8-15, costs ${Object.entries(POINT_BUY_COST).map(([s, c]) => `${s}=${c}`).join(', ')}, total at most ${POINT_BUY_BUDGET}. Standard array: ${STANDARD_ARRAY.join(', ')}. For every ability score = base + sum(bonuses.amount), and modifier = floor((score - 10) / 2). Keep the distribution the conversation asked for as closely as the rules allow, and leave all other fields unchanged.`,
  ].join('\n');
}
