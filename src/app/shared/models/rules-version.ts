import type { Translations } from '../../core/i18n/translations';

/**
 * The edition of the D&D 5e rules a character is built with: the 2014 Player's
 * Handbook or the revised one of 2024. Stored as `rulesVersion` in the character of
 * each version, so going back to an older version (or undoing a change) also goes
 * back to its rules. A character without it uses the 2014 rules.
 */
export type RulesVersion = '2014' | '2024';

export const DEFAULT_RULES_VERSION: RulesVersion = '2014';

/** The rules of a character, or the default when it has none on record. */
export function rulesVersionOf(character: { rulesVersion?: unknown } | null | undefined): RulesVersion {
  return character?.rulesVersion === '2024' ? '2024' : DEFAULT_RULES_VERSION;
}

/** The version a character switches to when it leaves `current`. */
export function otherRulesVersion(current: RulesVersion): RulesVersion {
  return current === '2024' ? '2014' : '2024';
}

/**
 * The message that opens the conversation in which the rules of a character are
 * switched: it asks The Sidekick to rebuild the character under the chosen rules.
 * It is sent, and stored, as a message of the user, so it is written in their language.
 */
export function rulesConversionRequest(rulesVersion: RulesVersion, texts: Translations['characters']['rulesConversion']): string {
  return [texts.convert(rulesVersion), texts.review(rulesVersion), texts.choices].join(' ');
}
