import { describe, it, expect } from 'vitest';
import { buildCampaignStoryPrompt, countWords } from './campaign-story-generator.prompt';
import { getPodcastScriptPrompt } from './podcast-script-generator.prompt';

describe('buildCampaignStoryPrompt', () => {
  const sessions = [
    { title: 'De poort', sessionDate: '2026-01-01', uploadedAt: '2026-01-02', content: 'Eerste verhaal' },
    { title: 'De grot', sessionDate: null, uploadedAt: '2026-02-03', content: 'Tweede verhaal' },
  ];

  it('lists the sessions in the given order with their dates', () => {
    const prompt = buildCampaignStoryPrompt(sessions, 1200);
    const first = prompt.indexOf('SESSIE 1 — De poort — 2026-01-01\nEerste verhaal');
    const second = prompt.indexOf('SESSIE 2 — De grot — Datum onbekend (geüpload op 2026-02-03)\nTweede verhaal');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
  });

  it('includes the target word count and clamps it to the allowed range', () => {
    expect(buildCampaignStoryPrompt(sessions, 1200)).toContain('ongeveer 1200 woorden');
    expect(buildCampaignStoryPrompt(sessions, 5000)).toContain('ongeveer 1800 woorden');
    expect(buildCampaignStoryPrompt(sessions, 100)).toContain('ongeveer 500 woorden');
  });

  it('asks for arc headings, never per-session headings, and JSON output', () => {
    const prompt = buildCampaignStoryPrompt(sessions, 1200);
    expect(prompt).toContain('NOOIT een kopje per sessie');
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"content"');
  });
});

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('  een twee\n drie ')).toBe(3);
    expect(countWords('')).toBe(0);
  });
});

describe('getPodcastScriptPrompt kinds', () => {
  it('defaults to the session framing', () => {
    expect(getPodcastScriptPrompt(5000)).toBe(getPodcastScriptPrompt(5000, 'session'));
    expect(getPodcastScriptPrompt(5000)).toContain('D&D sessie recap');
  });

  it('uses a campaign framing with the same limits for campaign podcasts', () => {
    const prompt = getPodcastScriptPrompt(5000, 'campaign');
    expect(prompt).toContain('TERUGBLIK OP DE CAMPAGNE');
    expect(prompt).toContain('het campagneverhaal hieronder');
    expect(prompt).not.toContain('sessie recap');
    expect(prompt).toContain('ONDER 5000 karakters');
  });
});
