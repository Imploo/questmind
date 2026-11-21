import { describe, it, expect } from 'vitest';
import { buildCampaignStoryPrompt, countWords } from './campaign-story-generator.prompt';
import { getPodcastScriptPrompt } from './podcast-script-generator.prompt';
import { CampaignStoryInput } from '../types/campaign-story.types';

describe('buildCampaignStoryPrompt', () => {
  const sessions: CampaignStoryInput[] = [
    { kind: 'session', title: 'De poort', sessionDate: '2026-01-01', uploadedAt: '2026-01-02', content: 'Eerste verhaal' },
    { kind: 'session', title: 'De grot', sessionDate: null, uploadedAt: '2026-02-03', content: 'Tweede verhaal' },
  ];
  const onlySessions = { timeline: sessions, undatedJournals: [] };

  const journal = (overrides: Partial<CampaignStoryInput> = {}): CampaignStoryInput => ({
    kind: 'journal',
    title: 'Sessie 1',
    sessionDate: '2025-12-01',
    uploadedAt: '2026-03-01',
    content: 'Wij kwamen aan in het dorp.',
    author: null,
    journalType: null,
    ...overrides,
  });

  it('lists the sessions in the given order with their dates', () => {
    const prompt = buildCampaignStoryPrompt(onlySessions, 1200);
    const first = prompt.indexOf('BRON 1 — SESSIEVERHAAL — De poort — 2026-01-01\nEerste verhaal');
    const second = prompt.indexOf('BRON 2 — SESSIEVERHAAL — De grot — Datum onbekend (geüpload op 2026-02-03)\nTweede verhaal');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
  });

  it('includes the target word count and clamps it to the allowed range', () => {
    expect(buildCampaignStoryPrompt(onlySessions, 1200)).toContain('ongeveer 1200 woorden');
    expect(buildCampaignStoryPrompt(onlySessions, 5000)).toContain('ongeveer 1800 woorden');
    expect(buildCampaignStoryPrompt(onlySessions, 100)).toContain('ongeveer 500 woorden');
  });

  it('asks for arc headings, never per-session headings, and JSON output', () => {
    const prompt = buildCampaignStoryPrompt(onlySessions, 1200);
    expect(prompt).toContain('NOOIT een kopje per sessie');
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"content"');
  });

  it('says nothing about reports or Kanka when there are only session stories', () => {
    const prompt = buildCampaignStoryPrompt(onlySessions, 1200);
    expect(prompt).not.toContain('VERSLAG');
    expect(prompt).not.toContain('Kanka');
    expect(prompt).toContain('die in de sessieverhalen staan');
  });

  it('lists a written report as a source in its place, with its type and writer', () => {
    const prompt = buildCampaignStoryPrompt(
      { timeline: [journal({ author: 'Mira', journalType: 'Session' }), ...sessions], undatedJournals: [] },
      1200
    );

    expect(prompt).toContain(
      'BRON 1 — VERSLAG — Sessie 1 — 2025-12-01 — soort: Session, geschreven door Mira\nWij kwamen aan in het dorp.'
    );
    expect(prompt.indexOf('BRON 1 — VERSLAG')).toBeLessThan(prompt.indexOf('BRON 2 — SESSIEVERHAAL — De poort'));
    expect(prompt).toContain('Er zijn 3 bron(nen)');
    expect(prompt).toContain('dan is het verslag de enige bron');
    expect(prompt).toContain('die in de sessieverhalen en verslagen staan');
    expect(prompt).not.toContain('VERSLAGEN ZONDER DATUM');
  });

  it('puts reports without a date in their own block and asks the model to place them', () => {
    const prompt = buildCampaignStoryPrompt(
      { timeline: sessions, undatedJournals: [journal({ sessionDate: null })] },
      1200
    );

    const block = prompt.indexOf('VERSLAGEN ZONDER DATUM (nog niet op hun plek):');
    expect(block).toBeGreaterThan(prompt.indexOf('BRON 2 — SESSIEVERHAAL'));
    expect(prompt.indexOf('BRON 3 — VERSLAG — Sessie 1 — Datum onbekend (aangemaakt op 2026-03-01)')).toBeGreaterThan(block);
    expect(prompt).toContain('staan NIET op hun plek');
  });

  it('writes a story from reports alone', () => {
    const prompt = buildCampaignStoryPrompt({ timeline: [], undatedJournals: [journal({ sessionDate: null })] }, 1200);
    expect(prompt).toContain('BRONNEN (chronologisch):\n\nVERSLAGEN ZONDER DATUM');
    expect(prompt).toContain('BRON 1 — VERSLAG — Sessie 1');
  });

  it('adds the Kanka reference as background, never as events', () => {
    const prompt = buildCampaignStoryPrompt(
      {
        ...onlySessions,
        reference: {
          characters: [{ name: 'Strahd', type: 'NPC', description: 'Heer van Barovia.' }, { name: 'Ireena' }],
          locations: [{ name: 'Barovia' }],
          quests: [],
          organisations: [],
        },
      },
      1200
    );

    expect(prompt).toContain('NASLAG UIT KANKA');
    expect(prompt).toContain('Personages:\n- Strahd (NPC): Heer van Barovia.\n- Ireena\nPlekken:\n- Barovia');
    expect(prompt).not.toContain('Quests:');
    expect(prompt).toContain('De NASLAG UIT KANKA is geen bron van gebeurtenissen');
    expect(prompt.indexOf('NASLAG UIT KANKA (wie')).toBeLessThan(prompt.indexOf('BRONNEN (chronologisch)'));
  });

  it('lists only the names when the reference is very large', () => {
    const characters = Array.from({ length: 400 }, (_, index) => ({ name: `NPC ${index}`, description: 'x'.repeat(200) }));
    const prompt = buildCampaignStoryPrompt(
      { ...onlySessions, reference: { characters, locations: [], quests: [], organisations: [] } },
      1200
    );

    expect(prompt).toContain('Personages: NPC 0, NPC 1, ');
    expect(prompt).not.toContain('xxxx');
  });

  it('leaves the reference out when Kanka has nothing to list', () => {
    const prompt = buildCampaignStoryPrompt(
      { ...onlySessions, reference: { characters: [], locations: [], quests: [], organisations: [] } },
      1200
    );
    expect(prompt).not.toContain('NASLAG');
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
