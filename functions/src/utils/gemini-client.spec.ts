import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

const mockLogger = vi.hoisted(() => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));
vi.mock('./logger', () => mockLogger);

import {
  GeminiEmptyResponseError,
  GeminiJsonError,
  generateJson,
  generateText,
  getGeminiClient,
  stripCodeFences,
} from './gemini-client';

const config = { model: 'gemini-3.8-flash', maxOutputTokens: 1000, thinkingLevel: 'low' as const };

describe('gemini-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-key';
  });

  it('getGeminiClient throws failed-precondition without an API key', () => {
    delete process.env.GOOGLE_AI_API_KEY;
    expect(() => getGeminiClient()).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('generateText sends model params + system instruction and logs usage', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '  hallo  ',
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1, totalTokenCount: 4 },
    });

    const text = await generateText({ config, label: 'test', contents: 'prompt', systemInstruction: 'sys' });

    expect(text).toBe('hallo');
    const request = mockGenerateContent.mock.calls[0][0];
    expect(request.model).toBe('gemini-3.8-flash');
    expect(request.config).toMatchObject({
      systemInstruction: 'sys',
      maxOutputTokens: 1000,
      thinkingConfig: { thinkingLevel: 'LOW' },
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      'test: Gemini response received',
      expect.objectContaining({ finishReason: 'STOP', totalTokenCount: 4 })
    );
  });

  it('generateText warns on MAX_TOKENS and throws with the reason on an empty response', async () => {
    mockGenerateContent.mockResolvedValue({ text: '', candidates: [{ finishReason: 'MAX_TOKENS' }] });

    const promise = generateText({ config, label: 'test', contents: 'prompt' });
    await expect(promise).rejects.toBeInstanceOf(GeminiEmptyResponseError);
    await expect(promise).rejects.toThrow('MAX_TOKENS');
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('generateJson requests JSON with the schema and parses fenced output', async () => {
    mockGenerateContent.mockResolvedValue({ text: '```json\n{"a": 1}\n```' });

    const result = await generateJson<{ a: number }>({
      config,
      label: 'test',
      contents: 'prompt',
      schema: { type: 'object' },
    });

    expect(result).toEqual({ a: 1 });
    expect(mockGenerateContent.mock.calls[0][0].config).toMatchObject({
      responseMimeType: 'application/json',
      responseSchema: { type: 'object' },
    });
  });

  it('generateJson throws GeminiJsonError on invalid JSON', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'not json' });
    await expect(generateJson({ config, label: 'test', contents: 'prompt' })).rejects.toBeInstanceOf(GeminiJsonError);
  });

  it('stripCodeFences removes ``` and ```json fences only', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFences('```\n[1]\n```')).toBe('[1]');
    expect(stripCodeFences(' {"a":1} ')).toBe('{"a":1}');
  });
});
