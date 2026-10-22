import { describe, it, expect, vi } from 'vitest';

vi.mock('@google/genai', () => ({ GoogleGenAI: vi.fn() }));
vi.mock('../utils/sentry-error-handler', () => ({ captureException: vi.fn() }));
vi.mock('../utils/logger', () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

import { parseCampaignStoryResponse } from './campaign-story-generator.service';

describe('parseCampaignStoryResponse', () => {
  it('parses title and content and counts words', () => {
    const result = parseCampaignStoryResponse(JSON.stringify({ title: ' De val ', content: '## Boog\nEen twee drie' }));
    expect(result).toEqual({ title: 'De val', content: '## Boog\nEen twee drie', wordCount: 5 });
  });

  it('falls back to a default title', () => {
    expect(parseCampaignStoryResponse(JSON.stringify({ content: 'Tekst' })).title).toBe('Het verhaal tot nu toe');
  });

  it('rejects empty, invalid or content-less responses', () => {
    expect(() => parseCampaignStoryResponse(undefined)).toThrow();
    expect(() => parseCampaignStoryResponse('not json')).toThrow();
    expect(() => parseCampaignStoryResponse(JSON.stringify({ title: 'x', content: ' ' }))).toThrow();
  });
});
