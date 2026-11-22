import { describe, it, expect } from 'vitest';
import { selectCampaignStorySources } from './campaign-story-sources';
import { CampaignStoryJournal } from '../types/campaign-story.types';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe('selectCampaignStorySources', () => {
  it('keeps only completed sessions with a story and records skipped ones with a reason', () => {
    const result = selectCampaignStorySources([
      { id: 'a', title: 'A', status: 'completed', content: 'Verhaal A', sessionDate: '2026-01-01' },
      { id: 'b', title: 'B', status: 'completed', content: '   ' },
      { id: 'c', title: 'C', status: 'failed' },
      { id: 'd', title: 'D', status: 'processing' },
      { id: 'e', status: 'uploading' },
    ]);

    expect(result.sources.map(s => s.sessionId)).toEqual(['a']);
    expect(result.skipped).toEqual([
      { sessionId: 'b', title: 'B', reason: 'no_story' },
      { sessionId: 'c', title: 'C', reason: 'failed' },
      { sessionId: 'd', title: 'D', reason: 'processing' },
      { sessionId: 'e', title: 'Untitled Session', reason: 'processing' },
    ]);
  });

  it('sorts by sessionDate, falls back to createdAt and breaks ties on createdAt', () => {
    const result = selectCampaignStorySources([
      { id: 'late', status: 'completed', content: 'x', sessionDate: '2026-03-01', createdAt: ts('2026-03-02T10:00:00Z') },
      { id: 'tie-2', status: 'completed', content: 'x', sessionDate: '2026-02-01', createdAt: ts('2026-02-03T10:00:00Z') },
      { id: 'tie-1', status: 'completed', content: 'x', sessionDate: '2026-02-01', createdAt: ts('2026-02-02T10:00:00Z') },
      { id: 'no-date', status: 'completed', content: 'x', createdAt: '2026-02-15T10:00:00Z' },
      { id: 'first', status: 'completed', content: 'x', sessionDate: '2026-01-01' },
    ]);

    expect(result.sources.map(s => s.sessionId)).toEqual(['first', 'tie-1', 'tie-2', 'no-date', 'late']);
  });

  it('builds prompt inputs with the upload date for undated sessions and a story version snapshot', () => {
    const result = selectCampaignStorySources([
      { id: 'a', title: 'Zonder datum', status: 'completed', content: ' Tekst ', createdAt: ts('2026-02-15T10:00:00Z'), storyRegenerationCount: 3 },
    ]);

    expect(result.timeline).toEqual([
      { kind: 'session', title: 'Zonder datum', sessionDate: null, uploadedAt: '2026-02-15', content: 'Tekst' },
    ]);
    expect(result.sources[0]).toEqual({ sessionId: 'a', title: 'Zonder datum', sessionDate: null, storyVersion: 3 });
  });

  it('returns nothing usable for an empty campaign', () => {
    expect(selectCampaignStorySources([])).toEqual({
      sources: [], skipped: [], journalSources: [], timeline: [], undatedJournals: [],
    });
  });

  describe('with written reports from Kanka', () => {
    const journal = (overrides: Partial<CampaignStoryJournal>): CampaignStoryJournal => ({
      journalId: 1,
      title: 'Verslag',
      date: null,
      createdAt: '2026-03-01',
      updatedAt: '2026-03-02T10:00:00.000000Z',
      type: null,
      author: null,
      content: 'Tekst',
      ...overrides,
    });

    it('puts dated reports between the sessions, a report before the session of the same day', () => {
      const result = selectCampaignStorySources(
        [
          { id: 's2', title: 'Sessie 4', status: 'completed', content: 'x', sessionDate: '2026-02-01' },
          { id: 's1', title: 'Sessie 3', status: 'completed', content: 'x', sessionDate: '2026-01-15', createdAt: ts('2026-01-16T10:00:00Z') },
        ],
        [
          journal({ journalId: 12, title: 'Verslag sessie 3', date: '2026-01-15' }),
          journal({ journalId: 10, title: 'Verslag sessie 1', date: '2025-12-01' }),
          journal({ journalId: 11, title: 'Verslag sessie 2', date: '2025-12-15' }),
        ]
      );

      expect(result.timeline.map(input => `${input.kind}:${input.title}`)).toEqual([
        'journal:Verslag sessie 1',
        'journal:Verslag sessie 2',
        'journal:Verslag sessie 3',
        'session:Sessie 3',
        'session:Sessie 4',
      ]);
      expect(result.undatedJournals).toEqual([]);
      expect(result.sources.map(source => source.sessionId)).toEqual(['s1', 's2']);
    });

    it('keeps reports without a date apart, in title order with numbers counted as numbers', () => {
      const result = selectCampaignStorySources(
        [{ id: 's1', status: 'completed', content: 'x', sessionDate: '2026-02-01' }],
        [
          journal({ journalId: 3, title: 'Sessie 10' }),
          journal({ journalId: 2, title: 'Sessie 2', author: 'Mira', type: 'Session', content: 'Wij liepen.' }),
          journal({ journalId: 1, title: 'Sessie 1', date: '2025-12-01' }),
        ]
      );

      expect(result.timeline.map(input => input.title)).toEqual(['Sessie 1', 'Untitled Session']);
      expect(result.undatedJournals).toEqual([
        { kind: 'journal', title: 'Sessie 2', sessionDate: null, uploadedAt: '2026-03-01', content: 'Wij liepen.', author: 'Mira', journalType: 'Session' },
        { kind: 'journal', title: 'Sessie 10', sessionDate: null, uploadedAt: '2026-03-01', content: 'Tekst', author: null, journalType: null },
      ]);
    });

    it('records which reports went into the story, dated ones first', () => {
      const result = selectCampaignStorySources([], [
        journal({ journalId: 3, title: 'Zonder datum' }),
        journal({ journalId: 2, title: 'B', date: '2026-01-02' }),
        journal({ journalId: 1, title: 'A', date: '2025-12-01' }),
      ]);

      expect(result.sources).toEqual([]);
      expect(result.journalSources).toEqual([
        { journalId: 1, title: 'A', date: '2025-12-01', updatedAt: '2026-03-02T10:00:00.000000Z' },
        { journalId: 2, title: 'B', date: '2026-01-02', updatedAt: '2026-03-02T10:00:00.000000Z' },
        { journalId: 3, title: 'Zonder datum', date: null, updatedAt: '2026-03-02T10:00:00.000000Z' },
      ]);
    });
  });
});
