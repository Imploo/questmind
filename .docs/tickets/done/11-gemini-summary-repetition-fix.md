# Ticket 11: Gemini Summary Repetition - Root Cause Analysis & Fix

## Priority: CRITICAL

## Status: RESOLVED

## Related: Ticket 10 (supersedes with specific fixes)

## Resolution

**Removed summary generation entirely from transcription.** The summary field was causing the model to enter repetitive loops. Since the summary isn't needed for the core transcription functionality, removing it eliminates the root cause.

**Changes made:**

- Removed `summary` field from transcription schema
- Removed summary-related prompt instructions
- Removed `detectRepetition()`, `sanitizeSummary()`, `extractFinishReason()` methods
- Removed `MAX_SUMMARY_CHARS`, `MAX_SUMMARY_SENTENCES` constants
- Simplified `callTranscriptionModel()` - no more retry loops for summary issues

---

## Original Issue

Gemini 2.5 Flash was generating massively repetitive summaries despite existing mitigations. The model repeated the same sentence hundreds of times until hitting MAX_TOKENS, completely ignoring prompt instructions about brevity.

## Latest Incident

```json
{
  "finishReason": "MAX_TOKENS",
  "usageMetadata": {
    "promptTokenCount": 19655,
    "candidatesTokenCount": 5871,
    "promptTokensDetails": [
      { "modality": "TEXT", "tokenCount": 452 },
      { "modality": "AUDIO", "tokenCount": 19203 }
    ],
    "thoughtsTokenCount": 6115
  },
  "modelVersion": "gemini-2.5-flash"
}
```

The summary output was the same sentence repeated ~100+ times:

> "The party also discusses a character's fear of meeting clerics and being caught, and another character's core identity as an inventor despite the risks involved with powerful magic."

## Root Cause Analysis

### 1. MAX_OUTPUT_TOKENS Too High for Summary

The current `MAX_TRANSCRIPTION_OUTPUT_TOKENS = 12000` is meant for the full transcription (segments + summary). However, this gives the model permission to generate far more summary text than needed.

A 2-3 sentence summary should be **100-300 tokens**, not thousands.

### 2. Model Confusion: Segments vs Summary

The current schema asks for BOTH detailed segments AND a brief summary in the same response:

```typescript
{
  summary: { type: Type.STRING },       // Should be 2-3 sentences
  segments: { type: Type.ARRAY, ... }   // Can be very long
}
```

The model may be "leaking" verbosity from segments into the summary field, or getting confused about which part should be brief.

### 3. "Thinking Tokens" Indicate Internal Confusion

The response shows `thoughtsTokenCount: 6115` - the model spent significant internal tokens "thinking" before producing repetitive output. This suggests the model was uncertain or in a confused state.

### 4. Current Prompt Instructions Are Ineffective

```
IMPORTANT: Provide a BRIEF summary (max 2-3 sentences). DO NOT repeat the same information multiple times.
If you notice you are repeating yourself, stop and tell us you detected repeating yourself in the summary.
```

**Why this doesn't work:**

- Gemini generates tokens autoregressively - it can't "notice" repetition mid-generation
- The instruction relies on self-awareness the model doesn't have during generation
- Once in a repetitive loop, the model has high confidence in continuing the pattern

### 5. Temperature Too Low

Current: `temperature: 0.2` (first attempt)

Low temperature increases the probability of repeating high-confidence tokens. When the model starts a repetitive pattern, low temperature makes it MORE likely to continue.

## Proposed Fixes

### Fix 1: Separate Summary Generation (Recommended)

**Don't generate the summary in the same call as transcription.**

After getting segments, make a SEPARATE call with just the transcript text to generate a summary:

```typescript
// Step 1: Transcription call - segments only
const TRANSCRIPTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    segments: {
      /* ... */
    },
  },
};

// Step 2: Summary call - summary only, with strict constraints
const SUMMARY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      maxLength: 500, // Character limit in schema
    },
  },
};

// Summary call with much lower token limit
const summaryResponse = await this.ai.models.generateContent({
  model: environment.audioModel,
  contents: {
    parts: [
      { text: `Summarize this D&D session transcript in 2-3 sentences:\n\n${transcriptText}` },
    ],
  },
  config: {
    maxOutputTokens: 300, // Hard limit for summary only
    temperature: 0.5,
    // ...
  },
});
```

### Fix 2: Per-Field Token Budgets (Alternative)

If keeping single-call approach, split the token budget:

```typescript
// Total budget: 12000 tokens
// - Segments: 11700 tokens (97.5%)
// - Summary: 300 tokens (2.5%)

// Enforce by checking summary length BEFORE parsing full response
const summaryMatch = response.text.match(/"summary"\s*:\s*"([^"]+)"/);
if (summaryMatch && summaryMatch[1].length > 600) {
  // ~150 tokens
  throw new Error('Summary too long - likely repetition');
}
```

