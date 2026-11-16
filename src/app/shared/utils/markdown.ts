import { marked, Token } from 'marked';

/** GitHub-flavoured, and a single line break stays a line break: rule texts and typed notes rely on it. */
const OPTIONS = { gfm: true, breaks: true } as const;

/** The rules data writes some headings as "###Archery"; markdown wants a space after the hashes. */
const HEADING_WITHOUT_SPACE = /^([ \t]{0,3}#{2,6})(?=[^\s#])/gm;

function normalize(markdown: string): string {
  return markdown.replace(HEADING_WITHOUT_SPACE, '$1 ');
}

/** Markdown as HTML. Not sanitized: bind it with [innerHTML], which is. */
export function markdownToHtml(markdown: string): string {
  return marked.parse(normalize(markdown), { ...OPTIONS, async: false }) as string;
}

/** The blocks of a markdown text, for output that is not HTML (the PDF). */
export function markdownTokens(markdown: string): Token[] {
  return marked.lexer(normalize(markdown), OPTIONS);
}
