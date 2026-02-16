# Ticket #51: Migrate Transcription to Azure Speech Service with Diarization

**Created:** 2026-02-16
**Priority:** High
**Status:** Todo
**Effort:** 3-5 days
**Dependencies:** None

---

## Description

Replace the current Gemini Vertex AI-based audio transcription in `transcribe-audio-fast.ts` with Azure Speech Service **batch transcription**. Goal: consolidate vendors under Azure and improve transcription quality (Gemini spraakherkenning viel tegen).

This includes:

1. Setting up Azure Blob Storage for audio file staging (batch API vereist een URL)
2. Uploading compressed audio to Azure Blob Storage (replacing Gemini Files API upload)
3. Using Azure Speech Service batch transcription API with diarization
4. Polling for results and mapping to existing `TranscriptionSegment` format
5. Removing all Gemini-based transcription code

**Locale:** `nl-NL` (Nederlands)

### Why Batch API (not Fast Transcription)?

Azure biedt twee transcriptie APIs:

| | Fast Transcription | Batch Transcription |
|---|---|---|
| **Max duur** | 2 uur (hard limit) | 4 uur met diarization |
| **Response** | Synchroon, direct resultaat | Async, polling vereist |
| **Blob Storage** | Niet nodig (inline upload) | Vereist (URL naar audio) |
| **Phrase list** | Ja | Nee |
| **Diarization** | Ja | Ja |

**D&D sessies zijn altijd >2 uur**, dus Fast Transcription API valt af. Batch API ondersteunt tot 4 uur met diarization.

### Kanka Context / Custom Vocabulary

Batch API ondersteunt **geen phrase list** (alleen Fast Transcription en Real-time doen dat). Kanka entity namen (karakters, locaties, etc.) kunnen dus niet als hint meegegeven worden aan de transcriptie. Dit is acceptabel omdat:
- De story generation LLM krijgt Kanka context al mee
- Die LLM kan verkeerd herkende namen corrigeren op basis van context
- Basis spraakherkenning van Azure is beter dan Gemini, wat het netto resultaat verbetert

---

## Expected Result

- Audio uploads go to Azure Blob Storage instead of Gemini Files API
- Transcription uses Azure Speech Service batch API with speaker diarization (1-5 speakers)
- Word-level timestamps are available
- Output maps to existing `TranscriptionSegment[]` format
- Story generation worker still triggers after transcription completes
- Progress tracking still works identically (polling updates progress in Firestore)
- Gemini transcription code is fully removed
- Sessions >4 uur geven een duidelijke foutmelding (auto-split is fase 2)

---

## Technical Details

### Current Architecture

```
Browser (compress MP3 ~25 MB)
  → uploadAudioToGemini Cloud Function
    → Gemini Files API (resumable upload)
      → returns fileUri

transcribeAudioFast Cloud Function
  → Gemini Vertex AI generateContent() with fileUri + prompt + Kanka context
  → Parse JSON response → TranscriptionSegment[]
  → Firestore update → story-generation-worker
```

### Target Architecture

```
Browser (compress MP3 ~25 MB)
  → uploadAudio Cloud Function (NEW - replaces uploadAudioToGemini)
    → Azure Blob Storage (upload blob)
    → Generate SAS URL
    → Return blobUrl to frontend

transcribeAudioFast Cloud Function (MODIFIED)
  → Create Azure Speech batch transcription job (with SAS URL)
  → Poll for completion (every 10s, update Firestore progress)
  → Fetch results → map to TranscriptionSegment[]
  → Firestore update → story-generation-worker (unchanged)
  → Cleanup: delete blob from Azure Storage
```

---

### Phase 1: Azure Blob Storage Setup

**New Azure Resources needed:**
- Azure Storage Account (e.g. `questmindaudio`)
- Container: `audio-uploads` (private, no public access)
- SAS token generation for temporary access by Azure Speech Service

**New Secrets (Firebase Functions):**
```bash
AZURE_SPEECH_KEY                # Azure Speech Service subscription key
AZURE_SPEECH_REGION             # e.g. "westeurope"
AZURE_STORAGE_CONNECTION_STRING # Azure Blob Storage connection string
```

**New npm packages:**
```bash
npm install @azure/storage-blob
# Speech API via direct fetch() - geen SDK nodig voor batch REST API
```

---

### Phase 2: Replace Audio Upload

**Modify/Replace:** `functions/src/upload-audio-to-gemini.ts`

Rename to `upload-audio.ts` or create new `upload-audio-to-azure.ts`:

