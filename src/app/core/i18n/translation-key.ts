import type { Translations } from './translations';

/** A text is a plain string, or a function when it takes values or has a plural. */
type Text = string | ((...args: never[]) => string);

type PathsOf<T> = {
  [K in keyof T & string]: T[K] extends Text ? K : `${K}.${PathsOf<T[K]>}`;
}[keyof T & string];

type ValueAt<T, Path extends string> = Path extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? ValueAt<T[Head], Rest>
    : never
  : Path extends keyof T
    ? T[Path]
    : never;

/** Every path to a text in `Translations`, such as `'nav.signOut'`. */
export type TranslationKey = PathsOf<Translations>;

/** The values a text takes: empty for a plain string, the parameters for a function. */
export type ParamsOf<K extends TranslationKey> =
  ValueAt<Translations, K> extends (...args: infer Params) => string ? Params : [];
