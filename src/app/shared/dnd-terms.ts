/**
 * D&D game terms. They stay English in every language, like at the table and
 * in the rules data: "Armor Class" is "Armor Class" for a Dutch player too.
 *
 * A template takes its game terms from here (`terms.armorClass`) instead of
 * writing them out, so the only loose text left in a template is text that
 * still needs a translation. The app text around a term does get translated
 * and lives in the translations ("Long rest nemen?").
 */
export const DND_TERMS = {
  level: 'Level',
} as const;

export type DndTerms = typeof DND_TERMS;