### Fix 3: Strengthen Prompt with Explicit Constraints

```typescript
export const AUDIO_TRANSCRIPTION_PROMPT = `Transcribe this D&D session audio.

## SUMMARY RULES (CRITICAL)
- Summary MUST be EXACTLY 1-3 sentences
- Summary MUST be under 50 words total
- If you catch yourself writing the same phrase twice, STOP immediately
- NEVER write more than 3 sentences in the summary field

## ERROR CONDITIONS
...

## OUTPUT FORMAT
...`;
```

### Fix 4: Increase Temperature for Summary

```typescript
// When generating summary (if separate call) or retry
temperature: 0.6; // Higher than 0.2 to break repetition patterns
topK: 40; // Allow more token variety
frequencyPenalty: 0.5; // Penalize repeated tokens (if supported)
```

### Fix 5: Aggressive Early Repetition Detection

Current detection runs AFTER full generation. Add streaming detection:

```typescript
private async callTranscriptionModelWithStreaming(contents: any): Promise<any> {
  const stream = await this.ai.models.generateContentStream({ /* ... */ });

  let fullText = '';
  const recentSentences: string[] = [];

  for await (const chunk of stream) {
    fullText += chunk.text;

    // Check every ~500 chars
    if (fullText.length % 500 < chunk.text.length) {
      const sentences = fullText.split(/[.!?]+/).filter(s => s.length > 20);
      const last5 = sentences.slice(-5);

      // If last 3 sentences are identical, abort
      if (last5.length >= 3) {
        const normalized = last5.map(s => s.toLowerCase().trim());
        if (normalized[normalized.length - 1] === normalized[normalized.length - 2] &&
            normalized[normalized.length - 2] === normalized[normalized.length - 3]) {
          stream.cancel();
          throw new Error('Repetition detected during generation');
        }
      }
    }
  }

  return JSON.parse(fullText);
}
```

### Fix 6: Fallback to Different Model

If Gemini 2.5 Flash consistently fails with repetition, fall back to a different model variant:

```typescript
const FALLBACK_MODELS = [
  'gemini-2.5-flash',      // Primary
  'gemini-1.5-flash',      // Fallback 1 (may be more stable)
  'gemini-2.5-pro',        // Fallback 2 (more capable but slower)
];

async transcribeWithFallback(audio: File): Promise<any> {
  for (const model of FALLBACK_MODELS) {
    try {
      return await this.transcribe(audio, model);
    } catch (error) {
      if (error.message.includes('repetition')) {
        console.warn(`Model ${model} produced repetition, trying fallback`);
        continue;
      }
      throw error;
    }
  }
  throw new Error('All models failed to produce valid output');
}
```

## Implementation Plan

### Phase 1: Immediate (Today)

1. **Lower MAX_OUTPUT_TOKENS to 8000** (from 12000) - reduces waste on repetitive output
2. **Increase base temperature to 0.4** (from 0.2) - reduces repetition likelihood
3. **Add summary length check before JSON parse** - fail fast on obviously bad output
4. **Add explicit word count to prompt** ("Summary MUST be under 50 words")

### Phase 2: Short Term (This Week)

1. **Separate summary generation** into its own API call with 300 token limit
2. **Add streaming repetition detection** to abort bad generations early
3. **Implement model fallback** for repetition failures

### Phase 3: Medium Term

1. **Evaluate alternative models** (Claude, GPT-4, Gemini Pro) for summary generation
2. **Add user feedback mechanism** to report bad summaries
3. **Implement quality scoring** for generated summaries

## Testing

1. **Regression test**: Ensure normal transcriptions still work
2. **Repetition injection test**: Feed audio that previously caused repetition
3. **Token budget test**: Verify summary stays under limit
4. **Fallback test**: Verify model fallback works correctly
5. **Edge case tests**:
   - Very short audio (<1 min)
   - Very long audio (>2 hours)
   - Audio with minimal speech
   - Audio with many speakers

## Acceptance Criteria

- [ ] No summaries exceed 100 words
- [ ] Repetition detection catches loops within first 500 tokens
- [ ] MAX_TOKENS finish reason triggers immediate retry with different params
- [ ] Summary generation separated from transcription (Phase 2)
- [ ] Token usage reduced by 50%+ for failed cases
- [ ] Fallback model kicks in after 2 repetition failures

## Files to Modify

- `src/app/audio/audio-transcription.service.ts` - Main service
- `src/app/prompts/audio-transcription.prompt.ts` - Prompt template
- `src/app/audio/audio-utilities.ts` - Add summary-specific constants
- `src/environments/environment.ts` - Add fallback model config

## References

- [Gemini API Best Practices](https://ai.google.dev/docs/concepts#model-tuning)
- [Preventing Repetitive Text Generation](https://huggingface.co/blog/how-to-generate)
- Ticket 10: Original repetition bug report
