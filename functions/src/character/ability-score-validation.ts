import type { DndCharacter } from '../schemas/dnd-character.schema';

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

export interface AbilityScoreIssue {
  code: AbilityScoreIssueCode;
  ability?: AbilityKey;
  message: string;
}

type Abilities = DndCharacter['abilities'];
type AbilityEntry = Abilities[AbilityKey];

const LABEL: Record<AbilityKey, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

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
      const parts = [`base ${entry.base}`, ...(entry.bonuses ?? []).map(b => `${b.amount >= 0 ? '+' : ''}${b.amount} (${b.source})`)];
      issues.push({
        code: 'bonusMismatch',
        ability: key,
        message: `${LABEL[key]}: ${parts.join(' ')} = ${expected}, but the score is ${entry.score}.`,
      });
    }
  }

  if (method !== 'pointBuy' && method !== 'standardArray') return issues;

  const missing = list.filter(([, entry]) => entry.base === undefined).map(([key]) => LABEL[key]);
  if (missing.length || list.length < ABILITY_KEYS.length) {
    issues.push({
      code: 'missingBase',
      message: `${method === 'pointBuy' ? 'Point buy' : 'Standard array'} needs a base score for all six abilities; missing: ${missing.join(', ') || 'one or more abilities'}.`,
    });
    return issues;
  }

  const bases = list.map(([, entry]) => entry.base as number);

  if (method === 'pointBuy') {
    for (const [key, entry] of list) {
      if (entry.base! < POINT_BUY_MIN || entry.base! > POINT_BUY_MAX) {
        issues.push({
          code: 'baseOutOfRange',
          ability: key,
          message: `${LABEL[key]}: point buy base ${entry.base} is outside ${POINT_BUY_MIN}-${POINT_BUY_MAX}.`,
        });
      }
    }
    const cost = pointBuyCost(bases);
    if (cost !== null && cost > POINT_BUY_BUDGET) {
      const breakdown = list.map(([key, entry]) => `${LABEL[key]} ${entry.base} (${POINT_BUY_COST[entry.base!]})`).join(', ');
      issues.push({
        code: 'pointBuyBudget',
        message: `Point buy costs ${cost} points, the maximum is ${POINT_BUY_BUDGET}: ${breakdown}.`,
      });
    }
  } else {
    const sorted = [...bases].sort((a, b) => b - a);
    if (sorted.some((base, i) => base !== STANDARD_ARRAY[i])) {
      issues.push({
        code: 'standardArray',
        message: `Standard array base scores must be exactly ${STANDARD_ARRAY.join(', ')} (each once); got ${sorted.join(', ')}.`,
      });
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

/** Correction instructions for the JSON generator. */
export function formatAbilityFeedback(issues: AbilityScoreIssue[]): string {
  return [
    'Your previous JSON breaks the D&D 5e ability score rules:',
    ...issues.map(issue => `- ${issue.message}`),
    '',
    `Fix the ability scores and return the COMPLETE character JSON again. Point buy: base 8-15, costs ${Object.entries(POINT_BUY_COST).map(([s, c]) => `${s}=${c}`).join(', ')}, total at most ${POINT_BUY_BUDGET}. Standard array: ${STANDARD_ARRAY.join(', ')}. For every ability score = base + sum(bonuses.amount), and modifier = floor((score - 10) / 2). Keep the distribution the conversation asked for as closely as the rules allow, and leave all other fields unchanged.`,
  ].join('\n');
}
