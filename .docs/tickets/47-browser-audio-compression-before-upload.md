# Ticket #47: Browser Audio Compression Before Upload

**Created:** 2026-02-14
**Priority:** High
**Status:** Todo
**Effort:** 3-5 days
**Dependencies:** #46 (Background Fetch API for Uploads)

---

## Description

Audio recordings from tabletop RPG sessions can reach 300 MB or more (raw WAV/AIFF or high-bitrate MP3). These large files are expensive to upload, slow to process, and consume significantly more Gemini tokens than necessary for transcription. Since Gemini only needs clear speech audio — not studio-quality audio — we can compress the audio aggressively in the browser before uploading without any meaningful loss in transcription accuracy.

The goal is to reduce a typical 300 MB session recording to approximately 50 MB using the Web Audio API (AudioContext + OfflineAudioContext) and a browser-native encoding approach, targeting mono MP3 or Opus at low bitrate.

---

## Expected Result

- Audio files are compressed in the browser **before** they are uploaded to GCS.
- Target output size: ~50 MB for a typical 3-hour session (roughly 6× compression).
- Target encoding: **Mono, 32–64 kbps, MP3 or Opus (WebM)**.
- Users see a compression progress indicator during the compression phase.
- Compression is transparent — user uploads a file and sees "Compressing… X%" before upload begins.
- The original file is never sent to the backend; only the compressed version is uploaded.
- Gemini token usage is reduced proportionally (~6× fewer audio tokens per session).
- Transcription quality remains acceptable for speech (D&D/TTRPG table audio).

---

## Technical Details

### Why browser-side compression?

- No server cost for a dedicated transcoding step.
- Reduces upload time, especially on mobile connections.
- Reduces GCS storage costs.
- Reduces Gemini token consumption (audio tokens are billed per second of audio, and Gemini Flash pricing is ~$0.000125/token for audio; fewer tokens = lower cost).
- Aligns with the fire-and-forget upload pattern from #46.

### Compression Strategy

#### Option A: Web Audio API + MediaRecorder (preferred)

1. Decode the source audio file using `AudioContext.decodeAudioData()`.
2. Re-render it through an `OfflineAudioContext` at 16 000 Hz mono.
3. Feed the decoded `AudioBuffer` into a `MediaRecorder` with `audio/webm;codecs=opus` at a low bitrate (e.g. `audioBitsPerSecond: 32000`).
4. Collect `Blob` chunks and assemble the final compressed file.

**Pros:** Fully browser-native, no WASM dependency, broad modern browser support.
**Cons:** Bitrate control via `MediaRecorder` is approximate; final size may vary.

#### Option B: lamejs (MP3 encoder in JS/WASM)

1. Decode source audio via `AudioContext.decodeAudioData()`.
2. Encode raw PCM to MP3 at 32–64 kbps using `lamejs` (pure JS port of LAME).
3. Produce a `.mp3` Blob.

**Pros:** Produces true MP3, deterministic file size, Gemini supports MP3 natively.
**Cons:** WASM/JS bundle overhead (~200 KB), slower encode for very long files.

#### Option C: ffmpeg.wasm

1. Use `@ffmpeg/ffmpeg` to transcode in the browser with full ffmpeg capabilities.
2. Output: `-ac 1 -b:a 32k -ar 22050` (mono, 32 kbps, 22 kHz).

**Pros:** Most flexible, exact same flags as server-side ffmpeg.
**Cons:** Large WASM bundle (~30 MB), requires `SharedArrayBuffer` / COOP/COEP headers, complex setup.

### Recommendation

**Start with Option A (Web Audio API + MediaRecorder + Opus)**:
- Zero additional dependencies.
- Opus at 32 kbps mono is excellent for speech.
- Widely supported in Chrome, Edge, Firefox (Safari supports Opus in WebM since Safari 15).
- Can fallback to Option B (lamejs) for MP3 if Gemini has issues with WebM/Opus.

### Target Codec Settings

| Setting | Value |
|---------|-------|
| Codec | Opus (WebM container) or MP3 |
| Channels | Mono (1) |
| Bitrate | 32–64 kbps |
| Sample rate | 16 000 Hz |
| Expected size (3h session) | ~45–90 MB |

### Gemini Audio Token Calculation

A 3-hour session at 32 kbps mono ≈ 43 MB. Gemini Flash bills audio at 1 token per second:
- 3 hours = 10 800 seconds = 10 800 audio tokens
- This is the same regardless of file size (Gemini counts by duration, not bytes)
- **Compression reduces upload time and cost, not token count per se**
- However: raw WAV files at 300 MB often include long silences, multiple channels, and lossless data — compressing to mono removes a channel halving data, and silence removal is optional

> **Note:** Gemini charges audio by duration, not file size. The primary wins from compression are:
> 1. Faster uploads
> 2. Reduced GCS storage
> 3. Potentially shorter effective audio if silence is removed

### Silence Trimming (Optional Enhancement)

