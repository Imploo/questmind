import { describe, it, expect } from 'vitest';
import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
  it('turns paragraphs, breaks and list items into lines and drops every other tag', () => {
    const html = '<h2>Sessie 1</h2><p>Wij kwamen <strong>laat</strong> aan.<br>Het regende.</p><ul><li>Een <a href="/x">zwaard</a></li><li>Een kaart</li></ul>';
    expect(htmlToText(html)).toBe('Sessie 1\nWij kwamen laat aan.\nHet regende.\n- Een zwaard\n- Een kaart');
  });

  it('decodes entities after the tags are gone, so escaped markup stays text', () => {
    expect(htmlToText('<p>Tom &amp; Mira&nbsp;zeiden &lt;b&gt;nee&lt;/b&gt; &#8211; caf&eacute; &#x2764; &onbekend;</p>'))
      .toBe('Tom & Mira zeiden <b>nee</b> – café ❤ &onbekend;');
  });

  it('drops scripts and styles with their content', () => {
    expect(htmlToText('<style>p { color: red }</style><p>Tekst</p><script>alert(1)</script>')).toBe('Tekst');
  });

  it('collapses white space and leaves at most one empty line', () => {
    expect(htmlToText('\n<p>  Een   twee </p>\n\n\n<p></p><p></p><p>Drie</p>')).toBe('Een twee\n\nDrie');
  });

  it('returns an empty string for markup without text', () => {
    expect(htmlToText('<p><br></p>')).toBe('');
  });
});