```typescript
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';

export const uploadAudio = onRequest({ ... }, async (req, res) => {
  // 1. Verify Firebase auth token (same as current)
  // 2. Upload blob to Azure Blob Storage container
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );
  const containerClient = blobServiceClient.getContainerClient('audio-uploads');
  const blobName = `${campaignId}/${sessionId}/${audioFileName}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(audioBuffer, audioBuffer.length, {
    blobHTTPHeaders: { blobContentType: mimeType },
  });

  // 3. Generate SAS URL for Azure Speech Service access (TTL: 6 hours)
  const sasUrl = generateSasUrl(blockBlobClient, 6 * 60); // 6 hour expiry

  // 4. Return blobUrl to frontend (stored in session doc for transcription)
  res.json({ blobUrl: sasUrl, blobName });
});
```

**Modify frontend:** `src/app/audio/services/audio-complete-processing.service.ts`
- Change upload endpoint from `/api/uploadAudioToGemini` to `/api/uploadAudio`
- Return value changes from `fileUri` (Gemini) to `blobUrl` (Azure Blob)

---

### Phase 3: Azure Speech Batch Transcription

**Create:** `functions/src/services/azure-speech.service.ts`

Azure Speech batch transcription uses a REST API:

1. **Create transcription job:**
```typescript
POST https://{region}.api.cognitive.microsoft.com/speechtotext/v3.2/transcriptions

Headers:
  Ocp-Apim-Subscription-Key: {AZURE_SPEECH_KEY}
  Content-Type: application/json

Body:
{
  "contentUrls": ["https://questmindaudio.blob.core.windows.net/audio-uploads/...?sv=...&sig=..."],
  "properties": {
    "diarizationEnabled": true,
    "diarization": {
      "speakers": {
        "minCount": 1,
        "maxCount": 5
      }
    },
    "wordLevelTimestampsEnabled": true,
    "punctuationMode": "DictatedAndAutomatic",
    "profanityFilterMode": "None"
  },
  "locale": "nl-NL",
  "displayName": "Session {sessionId}"
}
```

2. **Poll for completion:**
```typescript
GET https://{region}.api.cognitive.microsoft.com/speechtotext/v3.2/transcriptions/{transcriptionId}

// Poll every 10 seconds until status === "Succeeded" or "Failed"
// Update Firestore progress during polling
// Typical queue wait: seconds to 30 min (at peak)
// Typical processing: faster than real-time
```

3. **Fetch results:**
```typescript
GET https://{region}.api.cognitive.microsoft.com/speechtotext/v3.2/transcriptions/{transcriptionId}/files

// Returns list of result files, download the one with kind === "Transcription"
// The result JSON contains recognized phrases with speaker labels and timestamps
```

**Azure Speech batch response format (simplified):**
```json
{
  "combinedRecognizedPhrases": [
    {
      "channel": 0,
      "display": "Full text here..."
    }
  ],
  "recognizedPhrases": [
    {
      "recognitionStatus": "Success",
      "channel": 0,
      "speaker": 1,
      "offset": "PT0.64S",
      "duration": "PT2.12S",
      "offsetInTicks": 6400000,
      "durationInTicks": 21200000,
      "nBest": [
        {
          "confidence": 0.92,
          "lexical": "hallo iedereen",
          "itn": "Hallo iedereen",
          "maskedITN": "Hallo iedereen",
          "display": "Hallo iedereen.",
          "words": [
            { "word": "hallo", "offset": "PT0.64S", "duration": "PT0.32S", "confidence": 0.95 },
            { "word": "iedereen", "offset": "PT1.04S", "duration": "PT1.72S", "confidence": 0.89 }
          ]
        }
      ]
    }
  ]
}
```

**Mapping to TranscriptionSegment:**
```typescript
interface TranscriptionSegment {
  timeSeconds: number;    // ← parsed from Azure "offset" ISO 8601 duration ("PT0.64S" → 0.64)
  text: string;           // ← Azure "display" from nBest[0]
  speaker?: string;       // ← Azure "speaker" (number → "Speaker 1", "Speaker 2", etc.)
}

