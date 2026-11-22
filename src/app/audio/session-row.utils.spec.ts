import { describe, it, expect } from 'vitest';
import { dayParts, storyExcerpt } from './session-row.utils';

describe('session row utils', () => {
  it('splits a play day into the day and the short month', () => {
    expect(dayParts('2026-11-20', 'nl-NL')).toEqual({ day: '20', month: 'nov' });
    expect(dayParts(null, 'nl-NL')).toEqual({ day: '–', month: '' });
  });

  it('takes the first line of prose of a story, without its markdown', () => {
    expect(storyExcerpt('# Titel\n---\nDe **draak** in [Solace](https://x).\nMeer.')).toBe('De draak in Solace.');
    expect(storyExcerpt(undefined)).toBe('');
  });
});
