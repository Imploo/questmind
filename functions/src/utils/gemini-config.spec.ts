import { describe, it, expect } from 'vitest';
import { buildGenerationParams, supportsThinkingLevel } from './gemini-config';

describe('supportsThinkingLevel', () => {
  it.each(['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-4-neon', 'gemini-4-carbon', 'gemini-10-x'])(
    'is true for %s',
    (model) => expect(supportsThinkingLevel(model)).toBe(true)
  );

  it.each(['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-flash-latest', 'gpt-4', ''])(
    'is false for %s',
    (model) => expect(supportsThinkingLevel(model)).toBe(false)
  );
});

describe('buildGenerationParams', () => {
  it('sends the thinking level to a Gemini 4 model', () => {
    expect(buildGenerationParams({ model: 'gemini-4-neon', maxOutputTokens: 65536, thinkingLevel: 'low' })).toEqual({
      maxOutputTokens: 65536,
      thinkingConfig: { thinkingLevel: 'LOW' },
    });
  });

  it('leaves the thinking level out for a Gemini 2 model', () => {
    expect(buildGenerationParams({ model: 'gemini-2.5-flash', maxOutputTokens: 1024, thinkingLevel: 'low' })).toEqual({
      maxOutputTokens: 1024,
    });
  });
});