function mapAzureToSegments(azureResult: AzureBatchResult): TranscriptionSegment[] {
  return azureResult.recognizedPhrases.map(phrase => ({
    timeSeconds: parseIso8601Duration(phrase.offset),
    text: phrase.nBest[0].display,
    speaker: phrase.speaker != null ? `Speaker ${phrase.speaker}` : undefined,
  }));
}
```

---

### Phase 4: Modify `transcribe-audio-fast.ts`

**Key changes:**

1. Remove `GoogleGenAI` import and all Gemini-related code
2. Remove `buildTranscriptionPrompt` usage (Azure doesn't use text prompts)
3. Remove `parseTranscriptionPayload` (Azure returns structured data, not LLM JSON)
4. Remove `resolveModel` and `resolveMimeType` helpers
5. Replace with Azure Speech Service batch call + polling
6. Keep `fetchKankaContextForTranscription` — still passed to story generation worker

```typescript
async function processTranscriptionAsync(
  campaignId: string,
  sessionId: string,
  blobUrl: string,           // Changed: was gsUri (now Azure Blob SAS URL)
  blobName: string,          // New: for cleanup after transcription
  audioFileName: string,
  enableKankaContext: boolean,
  userCorrections?: string
): Promise<void> {
  // 1. Get Azure credentials from environment
  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION;

  // 2. Create Azure batch transcription job
  const transcriptionId = await azureSpeechService.createTranscription({
    contentUrl: blobUrl,
    locale: 'nl-NL',
    displayName: `Session ${sessionId}`,
    diarization: { minSpeakers: 1, maxSpeakers: 5 },
  });

  // 3. Poll for completion (update progress during polling)
  const result = await azureSpeechService.waitForCompletion(
    transcriptionId,
    async (status) => {
      await ProgressTrackerService.updateProgress(
        campaignId, sessionId, 'transcribing',
        50, // Progress stays at 50% during polling (no granular %)
        `Wachten op transcriptie (${status})...`
      );
    }
  );

  // 4. Map Azure result to TranscriptionSegment[]
  const segments = mapAzureToSegments(result);

  // 5. Format and save (same as current code)
  const timestamps = segments.map(segment => ({
    time: Math.max(0, Math.round(segment.timeSeconds)),
    text: segment.speaker ? `${segment.speaker}: ${segment.text}` : segment.text,
  }));

  const transcriptionText = timestamps
    .map(entry => `[${formatTimestamp(entry.time)}] ${entry.text}`)
    .join('\n\n');

  // 6. Update Firestore (same structure as current)
  // 7. Trigger story generation worker (unchanged — still gets Kanka context)
  // 8. Cleanup: delete Azure blob
  await azureBlobService.deleteBlob(blobName);
}
```

**Secrets declaration update:**
```typescript
export const transcribeAudioFast = onCall(
  {
    secrets: [
      'KANKA_API_TOKEN',
      'AZURE_SPEECH_KEY',
      'AZURE_SPEECH_REGION',
      'AZURE_STORAGE_CONNECTION_STRING',
    ],
  },
  // ...
);
```

---

### Phase 5: Cleanup

**Remove files:**
- `functions/src/upload-audio-to-gemini.ts` (replaced by Azure upload)
- `functions/src/audio/transcription-prompt.ts` (no longer needed — Azure doesn't use text prompts; check if story generation uses it first)

**Remove from `transcribe-audio-fast.ts`:**
- `GoogleGenAI` import and Vertex AI initialization
- `buildTranscriptionPrompt` import
- `parseTranscriptionPayload` function
- `resolveModel` function
- `resolveMimeType` function
- AI settings model resolution logic (no model selection needed for Azure Speech)

**Check for other Gemini Files API references:**
- `functions/src/index.ts` - Remove `uploadAudioToGemini` export, add `uploadAudio`
- Frontend upload service - Update endpoint URL

**Remove npm packages (if no longer used elsewhere):**
- Check if `@google/genai` is still used by other functions (e.g. story generation) before removing

---

### Phase 6: Azure Blob Cleanup

After successful transcription, delete the audio blob from Azure Blob Storage to avoid storage costs:

```typescript
async function cleanupAzureBlob(blobName: string): Promise<void> {
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );
  const containerClient = blobServiceClient.getContainerClient('audio-uploads');
  const blobClient = containerClient.getBlobClient(blobName);
  await blobClient.deleteIfExists();
  logger.debug(`[Azure Blob] Cleaned up: ${blobName}`);
}
```

Call this at the end of `processTranscriptionAsync` after Firestore update + story generation trigger succeeds. Bij failure: blob laten staan (retry kan hem hergebruiken).

---

### Future: Auto-split voor sessies >4 uur (Fase 2)

**Niet in scope voor dit ticket.** Voorlopig: duidelijke foutmelding als audio >4 uur is.

Wanneer nodig:
- Detecteer audio duur (via `ffprobe` of metadata)
- Split in chunks van ~3.5 uur met `ffmpeg` (bij stilte-momenten)
- Run batch transcription per chunk
- Stitch resultaten: timestamps offsetten, speaker IDs per chunk labelen ("Chunk1-Speaker1", etc.)
- Story generation LLM kan op basis van context speakers across chunks matchen

**Let op:** diarization speaker IDs zijn niet consistent across chunks. Dit is acceptabel omdat de story generation LLM Kanka context heeft om sprekers te herkennen.

---

## Environment Setup (Manual Steps)

### Azure Resources

1. **Create Azure Speech Service resource:**
   - Azure Portal → Create Resource → Speech
   - Region: `westeurope`
   - Pricing: **S0 (Standard)** - batch transcription vereist Standard tier
   - Note: Free tier (F0) ondersteunt GEEN batch transcription

2. **Create Azure Storage Account:**
   - Azure Portal → Create Resource → Storage Account
   - Name: e.g. `questmindaudio`
   - Region: **same as Speech Service** (`westeurope`) — voorkomt cross-region kosten
   - Performance: Standard
   - Redundancy: LRS (locally redundant, goedkoopste optie)

3. **Create Blob Container:**
   - In Storage Account → Containers → New
   - Name: `audio-uploads`
   - Access level: **Private** (access via SAS tokens)

4. **Get credentials:**
   - Speech Service → Keys and Endpoint → Key 1
   - Storage Account → Access Keys → Connection String

### Firebase Secrets

```bash
firebase functions:secrets:set AZURE_SPEECH_KEY
firebase functions:secrets:set AZURE_SPEECH_REGION        # e.g. "westeurope"
firebase functions:secrets:set AZURE_STORAGE_CONNECTION_STRING
```

---

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| Create | `functions/src/services/azure-speech.service.ts` | Azure Speech batch transcription REST client (create job, poll, fetch results) |
| Create | `functions/src/services/azure-blob-storage.service.ts` | Azure Blob Storage upload/delete/SAS URL generation |
| Create | `functions/src/upload-audio.ts` | New upload function (replaces `upload-audio-to-gemini.ts`) |
| Modify | `functions/src/transcribe-audio-fast.ts` | Replace Gemini with Azure Speech batch API |
| Modify | `functions/src/index.ts` | Export new upload function, remove old one |
| Modify | `functions/package.json` | Add `@azure/storage-blob` dependency |
| Modify | `src/app/audio/services/audio-complete-processing.service.ts` | Update upload endpoint URL and response handling |
| Delete | `functions/src/upload-audio-to-gemini.ts` | Replaced by Azure upload |
| Check  | `functions/src/audio/transcription-prompt.ts` | Remove if only used by transcription (not story generation) |

---

## Risks & Considerations

1. **Batch transcription queue wachttijd:** Onvoorspelbaar — seconden tot 30 minuten op piekmomenten. Acceptabel omdat de huidige flow al fire-and-forget is en de gebruiker niet synchroon wacht.

2. **Azure Speech Standard tier vereist:** Batch transcription is NIET beschikbaar op de free tier. Geschatte kosten: ~$1/uur audio.

3. **SAS token expiry:** Genereer SAS tokens met ruime TTL (6 uur) om upload + queue wachttijd + transcriptie te dekken.

4. **Diarization speaker IDs:** Azure kent numerieke IDs toe (Speaker 0, 1, 2...), geen namen. Story generation LLM handelt naamgeving af via Kanka context.

5. **Geen phrase list in batch API:** Anders dan Fast Transcription ondersteunt batch API geen custom vocabulary hints. Kanka entity namen worden pas gebruikt bij story generation. Dit is acceptabel.

6. **Profanity filter:** Op `None` zetten. D&D sessies bevatten fantasy geweld en termen die niet gefilterd moeten worden.

7. **Audio format:** Azure Speech ondersteunt MP3, WAV, OGG, FLAC, WMA. Browser compressie levert MP3 op — volledig compatible.

8. **Max audio duur:** 240 minuten (4 uur) met diarization. Sessies >4 uur geven voorlopig een foutmelding. Auto-split is fase 2.

9. **Region consistentie:** Speech Service en Storage Account moeten in dezelfde region staan (`westeurope`) om latency en cross-region transfer kosten te minimaliseren.

10. **Cloud Function timeout:** Polling voor batch transcription kan lang duren (tot ~30 min queue + verwerkingstijd). Controleer of de Cloud Function timeout voldoende is (default: 60s voor onCall). Mogelijk moet `timeoutSeconds` verhoogd worden naar 540s (max voor gen2) of moet polling via een aparte worker/scheduled function.
