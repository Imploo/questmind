import { describe, expect, it } from 'vitest';
import { markdownToPdfContent } from './markdown-content';

describe('markdownToPdfContent', () => {
  it('keeps plain text as one paragraph', () => {
    expect(markdownToPdfContent('Deal 2d6 + 3 damage')).toEqual([{ text: ['Deal 2d6 + 3 damage'] }]);
  });

  it('turns emphasis into bold and italic pieces', () => {
    expect(markdownToPdfContent('A **bold** and *slanted* and ***both*** word')).toEqual([
      {
        text: [
          'A ',
          { text: 'bold', bold: true },
          ' and ',
          { text: 'slanted', italics: true },
          ' and ',
          { text: 'both', bold: true, italics: true },
          ' word',
        ],
      },
    ]);
  });

  it('keeps a single line break and puts room between paragraphs', () => {
    expect(markdownToPdfContent('One\r\nTwo\r\n\r\nThree')).toEqual([
      { text: ['One', '\n', 'Two'] },
      { text: ['Three'], margin: [0, 4, 0, 0] },
    ]);
  });

  it('makes a heading bold, with more room above it than a paragraph gets', () => {
    expect(markdownToPdfContent('Intro\n\n### Cantrips\n\nYou know two.')).toEqual([
      { text: ['Intro'] },
      { text: ['Cantrips'], bold: true, fontSize: 9.5, margin: [0, 7, 0, 0] },
      { text: ['You know two.'], margin: [0, 4, 0, 0] },
    ]);
  });

  it('builds bulleted, numbered and nested lists', () => {
    expect(markdownToPdfContent('- one\n- two **x**\n  - nested')).toEqual([
      {
        ul: [
          { stack: [{ text: ['one'] }] },
          {
            stack: [
              { text: ['two ', { text: 'x', bold: true }] },
              { ul: [{ stack: [{ text: ['nested'] }] }], margin: [0, 1.5, 0, 0] },
            ],
          },
        ],
      },
    ]);
    expect(markdownToPdfContent('3. third\n4. fourth')).toEqual([
      { ol: [{ stack: [{ text: ['third'] }] }, { stack: [{ text: ['fourth'] }] }], start: 3 },
    ]);
  });

  it('builds a table with a bold header row, also right after a line of text', () => {
    const [title, table] = markdownToPdfContent(
      '**Arctic**\r\n| Druid Level | Circle Spells  | \r\n|---|---| \r\n| 3rd | hold person, *spike growth* |'
    ) as [unknown, { table: { headerRows: number; keepWithHeaderRows: number; widths: string[]; body: unknown[][] } }];

    expect(title).toEqual({ text: [{ text: 'Arctic', bold: true }] });
    expect(table.table.headerRows).toBe(1);
    expect(table.table.keepWithHeaderRows).toBe(1);
    expect(table.table.widths).toEqual(['auto', 'auto']);
    expect(table.table.body).toEqual([
      [
        { text: [{ text: 'Druid Level', bold: true }], alignment: 'left' },
        { text: [{ text: 'Circle Spells', bold: true }], alignment: 'left' },
      ],
      [
        { text: ['3rd'], alignment: 'left' },
        { text: ['hold person, ', { text: 'spike growth', italics: true }], alignment: 'left' },
      ],
    ]);
  });

  it('shows the text of a link, and characters as a reader would see them', () => {
    expect(markdownToPdfContent('See [the rules](http://x) &amp; roll 2 \\* 3 &#8212; done<br>next')).toEqual([
      { text: ['See ', 'the rules', ' & roll 2 ', '*', ' 3 — done', '\n', 'next'] },
    ]);
  });

  it('leaves out what has no text', () => {
    expect(markdownToPdfContent('')).toEqual([]);
    expect(markdownToPdfContent('Above\n\n---\n\nBelow')).toEqual([
      { text: ['Above'] },
      { text: ['Below'], margin: [0, 4, 0, 0] },
    ]);
  });
});