As part of compression, long silences (>2 seconds) could be trimmed using `OfflineAudioContext` RMS analysis. This would reduce transcription duration and therefore token cost. This is a stretch goal for this ticket.

---

## Implementation Plan

### 1. Create `AudioCompressionService`

**File:** `src/app/audio/services/audio-compression.service.ts`

```typescript
// Responsibilities:
// - Accept a File (audio)
// - Return a compressed Blob with progress callbacks
// - Use Web Audio API + MediaRecorder (Opus/WebM)
// - Expose compression progress as a Signal<number>
```

**Interface:**
```typescript
interface CompressionOptions {
  targetBitrate: number;      // bps, default 32_000
  targetSampleRate: number;   // Hz, fixed at 16_000
  channels: 1 | 2;           // default 1 (mono)
}

interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  durationSeconds: number;
  mimeType: string;
}
```

### 2. Integrate into Upload Flow

**File:** `src/app/audio/services/audio-upload.service.ts` (or equivalent)

Before calling the upload method:
1. Call `AudioCompressionService.compress(file, options)`.
2. Show compression progress in the UI.
3. Pass the resulting compressed `Blob` to the existing upload pipeline (Background Fetch or `uploadBytesResumable`).

### 3. UI: Compression Progress Indicator

**File:** `src/app/audio/components/audio-upload/` (existing upload component)

Add a new phase before "Uploading":
- Phase 1: "Compressing audio… X%"
- Phase 2: "Uploading… X%"

Update the `SessionProgress` object to include a `compression` phase entry:
```typescript
compression?: {
  status: 'idle' | 'in-progress' | 'done' | 'error';
  progress: number; // 0–100
  originalSizeMb?: number;
  compressedSizeMb?: number;
}
```

### 4. Fallback Handling

- If `AudioContext.decodeAudioData()` fails (corrupt file), surface an error to the user.
- If `MediaRecorder` Opus is not supported (unlikely), fall back to `audio/webm` without codec specification, or skip compression and upload the original file with a warning.
- If compressed file is larger than original (unlikely but possible for already-compressed MP3s), skip compression and upload original.

### 5. Testing

- Test with common input formats: `.mp3`, `.m4a`, `.wav`, `.ogg`, `.webm`
- Verify file size reduction for a 300 MB WAV → target ~50 MB
- Verify transcription quality via Gemini does not degrade significantly
- Test on mobile (iOS Safari, Android Chrome)

---

## Files to Create / Modify / Delete

| File | Action | Notes |
|------|--------|-------|
| `src/app/audio/services/audio-compression.service.ts` | Create | Core compression logic |
| `src/app/audio/components/audio-upload/*.ts` | Modify | Add compression phase to UI |
| `src/app/audio/models/session-progress.model.ts` | Modify | Add `compression` phase |
| `src/app/audio/services/audio-upload.service.ts` | Modify | Call compression before upload |
| `functions/src/upload-audio-to-gemini.ts` | **Delete** | Replaced by `initiateGeminiUpload` + direct browser upload |
| `functions/src/index.ts` | Modify | Remove `uploadAudioToGemini` export |

### Remove `uploadAudioToGemini` Cloud Function

The `uploadAudioToGemini` Cloud Function (`functions/src/upload-audio-to-gemini.ts`) proxies the entire audio file through the backend before forwarding it to the Gemini Files API. This is wasteful:

- The file travels browser → Cloud Function → Gemini (double the bandwidth)
- Consumes Cloud Function memory (1 GiB allocated) and CPU for the full duration of the upload
- Adds latency compared to a direct upload

The correct flow — already implemented via `initiateGeminiUpload` — is:

```
Browser → initiateGeminiUpload (backend, ~100ms)  →  pre-auth uploadUrl returned
Browser → PUT compressed blob → Gemini Files API  (direct, no backend relay)
Browser → transcribeAudioFast (backend, fileUri only)
```

After this ticket, `uploadAudioToGemini` should be removed. Verify no frontend code still calls it before deleting.

---

## Acceptance Criteria

- [ ] A 300 MB WAV file is compressed to ≤ 60 MB before upload
- [ ] Compression progress is shown to the user (0–100%)
- [ ] After compression, the existing upload flow proceeds with the compressed Blob
- [ ] Transcription quality for speech is not meaningfully degraded
- [ ] Works on desktop Chrome, Firefox, Edge, and mobile Chrome (iOS fallback acceptable)
- [ ] If compression fails, the original file is uploaded with a console warning
- [ ] Compressed file size is logged to Firestore session document for debugging

---

## Out of Scope

- Server-side transcoding (handled by backend if needed in the future)
- Silence removal (optional stretch goal, separate ticket)
- Support for video files
- Lossless compression (FLAC) — lossy is sufficient for transcription

---

## References

- [Web Audio API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [OfflineAudioContext - MDN](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext)
- [Gemini Audio pricing](https://ai.google.dev/pricing)
- Ticket #46: Background Fetch API for Uploads
- Ticket #43: Consolidated Session Progress Tracking
