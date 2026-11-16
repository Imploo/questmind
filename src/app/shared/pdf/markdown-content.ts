import type { Token, Tokens } from 'marked';
import type { Content, TableCell } from 'pdfmake/interfaces';
import { markdownTokens } from '../utils/markdown';

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  decoration?: 'lineThrough';
}

type Inline = string | ({ text: string } & InlineStyle);

/** What is read of a token whatever its kind; marked's own token type has a field for anything. */
interface AnyToken {
  type: string;
  text?: string;
  tokens?: Token[];
}

/** Points between two blocks; a heading keeps more distance from the text before it. */
const BLOCK_GAP = 4;
const HEADING_GAP = 7;
const LIST_ITEM_GAP = 1.5;

const HEADING_FONT_SIZE = 9.5;
const TABLE_FONT_SIZE = 8;

/** Thin rules between the rows, a darker one under the header, no box around it. */
const TABLE_LAYOUT = {
  hLineWidth: (row: number, node: { table: { body: unknown[] } }) => (row === 0 || row === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: (row: number) => (row === 1 ? '#777' : '#ccc'),
  paddingLeft: (column: number) => (column === 0 ? 0 : 6),
  paddingRight: () => 6,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * A markdown text as pdfmake content: headings, bold and italic, lists and tables keep
 * their shape. The text takes the font of the node it is put in.
 */
export function markdownToPdfContent(markdown: string): Content[] {
  return spaced(blocks(markdownTokens(markdown)), BLOCK_GAP);
}

interface Block {
  heading?: boolean;
  content: Content;
}

function blocks(tokens: Token[]): Block[] {
  const out: Block[] = [];
  for (const token of tokens as AnyToken[]) {
    switch (token.type) {
      case 'heading':
        out.push({ heading: true, content: { text: inline(token.tokens), bold: true, fontSize: HEADING_FONT_SIZE } });
        break;
      case 'paragraph':
        out.push({ content: { text: inline(token.tokens) } });
        break;
      case 'text':
        // The text of a list item without blank lines around it.
        out.push({ content: { text: token.tokens ? inline(token.tokens) : decodeEntities(token.text ?? '') } });
        break;
      case 'list': {
        const list = token as Tokens.List;
        const items = list.items.map(item => ({ stack: spaced(blocks(item.tokens), LIST_ITEM_GAP) }));
        out.push({ content: list.ordered ? { ol: items, start: Number(list.start) || 1 } : { ul: items } });
        break;
      }
      case 'table':
        out.push({ content: table(token as Tokens.Table) });
        break;
      case 'blockquote':
        out.push({ content: { stack: spaced(blocks(token.tokens ?? []), BLOCK_GAP), italics: true, margin: [8, 0, 0, 0] } });
        break;
      case 'code':
        out.push({ content: { text: token.text ?? '', preserveLeadingSpaces: true } });
        break;
      case 'html': {
        const text = stripTags(token.text ?? '').trim();
        if (text) out.push({ content: { text } });
        break;
      }
      case 'space':
      case 'hr':
      case 'def':
        break;
      default:
        if (token.text) out.push({ content: { text: decodeEntities(token.text) } });
    }
  }
  return out;
}

/** Every block after the first gets room above it; pdfmake puts none between the items of a stack. */
function spaced(items: Block[], gap: number): Content[] {
  return items.map(({ heading, content }, index) => {
    if (index === 0) return content;
    const top = heading ? Math.max(gap, HEADING_GAP) : gap;
    const own = (content as { margin?: number[] }).margin;
    return { ...(content as object), margin: [own?.[0] ?? 0, top, 0, 0] } as Content;
  });
}

function table(token: Tokens.Table): Content {
  const cell = (c: Tokens.TableCell, header: boolean): TableCell => ({
    text: inline(c.tokens, header ? { bold: true } : {}),
    alignment: c.align ?? 'left',
  });
  return {
    table: {
      headerRows: 1,
      // A table that goes on to the next page takes at least one row along with its header.
      keepWithHeaderRows: 1,
      widths: token.header.map(() => 'auto'),
      body: [token.header.map(c => cell(c, true)), ...token.rows.map(row => row.map(c => cell(c, false)))],
    },
    layout: TABLE_LAYOUT,
    fontSize: TABLE_FONT_SIZE,
  };
}

function inline(tokens: Token[] | undefined, style: InlineStyle = {}): Inline[] {
  const styled = (text: string): Inline => (Object.keys(style).length ? { text, ...style } : text);
  const out: Inline[] = [];
  for (const token of (tokens ?? []) as AnyToken[]) {
    switch (token.type) {
      case 'strong':
        out.push(...inline(token.tokens, { ...style, bold: true }));
        break;
      case 'em':
        out.push(...inline(token.tokens, { ...style, italics: true }));
        break;
      case 'del':
        out.push(...inline(token.tokens, { ...style, decoration: 'lineThrough' }));
        break;
      case 'link':
        out.push(...inline(token.tokens, style));
        break;
      case 'br':
        out.push('\n');
        break;
      case 'escape':
      case 'codespan':
        out.push(styled(token.text ?? ''));
        break;
      case 'html':
        // "<br>" is the one tag rule texts use; any other tag goes, its text stays.
        out.push(styled(stripTags((token.text ?? '').replace(/<br\s*\/?>/gi, '\n'))));
        break;
      default:
        if (token.tokens?.length) out.push(...inline(token.tokens, style));
        else if (token.text) out.push(styled(decodeEntities(token.text)));
    }
  }
  return out;
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''));
}

/** The lexer leaves "&amp;" and the like as they were typed; in HTML a browser would decode them. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? match;
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}
