/**
 * The edition of the D&D 5e rules a character is built with: the 2014 Player's
 * Handbook or the revised one of 2024. Stored as `rulesVersion` on the character;
 * a character without it uses the 2014 rules.
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
 * The message that opens the conversation after the rules of a character were switched:
 * it asks The Sidekick to rebuild the character under the chosen rules.
 */
export function rulesConversionRequest(rulesVersion: RulesVersion): string {
  return [
    `Zet dit karakter om naar de D&D 5e regels van ${rulesVersion}.`,
    `Loop het hele karakter na (race/species, background, ability scores, class en subclass features, feats, proficiencies, spells en beperkt gebruik) en werk alles bij naar de ${rulesVersion}-versie.`,
    'Maak zelf de best passende keuze waar de regels om een keuze vragen en benoem die, zodat ik kan bijsturen.',
  ].join(' ');
}
