/** The languages a user can choose in the app. */
export const LANGUAGES = ['nl', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Existing clients and documents are Dutch, so a missing language means Dutch. */
export const DEFAULT_LANGUAGE: Language = 'nl';

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** The language a client or a stored document names; anything else is Dutch. */
export function parseLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

/**
 * The language of a visitor we know nothing else about, from the `Accept-Language`
 * header: the first language the browser asks for that the app speaks, English
 * otherwise (the same rule the app uses for a first visit).
 */
export function languageFromAcceptLanguage(header: string | undefined): Language {
  const preferred = (header ?? '')
    .split(',')
    .map((range, index) => {
      const [tag, ...params] = range.trim().split(';');
      const q = params.map(param => /^\s*q=([\d.]+)\s*$/i.exec(param)?.[1]).find(Boolean);
      const quality = q === undefined ? 1 : Number(q);
      return { primary: tag.trim().toLowerCase().split('-')[0], quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter(range => range.quality > 0)
    // Highest quality first; equal qualities keep the order of the header.
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { primary } of preferred) {
    if (isLanguage(primary)) return primary;
  }
  return 'en';
}
