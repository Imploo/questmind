import { describe, it, expect, vi } from 'vitest';

vi.mock('@google/genai', () => ({ GoogleGenAI: vi.fn() }));
vi.mock('../utils/logger', () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../services/kanka.service', () => ({ buildKankaContextBlock: () => '' }));

import { buildStoryPrompt } from './story-generator.service';

describe('buildStoryPrompt', () => {
  const log = 'DM: Welkom terug.';

  it('writes from the session log alone when the story was never edited by hand', () => {
    const prompt = buildStoryPrompt(log, { userCorrections: 'Het is Thalia, niet Talia.' });

    expect(prompt).not.toContain('PREVIOUS VERSION');
    expect(prompt).toContain('DM CORRECTIONS:\nHet is Thalia, niet Talia.');
    expect(prompt.endsWith(`SESSION LOG:\n${log}`)).toBe(true);
  });

  it('passes the hand-edited story along as the version to stay true to', () => {
    const prompt = buildStoryPrompt(log, {
      userCorrections: 'Het is Thalia.',
      previousVersion: { content: '  ## De poort\nKael opende de deur (niet Mira).  ', logRenewed: false },
    });

    expect(prompt).toContain('PREVIOUS VERSION:\n## De poort\nKael opende de deur (niet Mira).\n\nSESSION LOG:');
    // The improvements win over the log, additions stay, removals stay removed, notes are worked in.
    expect(prompt).toContain('the previous version is right');
    expect(prompt).toContain('was added by the DM: keep it');
    expect(prompt).toContain('was removed by the DM because it was not true: leave it out');
    expect(prompt).toContain('A remark in parentheses that reads as a note from the DM');
    // The corrections box keeps the last word.
    expect(prompt).toContain('DM CORRECTIONS still apply, and win where they contradict the previous version');
    expect(prompt.indexOf('DM CORRECTIONS:\nHet is Thalia.')).toBeLessThan(prompt.indexOf('PREVIOUS VERSION OF THIS STORY'));
  });

  it('lets new scenes in after the session was transcribed again, without undoing the improvements', () => {
    const prompt = buildStoryPrompt(log, { previousVersion: { content: 'Het verhaal', logRenewed: true } });

    expect(prompt).toContain('The session log was transcribed again after the previous version was written');
    expect(prompt).toContain('tell those too');
    expect(prompt).not.toContain('leave it out, do not bring it back');
    expect(prompt).toContain('the previous version is right');
  });

  it('ignores an empty previous version', () => {
    expect(buildStoryPrompt(log, { previousVersion: { content: '   ', logRenewed: false } })).not.toContain('PREVIOUS VERSION');
  });
});
