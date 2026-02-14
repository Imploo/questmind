# Ticket #47 - Integrate OpenAI Whisper for Audio Transcription

**Created:** 2026-02-14
**Priority:** High
**Status:** Todo
**Effort:** 2-3 days
**Dependencies:** -

---

## Description

Replace the current Gemini-based audio transcription in `functions/src/transcribe-audio-fast.ts` with OpenAI's Whisper/GPT-4o Transcribe API. The current implementation passes a Gemini Files API URI directly to `generateContent`. OpenAI's API requires a direct file upload (max 25 MB), so the new flow must download the audio from Firebase Storage before sending it to OpenAI.

---

## Expected Result

- `transcribeAudioFast` uses the OpenAI Whisper API to produce transcription segments with timestamps and optional speaker labels.
- Existing `TranscriptionSegment` shape (`timeSeconds`, `text`, `speaker?`) is preserved so no downstream changes are needed.
- Files larger than 25 MB are split into chunks, transcribed in sequence, and merged.
- The Gemini-specific `waitForGeminiFileToBecomeActive` polling logic is removed.
- An `OPENAI_API_KEY` secret is added to the Cloud Function.

---

## Technical Details

### Available OpenAI Transcription Models

| Model | Output formats | Speaker diarization | Notes |
|-------|---------------|---------------------|-------|
| `whisper-1` | json, text, srt, verbose_json, vtt | No | Stable, cheapest |
| `gpt-4o-mini-transcribe` | json, text | No | Good quality/cost balance |
| `gpt-4o-transcribe` | json, text | No | Highest accuracy |
| `gpt-4o-transcribe-diarize` | json, text, diarized_json | **Yes** | Requires `server_vad`, needs `diarized_json` response format for speaker labels |

**Recommendation:** Use `gpt-4o-transcribe-diarize` to retain speaker labelling that the current Gemini prompt produces. Fall back to `whisper-1` or `gpt-4o-mini-transcribe` if cost is a concern.

### API Details

- **Endpoint:** `POST https://api.openai.com/v1/audio/transcriptions`
- **Max file size:** 25 MB per request
- **Supported formats:** mp3, mp4, mpeg, mpga, m4a, wav, webm
- **SDK:** `openai` npm package (`openai.audio.transcriptions.create(...)`)

#### `verbose_json` response shape (whisper-1)

```json
{
  "task": "transcribe",
  "language": "dutch",
  "duration": 3600.0,
  "segments": [
    {
      "id": 0,
      "start": 0.0,
      "end": 4.5,
      "text": "Hallo, dit is een test.",
      "tokens": [...],
      "temperature": 0.0
    }
  ],
  "text": "..."
}
```

#### `diarized_json` response shape (gpt-4o-transcribe-diarize)

```json
{
  "segments": [
    {
      "start": 0.0,
      "end": 4.5,
      "text": "Hallo, dit is een test.",
      "speaker": "SPEAKER_00"
    }
  ]
}
```

Both map cleanly to the existing `TranscriptionSegment` interface:

```ts
interface TranscriptionSegment {
  timeSeconds: number; // <- segment.start
  text: string;        // <- segment.text
  speaker?: string;    // <- segment.speaker (diarized_json only)
}
```

### Current vs New Flow

#### Current flow

```
Frontend uploads audio to GCS via Gemini Files API
  → Gemini Files URI stored in Firestore
    → transcribeAudioFast reads URI
      → waitForGeminiFileToBecomeActive polls until ACTIVE
        → googleAi.models.generateContent({ fileData: { fileUri } })
          → parse JSON response from Gemini prompt
```

#### New flow

```
Frontend uploads audio to Firebase Storage (unchanged)
  → GCS path / download URL stored in Firestore
    → transcribeAudioFast downloads file buffer from Firebase Storage Admin SDK
      → if buffer > 25 MB: split into chunks
        → openai.audio.transcriptions.create({ file: buffer, model, response_format })
          → merge segment arrays, adjust timestamps for each chunk offset
            → map to TranscriptionSegment[]
```

### Key File Changes

