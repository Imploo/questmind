/**
 * The edition of the D&D 5e rules a character is built with: the 2014 Player's
 * Handbook or the revised one of 2024. Stored as `rulesVersion` on the character
 * document; a character without it uses the 2014 rules.
 */
export type RulesVersion = '2014' | '2024';

export const DEFAULT_RULES_VERSION: RulesVersion = '2014';

/** The rules version in a stored or received value; anything else than a known version is the default. */
export function readRulesVersion(value: unknown): RulesVersion {
  return value === '2024' ? '2024' : DEFAULT_RULES_VERSION;
}

/** How a prompt names the rules: "D&D 5e (2024 rules, the revised Player's Handbook)". */
export function describeRules(rulesVersion: RulesVersion): string {
  return rulesVersion === '2024'
    ? `D&D 5e (2024 rules, the revised Player's Handbook)`
    : `D&D 5e (2014 rules, the original Player's Handbook)`;
}
