import { GoogleGenAI } from '@google/genai';
import type { ContentListUnion, GenerateContentConfig, GenerateContentResponse } from '@google/genai';
import { HttpsError } from 'firebase-functions/v2/https';
import * as logger from './logger';
import { buildGenerationParams } from './gemini-config';
import { AIFeatureConfig } from '../types/audio-session.types';

/**
 * Shared Gemini access: one error path for a missing API key, one place that
 * logs usage/finish reason, and one JSON parser that tolerates code fences.
 */

export interface GenerateOpts {
  /** Model + token/thinking settings (from AI settings). */
  config: AIFeatureConfig;
  contents: ContentListUnion;
  systemInstruction?: string;
  /** Extra request config (e.g. responseSchema), merged over the model params. */
  extraConfig?: Partial<GenerateContentConfig>;
  /** Log label, e.g. 'characterChat'. */
  label: string;
  /** Extra fields for the usage log line (e.g. segment number). */
  logContext?: Record<string, unknown>;
}

/** The Gemini API key, or a `failed-precondition` error when it isn't configured. */
export function getGeminiApiKey(): string {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'Google AI API key not configured');
  }
  return apiKey;
}

export function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: getGeminiApiKey() });
}

/** Generate text; throws when Gemini returns no text (with the reason it gave). */
export async function generateText(opts: GenerateOpts, client: GoogleGenAI = getGeminiClient()): Promise<string> {
  return (await requestText(opts, client)).text;
}

/** One `generateContent` call: the trimmed text plus the finish reason Gemini gave. */
async function requestText(
  opts: GenerateOpts,
  client: GoogleGenAI
): Promise<{ text: string; finishReason?: string }> {
  const response = await client.models.generateContent({
    model: opts.config.model,
    contents: opts.contents,
    config: {
      ...(opts.systemInstruction ? { systemInstruction: opts.systemInstruction } : {}),
      ...opts.extraConfig,
      ...buildGenerationParams(opts.config),
    },
  });

  logUsage(opts, response);

  const text = response.text?.trim();
  if (!text) {
    throw new GeminiEmptyResponseError(opts.label, describeEmptyResponse(response));
  }
  return { text, finishReason: response.candidates?.[0]?.finishReason };
}

/** Upper bound for the doubled token budget used when retrying a truncated JSON response. */
const MAX_RETRY_OUTPUT_TOKENS = 65536;

/**
 * Generate JSON (`responseMimeType: application/json`, optional schema) and
 * parse it. Invalid JSON is retried (`jsonRetries`, default 1); when Gemini
 * stopped on MAX_TOKENS the retry gets double the output budget, since thinking
 * tokens share that budget on Gemini 3.x. Throws a `GeminiJsonError` when the
 * last attempt still isn't valid JSON.
 */
export async function generateJson<T>(
  opts: GenerateOpts & { schema?: object; jsonRetries?: number },
  client: GoogleGenAI = getGeminiClient()
): Promise<T> {
  const retries = opts.jsonRetries ?? 1;
  let config = opts.config;

  for (let attempt = 0; ; attempt++) {
    const { text, finishReason } = await requestText(
      {
        ...opts,
        config,
        logContext: attempt > 0 ? { ...opts.logContext, attempt } : opts.logContext,
        extraConfig: {
          responseMimeType: 'application/json',
          ...(opts.schema ? { responseSchema: opts.schema } : {}),
          ...opts.extraConfig,
        },
      },
      client
    );

    try {
      return parseJsonResponse<T>(text, opts.label, finishReason);
    } catch (error) {
      if (!(error instanceof GeminiJsonError) || attempt >= retries) {
        throw error;
      }
      if (finishReason === 'MAX_TOKENS' && config.maxOutputTokens) {
        config = { ...config, maxOutputTokens: Math.min(config.maxOutputTokens * 2, MAX_RETRY_OUTPUT_TOKENS) };
      }
      logger.warn(`${opts.label}: retrying after invalid Gemini JSON`, {
        ...opts.logContext,
        attempt: attempt + 1,
        finishReason,
        maxOutputTokens: config.maxOutputTokens,
      });
    }
  }
}

/** Gemini returned no text; the message carries the finish/block reason it gave. */
export class GeminiEmptyResponseError extends Error {
  constructor(label: string, reason: string) {
    super(`No response text from Gemini (${label}) ${reason}`);
    this.name = 'GeminiEmptyResponseError';
  }
}

export class GeminiJsonError extends Error {
  constructor(label: string, readonly responseText: string, readonly finishReason?: string) {
    super(
      finishReason === 'MAX_TOKENS'
        ? `Gemini (${label}) returned invalid JSON: truncated at maxOutputTokens.`
        : `Gemini (${label}) returned invalid JSON (finishReason: ${finishReason ?? 'unknown'}).`
    );
    this.name = 'GeminiJsonError';
  }
}

export function parseJsonResponse<T>(text: string, label: string, finishReason?: string): T {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    logger.warn(`${label}: could not parse Gemini JSON`, {
      responseText: cleaned.slice(0, 500),
      responseTail: cleaned.slice(-200),
      responseLength: cleaned.length,
      finishReason,
    });
    throw new GeminiJsonError(label, cleaned, finishReason);
  }
}

/** Remove a surrounding ```/```json fence, which models sometimes add despite the JSON mime type. */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

/** Why Gemini returned nothing (safety block, recitation, token limit, …) — for error messages. */
export function describeEmptyResponse(response: GenerateContentResponse): string {
  const candidate = response.candidates?.[0];
  return JSON.stringify({
    finishReason: candidate?.finishReason,
    finishMessage: candidate?.finishMessage,
    blockReason: response.promptFeedback?.blockReason,
    blockReasonMessage: response.promptFeedback?.blockReasonMessage,
    safetyRatings: candidate?.safetyRatings?.filter((r) => r.blocked),
  });
}

function logUsage(opts: GenerateOpts, response: GenerateContentResponse): void {
  const usage = response.usageMetadata;
  const finishReason = response.candidates?.[0]?.finishReason;
  logger.info(`${opts.label}: Gemini response received`, {
    ...opts.logContext,
    model: opts.config.model,
    finishReason,
    promptTokenCount: usage?.promptTokenCount,
    candidatesTokenCount: usage?.candidatesTokenCount,
    totalTokenCount: usage?.totalTokenCount,
    configuredMaxOutputTokens: opts.config.maxOutputTokens,
  });
  if (finishReason === 'MAX_TOKENS') {
    logger.warn(`${opts.label}: Gemini hit maxOutputTokens — output may be truncated`, opts.logContext);
  }
}