| File | Change |
|------|--------|
| `functions/src/transcribe-audio-fast.ts` | Replace Gemini call + file polling with OpenAI SDK call; add GCS download step |
| `functions/src/audio/transcription-prompt.ts` | No longer needed for the transcription step (prompt was Gemini-specific); can be kept for story generation context |
| `functions/package.json` | Add `openai` dependency |
| `functions/src/types/audio-session.types.ts` | Verify `TranscriptionSegment` shape matches; no changes expected |

### Secret Configuration

Add `OPENAI_API_KEY` to:
- `onCall` secrets array in `transcribe-audio-fast.ts`
- Firebase project secrets (`firebase functions:secrets:set OPENAI_API_KEY`)
- `.env.local` for local emulator testing

### Chunking Strategy (files > 25 MB)

1. Use `ffmpeg` (available in Cloud Functions runtime) or a pure-JS audio splitter to split audio into ≤ 24 MB chunks (leave 1 MB margin).
2. Transcribe each chunk independently.
3. Offset `segment.start` / `segment.end` by the cumulative duration of previous chunks.
4. Concatenate segment arrays.

> **Note:** The `audioFileSize` field is already passed in `TranscribeAudioFastRequest` and stored in the session document, so we know upfront whether chunking is needed.

Alternative to ffmpeg: Use the `openai` SDK chunking helper if available, or read as a `ReadableStream` and let the Node.js `form-data` handle it with a `Blob`.

### Error Handling

- If the OpenAI API returns a 413 (file too large), retry with chunking.
- If a chunk fails, mark the session as `failed` (same as today).
- Remove `waitForGeminiFileToBecomeActive` entirely — not applicable.

---

## Implementation Steps

1. **Install dependency**
   ```bash
   cd functions && npm install openai
   ```

2. **Add secret**
   ```bash
   firebase functions:secrets:set OPENAI_API_KEY
   ```

3. **Update `transcribe-audio-fast.ts`**
   - Remove `GoogleGenAI` import and Gemini-specific logic.
   - Remove `waitForGeminiFileToBecomeActive`.
   - Add helper `downloadAudioFromStorage(fileUri: string): Promise<Buffer>` using `@google-cloud/storage` or Firebase Admin Storage.
   - Add helper `transcribeWithOpenAI(buffer: Buffer, fileName: string, apiKey: string): Promise<TranscriptionSegment[]>`.
   - Implement chunking if `buffer.byteLength > 24 * 1024 * 1024`.
   - Add `OPENAI_API_KEY` to `secrets` array.

4. **Update `AISettings` / `AIFeatureConfig`** (if model selection should work for OpenAI models too)
   - Consider adding an `openaiModel` field or reusing `model` with OpenAI model IDs.

5. **Remove Gemini-specific code**
   - `resolveMimeType` can stay (same formats).
   - `buildTranscriptionPrompt` is no longer called (Whisper handles transcription natively without a text prompt).
   - `parseTranscriptionPayload` is replaced by the typed SDK response.

6. **Test locally** with Firebase emulator + a real audio file ≤ 25 MB.

7. **Run builds**
   ```bash
   npm run build && npm run build:backend && npm run lint
   ```

---

## Acceptance Criteria

- [ ] `transcribeAudioFast` successfully transcribes an audio file using OpenAI Whisper.
- [ ] `TranscriptionSegment[]` is correctly populated with `timeSeconds`, `text`, and `speaker` (where available).
- [ ] Files > 25 MB are chunked and merged without duplicate or missing segments.
- [ ] No Gemini Files API code remains in `transcribe-audio-fast.ts`.
- [ ] `OPENAI_API_KEY` is managed as a Firebase secret (not hardcoded).
- [ ] All builds and lint checks pass.

---

## References

- [OpenAI Speech to Text guide](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenAI Audio API reference – createTranscription](https://platform.openai.com/docs/api-reference/audio/createTranscription)
- [Introducing gpt-4o-transcribe-diarize](https://community.openai.com/t/introducing-gpt-4o-transcribe-diarize-now-available-in-the-audio-api/1362933)
