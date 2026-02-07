# Ticket 10: Critical AI Summary Repetition Bug

## Priority: CRITICAL

## Status: Open

## Summary

Gemini 2.5 Flash model is generating catastrophically repetitive and nonsensical summaries, repeating the same phrase thousands of times until hitting the token limit instead of providing a useful summary.

## Problem Description

When processing audio transcription summaries, the Gemini 2.5 Flash model entered a repetitive loop, generating the same content over and over:

- **Model**: `gemini-2.5-flash`
- **Input**: 298,243 audio tokens + 343 text tokens
- **Output**: 65,230 tokens (hit MAX_TOKENS limit)
- **Finish Reason**: `MAX_TOKENS` (model didn't naturally complete, just hit limit)

The output consists of the same phrases repeated thousands of times:

- "The party is also aware of the importance of their mission..."
- "They are determined to make sure that their efforts are not in vain..."
- "The session ends with the party reaffirming their commitment to their cause..."

## Impact

1. **User Experience**: Users receive completely useless summaries
2. **Cost**: Wasting significant API tokens (65k+ tokens per failed request)
3. **System Reliability**: AI summarization feature is fundamentally broken
4. **Data Quality**: Corrupted summaries may be stored in the database

## Root Cause Analysis

Potential causes:

1. **Model hallucination**: Gemini 2.5 Flash entering repetitive output loop
2. **Prompt issues**: Prompt may be causing model confusion
3. **Audio processing**: Audio tokens may be malformed or contain artifacts
4. **Temperature/sampling settings**: Model parameters may encourage repetition
5. **Max tokens too high**: Allowing model to continue repeating without stopping

## Reproduction

See attached JSON response showing the full repetitive output.

**Request Parameters**:

- Audio tokens: 298,243
- Text tokens: 343
- Model: gemini-2.5-flash
- Response ID: `Wex_aePAIrrU7M8PgbbboAY`

## Proposed Solutions

### Immediate (Hotfix)

1. **Add repetition detection**: Monitor output for repeated phrases/sentences
2. **Reduce max_tokens**: Lower the maximum output length to prevent runaway generation
3. **Add early stopping**: Implement checks to stop generation if repetition detected
4. **Temperature adjustment**: Increase temperature to reduce repetitive outputs
5. **Fallback mechanism**: If repetition detected, retry with different parameters or model

### Short-term

1. **Prompt engineering**: Rewrite prompts to explicitly discourage repetition
2. **Add system instructions**: Include instructions like "Be concise, avoid repetition"
3. **Output validation**: Validate summaries before saving to database
4. **Token budget**: Set reasonable max_tokens based on input length
5. **Monitoring**: Add logging/alerting for unusual token usage patterns

### Long-term

1. **Model evaluation**: Test different models (GPT-4, Claude, etc.) for comparison
2. **Chunked transcription**: Break large audio into ~30 min chunks with overlap, transcribe separately, then merge
3. **Quality metrics**: Implement automated quality scoring for summaries
4. **A/B testing**: Compare different models/prompts for reliability
5. **User feedback**: Allow users to report bad summaries

## Implementation Plan

### Phase 1: Emergency Fix (Today)

```typescript
// Add to audio-session.service.ts

private detectRepetition(text: string): boolean {
  // Split into sentences
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

  if (sentences.length < 3) return false;

  // Check if last 3 sentences are very similar
  const lastThree = sentences.slice(-3);
  const similarity = this.calculateSimilarity(lastThree);

  return similarity > 0.8; // 80% similar = likely repetition
}

private async generateSummaryWithProtection(audioTokens: number) {
  // Lower max tokens
  const maxTokens = Math.min(2000, audioTokens / 10);

  // Higher temperature
  const temperature = 0.8;

  // Retry logic
  for (let attempt = 0; attempt < 3; attempt++) {
    const summary = await this.callGemini({
      maxTokens,
      temperature: temperature + (attempt * 0.1),
      // ... other params
    });

    // Check for repetition
    if (!this.detectRepetition(summary)) {
      return summary;
    }

    console.warn(`Repetition detected on attempt ${attempt + 1}`);
  }

  throw new Error('Failed to generate non-repetitive summary');
}
```

### Phase 2: Monitoring (This Week)

- Add CloudWatch/logging for token usage anomalies
- Track summary quality metrics
- Alert on suspicious patterns

### Phase 3: Chunked Audio Processing (Next Sprint)

Implement chunked audio processing to handle long recordings reliably:

#### Strategy Overview

- **Chunk Duration**: 1800 seconds (30 minutes) per chunk
- **Overlap**: 10 seconds between chunks to prevent sentence loss at boundaries
- **Time Context**: Pass chunk start time to AI for accurate timestamps

#### Why Chunking Helps

1. Smaller context = less model confusion/hallucination
2. Reduced token count per request = faster processing
3. If one chunk fails, others still succeed (partial recovery)
4. Better cost control (fail fast on individual chunks)

#### Chunk Calculation

```
Audio Length: 2h 15m (8100 seconds)
Chunk Size: 1800 seconds
Overlap: 10 seconds

Chunk 1: 0:00:00 - 0:30:00 (0 - 1800s)
Chunk 2: 0:29:50 - 0:59:50 (1790 - 3590s)  <- starts 10s before chunk 1 ends
Chunk 3: 0:59:40 - 1:29:40 (3580 - 5380s)
Chunk 4: 1:29:30 - 1:59:30 (5370 - 7170s)
Chunk 5: 1:59:20 - 2:15:00 (7160 - 8100s)  <- final chunk (shorter)
```

#### Implementation

```typescript
// Add to audio-session.service.ts

interface AudioChunk {
  chunkIndex: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  audioBlob: Blob;
}

interface ChunkTranscription {
  chunkIndex: number;
  startTimeSeconds: number;
  transcription: string;
  summary?: string;
}

// Configuration constants
const CHUNK_DURATION_SECONDS = 1800;  // 30 minutes
const CHUNK_OVERLAP_SECONDS = 10;     // 10 second overlap

/**
 * Split audio file into overlapping chunks for processing
 */
private async splitAudioIntoChunks(
  audioFile: File,
  totalDurationSeconds: number
): Promise<AudioChunk[]> {
  const chunks: AudioChunk[] = [];
  let chunkIndex = 0;
  let currentStart = 0;

  while (currentStart < totalDurationSeconds) {
    const chunkEnd = Math.min(
      currentStart + CHUNK_DURATION_SECONDS,
      totalDurationSeconds
    );

    const chunk: AudioChunk = {
      chunkIndex,
      startTimeSeconds: currentStart,
      endTimeSeconds: chunkEnd,
      durationSeconds: chunkEnd - currentStart,
      audioBlob: await this.extractAudioSegment(
        audioFile,
        currentStart,
        chunkEnd
      ),
    };

    chunks.push(chunk);
    chunkIndex++;

    // Move to next chunk start, accounting for overlap
    // (subtract overlap so next chunk starts 10s before this one ends)
    currentStart = chunkEnd - CHUNK_OVERLAP_SECONDS;

    // Prevent infinite loop on very short remaining audio
    if (currentStart >= totalDurationSeconds - CHUNK_OVERLAP_SECONDS) {
      break;
    }
  }

  console.log(`Split ${totalDurationSeconds}s audio into ${chunks.length} chunks`);
  return chunks;
}

/**
 * Extract a segment of audio using Web Audio API or ffmpeg
 */
private async extractAudioSegment(
  audioFile: File,
  startSeconds: number,
  endSeconds: number
): Promise<Blob> {
  // Option 1: Use Web Audio API (client-side)
  const audioContext = new AudioContext();
  const arrayBuffer = await audioFile.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.floor(startSeconds * sampleRate);
  const endSample = Math.floor(endSeconds * sampleRate);
  const numSamples = endSample - startSample;

  // Create new buffer for chunk
  const chunkBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    numSamples,
    sampleRate
  );

  // Copy samples for each channel
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const sourceData = audioBuffer.getChannelData(channel);
    const chunkData = chunkBuffer.getChannelData(channel);
    for (let i = 0; i < numSamples; i++) {
      chunkData[i] = sourceData[startSample + i];
    }
  }

  // Encode back to audio format (simplified - actual implementation needs encoder)
  return await this.encodeAudioBuffer(chunkBuffer);
}

/**
 * Transcribe a single chunk with time context
 */
private async transcribeChunk(
  chunk: AudioChunk,
  sessionStartTime: Date
): Promise<ChunkTranscription> {
  const chunkStartTimestamp = this.formatTimestamp(chunk.startTimeSeconds);

  const prompt = `
You are transcribing a segment of an audio recording.

IMPORTANT CONTEXT:
- This is chunk ${chunk.chunkIndex + 1} of a longer recording
- This chunk starts at ${chunkStartTimestamp} (${chunk.startTimeSeconds} seconds from session start)
- Session started at: ${sessionStartTime.toISOString()}
- Chunk duration: ${chunk.durationSeconds} seconds

When providing timestamps in the transcription, calculate them relative to the FULL session start (not this chunk's start).
For example, if someone speaks 5 minutes into this chunk, and this chunk starts at 30:00, the timestamp should be 35:00.

Please transcribe the audio, including speaker identification and timestamps where appropriate.
Format timestamps as [HH:MM:SS] relative to session start.
`;

  const response = await this.callGeminiWithAudio(chunk.audioBlob, prompt);

  return {
    chunkIndex: chunk.chunkIndex,
    startTimeSeconds: chunk.startTimeSeconds,
    transcription: response.text,
  };
}

/**
 * Process full audio with chunking strategy
 */
async processAudioWithChunking(
  audioFile: File,
  sessionStartTime: Date
): Promise<string> {
  // Get audio duration
  const duration = await this.getAudioDuration(audioFile);

  // For short audio (<= 30 min), process directly without chunking
  if (duration <= CHUNK_DURATION_SECONDS) {
    return this.transcribeSingleFile(audioFile, sessionStartTime, 0);
  }

  // Split into chunks
  const chunks = await this.splitAudioIntoChunks(audioFile, duration);

  // Process chunks (can be parallelized with rate limiting)
  const transcriptions: ChunkTranscription[] = [];

  for (const chunk of chunks) {
    try {
      const result = await this.transcribeChunk(chunk, sessionStartTime);
      transcriptions.push(result);
    } catch (error) {
      console.error(`Failed to transcribe chunk ${chunk.chunkIndex}:`, error);
      // Continue with other chunks - partial success is better than total failure
      transcriptions.push({
        chunkIndex: chunk.chunkIndex,
        startTimeSeconds: chunk.startTimeSeconds,
        transcription: `[Transcription failed for segment ${this.formatTimestamp(chunk.startTimeSeconds)} - ${this.formatTimestamp(chunk.endTimeSeconds)}]`,
      });
    }
  }

  // Merge transcriptions
  return this.mergeChunkTranscriptions(transcriptions);
}

/**
 * Merge chunk transcriptions, handling overlap deduplication
 */
private mergeChunkTranscriptions(chunks: ChunkTranscription[]): string {
  // Sort by chunk index to ensure correct order
  chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

  const mergedParts: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let text = chunk.transcription;

    // For chunks after the first, try to remove duplicate content from overlap
    if (i > 0) {
      text = this.removeOverlapDuplicates(
        mergedParts[mergedParts.length - 1],
        text
      );
    }

    mergedParts.push(text);
  }

  // Join with section markers
  return mergedParts.map((part, i) => {
    if (chunks.length === 1) return part;
    const timestamp = this.formatTimestamp(chunks[i].startTimeSeconds);
    return `--- Segment starting at ${timestamp} ---\n\n${part}`;
  }).join('\n\n');
}

/**
 * Remove duplicate content that may appear due to overlap
 */
private removeOverlapDuplicates(
  previousText: string,
  currentText: string
): string {
  // Get last few sentences of previous chunk
  const prevSentences = previousText.split(/[.!?]+/).slice(-3);

  // Check if current chunk starts with similar content
  for (const sentence of prevSentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 20 && currentText.includes(trimmed)) {
      // Find where the duplicate ends and trim
      const idx = currentText.indexOf(trimmed);
      const afterDuplicate = currentText.substring(idx + trimmed.length);
      // Find next sentence start
      const nextSentenceMatch = afterDuplicate.match(/[.!?]\s+[A-Z]/);
      if (nextSentenceMatch) {
        return afterDuplicate.substring(nextSentenceMatch.index! + 2);
      }
    }
  }

  return currentText;
}

/**
 * Format seconds to HH:MM:SS timestamp
 */
private formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get audio file duration in seconds
 */
private async getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
    };
    audio.onerror = reject;
    audio.src = URL.createObjectURL(file);
  });
}
```

#### Prompt Template for Chunked Transcription

```markdown
You are transcribing a segment of an audio recording.

IMPORTANT CONTEXT:

- This is chunk {chunkIndex} of {totalChunks} in a longer recording
- This chunk starts at {chunkStartTimestamp} ({startSeconds} seconds from session start)
- Previous chunk ended with: "{lastSentenceOfPreviousChunk}"
- Session started at: {sessionStartTime}

TIMESTAMP INSTRUCTIONS:

- All timestamps must be relative to the FULL session start, not this chunk's start
- If this chunk starts at 30:00 and someone speaks 5 minutes in, timestamp = 35:00
- Format: [HH:MM:SS]

OVERLAP HANDLING:

- The first 10 seconds of this chunk overlap with the previous chunk
- If you notice repeated content from the overlap, continue from where it left off
- Do not re-transcribe content that was in the previous chunk

Please transcribe the audio with:

1. Speaker identification (Speaker 1, Speaker 2, or character names if mentioned)
2. Timestamps for significant moments
3. [Action] markers for non-verbal sounds
```

### Phase 4: Architecture Review

- Evaluate alternative models
- Add user feedback mechanism
- Consider server-side audio processing for better reliability

## Testing

### Phase 1 Tests

1. **Regression test**: Ensure fix doesn't break normal summaries
2. **Stress test**: Test with various audio lengths
3. **Repetition test**: Verify detection works correctly
4. **Cost test**: Monitor token usage before/after fix

### Phase 3 Tests (Chunking)

5. **Chunk boundary test**: Verify no sentences are lost at chunk boundaries
6. **Timestamp accuracy test**: Confirm timestamps are correct across chunks
7. **Overlap deduplication test**: Ensure merged transcription has no duplicates
8. **Edge cases**:
   - Audio exactly 30 minutes (no chunking needed)
   - Audio 30:01 (minimal second chunk)
   - Audio 2+ hours (5+ chunks)
   - Silence at chunk boundaries
   - Speaker mid-sentence at boundary
9. **Partial failure test**: Verify graceful handling when one chunk fails
10. **Memory test**: Ensure chunking doesn't cause memory issues with large files

## Acceptance Criteria

### Phase 1 (Emergency Fix)

- [ ] No summaries with >50% repetitive content
- [ ] Token usage reduced by >50% for failed cases
- [ ] Retry mechanism successfully generates valid summary
- [ ] Monitoring alerts on repetition issues

### Phase 3 (Chunked Processing)

- [ ] Audio files >30 minutes are automatically chunked
- [ ] Chunks overlap by 10 seconds to prevent sentence loss
- [ ] AI receives correct time context for each chunk
- [ ] Timestamps in transcription are relative to full session start
- [ ] Merged transcription has no duplicate content from overlaps
- [ ] Partial failure recovery (some chunks fail, others succeed)
- [ ] Documentation updated with chunking architecture

## Related Files

- `src/app/audio/audio-session.service.ts` - Main service handling AI calls
- `src/app/audio/audio-session.models.ts` - Type definitions
- `src/environments/environment.ts` - API configuration

## Notes

This is a critical production issue that affects core functionality. The cost impact alone (65k tokens wasted per failed request) makes this a high priority fix.

### Chunking Configuration Constants

| Constant                 | Value         | Rationale                                                                               |
| ------------------------ | ------------- | --------------------------------------------------------------------------------------- |
| `CHUNK_DURATION_SECONDS` | 1800 (30 min) | Balances context size vs. API limits. 30 min ≈ 75-100k audio tokens, well under limits. |
| `CHUNK_OVERLAP_SECONDS`  | 10            | Typical sentence is 3-8 seconds. 10s overlap ensures complete sentences at boundaries.  |

These values can be adjusted based on:

- Model token limits (if using different models)
- Audio quality (lower quality may need more overlap)
- Speech patterns (fast talkers may need longer overlap)

## References

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Best Practices for Preventing Repetition](https://platform.openai.com/docs/guides/text-generation/parameter-details)
