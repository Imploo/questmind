import type { GenerateContentConfig, ThinkingLevel } from '@google/genai';
import { AIFeatureConfig, GeminiThinkingLevel } from '../types/audio-session.types';

/**
 * Gemini 3.x (incl. 3.5 Flash) deprecates the numeric `thinkingBudget` in favour of a
 * `thinkingLevel` enum, and no longer recommends the `temperature`/`topP`/`topK` sampling
 * params. Older models (2.x and earlier) keep the sampling params and ignore `thinkingLevel`.
 * See https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5
 */
export function isGemini3Model(model: string): boolean {
  return /^gemini-3/.test(model);
}

// Maps our lowercase admin setting to the SDK's `ThinkingLevel` enum wire values (uppercase).
// Typed via a type-only import so we never reference the enum at runtime (keeps test mocks of
// `@google/genai` — which only stub `GoogleGenAI` — from breaking on module load).
const THINKING_LEVEL_MAP: Record<GeminiThinkingLevel, ThinkingLevel> = {
  minimal: 'MINIMAL' as unknown as ThinkingLevel,
  low: 'LOW' as unknown as ThinkingLevel,
  medium: 'MEDIUM' as unknown as ThinkingLevel,
  high: 'HIGH' as unknown as ThinkingLevel,
};

/**
 * Builds the model portion of a `generateContent` config. Spread the result into the `config`
 * object alongside feature-specific fields (systemInstruction, responseSchema, …).
 *
 * Sampling params (temperature/topP/topK) are intentionally not set — they are deprecated for
 * Gemini 3.x. Response shaping is done via `thinkingConfig.thinkingLevel` (when configured).
 */
export function buildGenerationParams(config: AIFeatureConfig): Partial<GenerateContentConfig> {
  const params: Partial<GenerateContentConfig> = {
    maxOutputTokens: config.maxOutputTokens,
  };

  if (isGemini3Model(config.model) && config.thinkingLevel) {
    params.thinkingConfig = { thinkingLevel: THINKING_LEVEL_MAP[config.thinkingLevel] };
  }

  return params;
}
