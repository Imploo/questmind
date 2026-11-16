/**
 * Leaves out of a rules text what a character only gets at a level above its own:
 * "This increases to two additional dice at 13th level" for a 9th-level barbarian,
 * or the 8th-level row of the Wild Shape table for a 4th-level druid.
 *
 * Rules are prose, so this is cautious on purpose: text goes only when every level
 * it names is out of reach, and it stays whenever that is unclear.
 */

const ORDINAL = String.raw`\d+(?:st|nd|rd|th)`;
/** "5th level", "3rd-level", "8th, 12th, 16th, and 19th level". */
const LEVEL_MENTION = String.raw`((?:${ORDINAL}(?:,| and|, and| or|, or)? )*${ORDINAL})[-\s­]+level`;
/** Words that tie a level to the moment a character gets something. */
const GATE = String.raw`(?:and\s+)?(?:again\s+)?(?:also\s+)?(?:when you reach|once you reach|upon reaching|by the time you reach|beginning at|starting at|at|by)\s+${LEVEL_MENTION}(?:\s+in this class)?`;

/** What precedes a level when it is the level a character gets something at. */
const GAINED_AT = /\b(?:at|by|reach|reaching)\s+$/i;
/** What stands between two levels of one list: " (2d10), " or ", and ". */
const LIST_GLUE = /^\s*(?:\([^)]*\))?\s*,?\s*(?:and\s+)?$/i;
const GATE_OPENER = new RegExp(`^(?:[*-]\\s+)?${GATE}`, 'i');
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-Z"“*(])/;
const CLAUSE_BREAK = /,? and |, |; /g;
const TABLE_ROW = /^\s*\|/;
const TABLE_SEPARATOR = /^\s*\|[\s|:-]+$/;
const HEADING = /^\s*#{1,6}/;
const LIST_ITEM = /^\s*[*-]\s+/;

interface LevelMention {
  start: number;
  end: number;
  levels: number[];
}

/**
 * The character levels a text names. "at 5th level" and "when you reach 11th level" count,
 * and so does what continues such a list: "5th level (2d10), 11th level (3d10), and 17th level".
 * "a 6th-level spell" and "slots of 3rd level or higher" are spell levels and do not.
 */
function levelMentions(text: string): LevelMention[] {
  const mentions: LevelMention[] = [];
  for (const match of text.matchAll(new RegExp(LEVEL_MENTION, 'gi'))) {
    const previous = mentions[mentions.length - 1];
    const continuesList = previous !== undefined && LIST_GLUE.test(text.slice(previous.end, match.index));
    if (!continuesList && !GAINED_AT.test(text.slice(0, match.index))) continue;
    mentions.push({
      start: match.index,
      end: match.index + match[0].length,
      levels: (match[1].match(/\d+/g) ?? []).map(Number),
    });
  }
  return mentions;
}

/** A sentence must say something besides "when you reach 4th level". */
function saysSomething(text: string): boolean {
  const rest = text.replace(new RegExp(GATE, 'gi'), ' ').replace(/\([^)]*\)/g, ' ');
  return (rest.match(/[a-z]+/gi) ?? []).length >= 3;
}

/** The sentence without what lies above `level`; null when nothing of it applies yet. */
function tailorSentence(sentence: string, level: number): string | null {
  const mentions = levelMentions(sentence);
  if (!mentions.length) return sentence;

  const reachable = mentions.map(mention => mention.levels.some(l => l <= level));
  if (!reachable.includes(true)) return null;

  // "... three at 11th level and four at 20th level": cut where the unreachable part starts.
  const firstBeyond = reachable.lastIndexOf(true) + 1;
  if (firstBeyond >= mentions.length) return sentence;
  const from = mentions[firstBeyond - 1].end;
  const between = sentence.slice(from, mentions[firstBeyond].start);
  const breaks = [...between.matchAll(CLAUSE_BREAK)];
  if (!breaks.length) return sentence;
  const head = sentence.slice(0, from + breaks[breaks.length - 1].index).trimEnd();
  return saysSomething(head) ? `${head}.` : sentence;
}

/** The paragraph without what lies above `level`; null when the whole paragraph is about a later level. */
function tailorParagraph(paragraph: string, level: number): string | null {
  if (/^\s*prerequisite/i.test(paragraph)) return paragraph;
  const kept: string[] = [];
  const sentences = paragraph.split(SENTENCE_BREAK);
  for (const [index, sentence] of sentences.entries()) {
    const tailored = tailorSentence(sentence, level);
    if (tailored !== null) {
      kept.push(tailored);
    } else if (index === 0 && GATE_OPENER.test(sentence)) {
      // "At 18th level, you gain X. It lasts ..." — the rest describes X too.
      return null;
    }
  }
  return kept.length ? kept.join(' ') : null;
}

function firstCell(row: string): string {
  return row.split('|')[1]?.trim() ?? '';
}

/** A table with one row per character level ("Level", "Druid Level"), not per spell level. */
function isLevelTable(header: string): boolean {
  const cell = firstCell(header);
  return /\blevel$/i.test(cell) && !/spell|slot/i.test(cell);
}

function tailorTable(rows: string[], level: number): string[] {
  if (!isLevelTable(rows[0])) return rows;
  const head = rows.filter((row, index) => index === 0 || TABLE_SEPARATOR.test(row));
  const body = rows
    .filter(row => !head.includes(row))
    .filter(row => {
      const rowLevel = /^(\d+)(?:st|nd|rd|th)?$/.exec(firstCell(row));
      return !rowLevel || Number(rowLevel[1]) <= level;
    });
  return body.length ? [...head, ...body] : [];
}

/** Drop headings that no longer have any text under them. */
function withoutEmptySections(lines: string[]): string[] {
  return lines.filter((line, index) => {
    if (!HEADING.test(line)) return true;
    const next = lines.slice(index + 1).find(candidate => candidate.trim());
    return next !== undefined && !HEADING.test(next);
  });
}

/**
 * `text` as it applies to a character of `level`. Returns an empty string when the
 * text as a whole is about a later level (it opens with "Starting at 14th level, ...");
 * the caller decides what to show then.
 */
export function tailorToLevel(text: string, level: number): string {
  if (!Number.isFinite(level) || level < 1 || level >= 20) return text;

  const lines = text.split('\n');
  const result: string[] = [];
  let droppedListIntro = false;
  let sawText = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TABLE_ROW.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(lines[i++]);
      i--;
      result.push(...tailorTable(rows, level));
      droppedListIntro = false;
      continue;
    }
    if (!line.trim()) {
      result.push('');
      continue;
    }
    if (HEADING.test(line)) {
      droppedListIntro = false;
      result.push(line);
      continue;
    }
    // The bullets under a dropped "At 18th level, you gain the following benefits:".
    if (droppedListIntro && LIST_ITEM.test(line)) continue;

    const tailored = tailorParagraph(line, level);
    if (tailored === null && !sawText) return '';
    sawText = true;
    droppedListIntro = tailored === null && line.trimEnd().endsWith(':');
    if (tailored !== null) result.push(tailored);
  }

  return withoutEmptySections(result).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
