import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent, generateContentStream: mockGenerateContentStream };
  },
}));

const streamOf = (...chunks: Record<string, unknown>[]) =>
  (async function* () {
    yield* chunks;
  })();

const mockLogger = vi.hoisted(() => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));
vi.mock('./logger', () => mockLogger);

import {
  GeminiEmptyResponseError,
  GeminiJsonError,
  extractPartialJsonString,
  generateJson,
  generateText,
  getGeminiClient,
  streamJson,
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

  it('generateJson throws GeminiJsonError when the retry is still invalid JSON', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'not json' });
    await expect(generateJson({ config, label: 'test', contents: 'prompt' })).rejects.toBeInstanceOf(GeminiJsonError);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('generateJson retries invalid JSON once with the same token budget', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: '{"a": 1,,}', candidates: [{ finishReason: 'STOP' }] })
      .mockResolvedValueOnce({ text: '{"a": 1}', candidates: [{ finishReason: 'STOP' }] });

    const result = await generateJson<{ a: number }>({ config, label: 'test', contents: 'prompt' });

    expect(result).toEqual({ a: 1 });
    expect(mockGenerateContent.mock.calls[1][0].config.maxOutputTokens).toBe(1000);
  });

  it('generateJson doubles maxOutputTokens when retrying a MAX_TOKENS-truncated response', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: '{"a": "cut', candidates: [{ finishReason: 'MAX_TOKENS' }] })
      .mockResolvedValueOnce({ text: '{"a": "whole"}', candidates: [{ finishReason: 'STOP' }] });

    const result = await generateJson<{ a: string }>({ config, label: 'test', contents: 'prompt' });

    expect(result).toEqual({ a: 'whole' });
    expect(mockGenerateContent.mock.calls[0][0].config.maxOutputTokens).toBe(1000);
    expect(mockGenerateContent.mock.calls[1][0].config.maxOutputTokens).toBe(2000);
  });

  it('generateJson does not retry when jsonRetries is 0, and reports the finish reason', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"a": "cut', candidates: [{ finishReason: 'MAX_TOKENS' }] });

    const promise = generateJson({ config, label: 'test', contents: 'prompt', jsonRetries: 0 });
    await expect(promise).rejects.toMatchObject({ finishReason: 'MAX_TOKENS' });
    await expect(promise).rejects.toThrow('truncated at maxOutputTokens');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('stripCodeFences removes ``` and ```json fences only', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFences('```\n[1]\n```')).toBe('[1]');
    expect(stripCodeFences(' {"a":1} ')).toBe('{"a":1}');
  });

  it('streamJson reports accumulated text per chunk and parses the result', async () => {
    mockGenerateContentStream.mockResolvedValue(
      streamOf({ text: '{"a":' }, { text: '' }, { text: ' 1}', candidates: [{ finishReason: 'STOP' }] })
    );
    const progress: string[] = [];

    const result = await streamJson<{ a: number }>({
      config,
      label: 'test',
      contents: 'prompt',
      schema: { type: 'object' },
      onProgress: (raw) => { progress.push(raw); },
    });

    expect(result).toEqual({ a: 1 });
    expect(progress).toEqual(['{"a":', '{"a": 1}']);
    expect(mockGenerateContentStream.mock.calls[0][0].config).toMatchObject({
      responseMimeType: 'application/json',
      responseSchema: { type: 'object' },
      maxOutputTokens: 1000,
    });
  });

  it('streamJson calls onRetry and doubles the budget after a truncated stream', async () => {
    mockGenerateContentStream
      .mockResolvedValueOnce(streamOf({ text: '{"a": "cu', candidates: [{ finishReason: 'MAX_TOKENS' }] }))
      .mockResolvedValueOnce(streamOf({ text: '{"a": "ok"}' }));
    const events: string[] = [];

    const result = await streamJson<{ a: string }>({
      config,
      label: 'test',
      contents: 'prompt',
      onProgress: (raw) => { events.push(raw); },
      onRetry: () => { events.push('RETRY'); },
    });

    expect(result).toEqual({ a: 'ok' });
    expect(events).toEqual(['{"a": "cu', 'RETRY', '{"a": "ok"}']);
    expect(mockGenerateContentStream.mock.calls[1][0].config.maxOutputTokens).toBe(2000);
  });

  it('streamJson throws GeminiEmptyResponseError for an empty stream', async () => {
    mockGenerateContentStream.mockResolvedValue(streamOf({ text: '', candidates: [{ finishReason: 'SAFETY' }] }));
    const promise = streamJson({ config, label: 'test', contents: 'prompt', onProgress: vi.fn() });
    await expect(promise).rejects.toBeInstanceOf(GeminiEmptyResponseError);
    await expect(promise).rejects.toThrow('SAFETY');
  });

  it('extractPartialJsonString decodes the growing value of a string field', () => {
    expect(extractPartialJsonString('{"te', 'text')).toBeUndefined();
    expect(extractPartialJsonString('{"text":', 'text')).toBeUndefined();
    expect(extractPartialJsonString('{"text": "', 'text')).toBe('');
    expect(extractPartialJsonString('{"text": "Hallo \\"Gimli\\"\\nen', 'text')).toBe('Hallo "Gimli"\nen');
    expect(extractPartialJsonString('{"text":"a\\', 'text')).toBe('a');
    expect(extractPartialJsonString('{"text":"caf\\u00e', 'text')).toBe('caf');
    expect(extractPartialJsonString('{"text":"caf\\u00e9!"', 'text')).toBe('café!');
    expect(extractPartialJsonString('{"text":"klaar","shouldUpdateCharacter":true}', 'text')).toBe('klaar');
    expect(extractPartialJsonString('{"shouldUpdateCharacter":false, "text" : "x', 'text')).toBe('x');
  });
});
