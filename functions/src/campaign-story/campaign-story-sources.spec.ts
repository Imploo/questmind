import { describe, it, expect } from 'vitest';
import { selectCampaignStorySources } from './campaign-story-sources';

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

    expect(result.inputs).toEqual([
      { title: 'Zonder datum', sessionDate: null, uploadedAt: '2026-02-15', content: 'Tekst' },
    ]);
    expect(result.sources[0]).toEqual({ sessionId: 'a', title: 'Zonder datum', sessionDate: null, storyVersion: 3 });
  });

  it('returns nothing usable for an empty campaign', () => {
    expect(selectCampaignStorySources([])).toEqual({ sources: [], skipped: [], inputs: [] });
  });
});
