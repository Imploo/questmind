import { describe, expect, it } from 'vitest';
import { markdownToHtml, markdownTokens } from './markdown';

describe('markdownToHtml', () => {
  it('renders headings, emphasis and lists', () => {
    const html = markdownToHtml('### Cantrips\n\nYou know **two** *cantrips*.\n\n- one\n- two');

    expect(html).toContain('<h3>Cantrips</h3>');
    expect(html).toContain('<strong>two</strong> <em>cantrips</em>');
    expect(html).toContain('<li>one</li>');
  });

  it('keeps a single line break', () => {
    expect(markdownToHtml('One\nTwo')).toContain('One<br>Two');
  });

  it('renders a table that follows a line of text directly', () => {
    const html = markdownToHtml('**Arctic**\r\n| Level | Spells | \r\n|---|---| \r\n| 3rd | hold person |');

    expect(html).toContain('<th>Level</th>');
    expect(html).toContain('<td>hold person</td>');
  });

  it('reads a heading written without a space after the hashes', () => {
    expect(markdownToHtml('Choose one.\n\n###Archery\n\n+2 to hit.')).toContain('<h3>Archery</h3>');
  });

  it('leaves a single hash in running text alone', () => {
    expect(markdownToHtml('#1 rule: roll 2d6 #twice')).toContain('<p>#1 rule: roll 2d6 #twice</p>');
  });
});

describe('markdownTokens', () => {
  it('gives the blocks of the text', () => {
    expect(markdownTokens('###Archery\n\nText').map(token => token.type)).toEqual(['heading', 'paragraph']);
  });
});
