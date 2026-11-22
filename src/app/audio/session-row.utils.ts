/** The day and the short month of a stored play day (`2026-11-20` → `20`, `nov`); dashes without one. */
export function dayParts(isoDay: string | null | undefined, locale: string): { day: string; month: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay ?? '');
  if (!match) return { day: '–', month: '' };
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return {
    day: String(date.getDate()),
    month: date.toLocaleDateString(locale, { month: 'short' }).replace(/\.$/, ''),
  };
}

/** The first line of prose of a session story, without its markdown. */
export function storyExcerpt(content: string | null | undefined): string {
  const line = (content ?? '')
    .split('\n')
    .map(text => text.trim())
    .find(text => text && !text.startsWith('#') && !/^[-*_]{3,}$/.test(text));
  return (line ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .trim();
}
