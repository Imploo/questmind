# Ticket #67: Audio opsplitsen in segmenten voor transcriptie (trouwer + minder detailverlies in de tweede helft)

**Created:** 2026-06-11
**Priority:** High
**Status:** Done
**Effort:** 3-5 dagen
**Dependencies:** Bouwt voort op #53 (multi-file concatenatie) en #54 (raw story pipeline)

---

## Implementatie-status (afgerond — 2026-06-25)

**Geïmplementeerd** (segmentlengte **30 min** i.p.v. de oorspronkelijk geplande 18 min, op verzoek — minder secties en meer narratieve context per segment):
- Frontend `compressToSegments()` / `compressFilesToSegments()` (`audio-compression.service.ts`): decodeert + resamplet één keer en knipt in segmenten van 30 min met 15 s overlap; opnames ≤ 35 min blijven één segment (geen gedragswijziging).
- Frontend `uploadSegmentsAndTranscribe()` (`audio-complete-processing.service.ts`): uploadt elk segment apart → één fileUri per segment → roept `transcribeAudioFast` aan met `fileUris[]`.
- Backend `transcribeAudioFast`: accepteert `fileUris[]` (backward-compatible met `fileUri`), transcribeert segmenten **parallel** (bounded; volgorde behouden op positie via `mapWithConcurrency`), volledige prompt bij 1 segment, segment-prompt bij >1, met retry + gap-marker per segment, samengevoegd tot één `rawStory`. `timeoutSeconds: 1200` / `memory: 1GiB`.
- Backend segment-prompt (`buildSegmentRawStoryPrompt`): alle trouw-regels behouden, de "dek de HELE sessie / verdeel je budget"-framing weggehaald.

**Vervolgpunten afgerond (2026-06-25):**
- **Multi-file** (samengevoegde opnames): `compressFilesToSegments()` decodeert + resamplet elk bestand naar mono-PCM, concateneert tot één doorlopende avond en segmenteert dáárna (inverse van #53). De upload-page routeert single én multi-file via één pad (`startCompleteProcessing(File[])`); de oude concatenate-en-één-fileUri flow (`uploadAndTranscribe` + `processMultipleFiles`) is verwijderd.
- **Retranscribe/retry**: hergebruikt nu de opgeslagen segment-fileUris uit `transcriptionFast.segments` (met fallback naar de legacy enkele `fileUri`); roept `transcribeAudioFast` aan met `fileUris[]` i.p.v. de onbruikbare `storageUrl`. Toont een duidelijke melding wanneer de fileUris niet meer beschikbaar zijn (Gemini Files verlopen na 48u → her-upload nodig).
- **Configureerbaar via `settings/ai`**: nieuw blok `transcriptionSegmentation` (`enabled`, `segmentMinutes`, `overlapSeconds`, `minSplitMinutes`, `concurrency`, `maxAttempts`, `onSegmentFailure`). Defaults in zowel backend `ai-settings.ts` als frontend `ai-settings.service.ts`; override zonder deploy. Backend leest concurrency/maxAttempts/failure-policy hieruit; frontend leest segmentlengte/overlap/split-drempel + `enabled`.
- **Cosmetische upload-voortgang**: de 60–70% Firestore-write is verplaatst van per-chunk in `uploadChunk` naar één throttled write op orkestratie-niveau, berekend over álle segmenten — geen herhaalde 60→70 reset per segment meer.

---

## Beschrijving

De transcriptie verwerkt een volledige sessie-opname (vaak 2,5-4 uur) in **één Gemini-call**. Daardoor verslechtert de kwaliteit naar het einde van de avond: de eerste helft krijgt veel detail, maar in de **tweede helft gaan details verloren** — het model gaat samenvatten en, erger nog, gaten opvullen met plausibele maar niet-gezegde inhoud.

De oplossing: knip de opname **client-side** in kortere tijdsegmenten (~15-20 min), transcribeer elk segment **apart** met een eigen volledig output-budget en volle aandacht, en plak de deeltranscripties daarna in volgorde aan elkaar tot de uiteindelijke `rawStory`.

> **Kerninzicht.** Het probleem is geen output-budgetlimiet (65k tokens ≈ 200k tekens is ruim), maar **aandacht over lange context**: over een opname van 3 uur kan het model de latere delen niet meer even nauwkeurig vasthouden. Over een fragment van 18 minuten kan dat wél — daardoor verdwijnt zowel het **detailverlies** als (samen met de al doorgevoerde trouw-eerst prompt) het **verzinnen**. Elk segment krijgt bovendien zijn eigen 65k-budget, dus de totale hoeveelheid getrouw detail vermenigvuldigt zich, zonder dat input-audiokosten meegroeien (audio wordt per seconde duur gerekend, niet per byte — elk segment bevat alleen zijn eigen audio).

Dit is de structurele vervolgstap op de al doorgevoerde verbeteringen (trouw-eerst transcriptieprompt + hogere audiokwaliteit 64 kbps / 24 kHz).

---

## Probleemanalyse

| Symptoom | Oorzaak | Wat dit ticket eraan doet |
|---|---|---|
| Tweede helft van de avond mist detail | Eén pass over 3+ uur → model "verslapt" naar het einde | Korte segmenten → constante aandacht over de hele avond |
| Verzonnen details die niet gezegd zijn | Lange context + lengte-druk → model vult gaten op | Korte fragmenten = beter horen; minder gaten om op te vullen |
| Transcript "te beperkt" terwijl er meer in de audio zit | Eén 65k-budget moet 3 uur dekken → samenvatten | N segmenten × 65k budget → veel meer ruimte voor echt detail |

---

## Architectuurkeuze: client-side splitsen

De originele audio wordt **niet** in Firebase Storage bewaard — de browser comprimeert 'm en uploadt direct naar de Gemini Files API. Bestanden in de Gemini Files API kun je **niet terug-downloaden**. De backend heeft dus enkel een `fileUri`, geen audiobytes. Daarom moet het splitsen gebeuren op de plek waar de audiobytes wél zijn: **de browser**, die de opname tijdens compressie toch al volledig naar een `AudioBuffer` decodeert.

### Overwogen alternatieven

| Optie | Omschrijving | Oordeel |
|---|---|---|
| **A. Client-side splitsen** | Browser snijdt de gedecodeerde PCM in N segmenten → N MP3-blobs → N uploads → N `fileUri`s → backend transcribeert elk apart | ✅ **Aanbevolen.** Hoogste fidelity, goedkoopste input-tokens, sluit aan op bestaande compressie-/upload-code |
| B. Timestamp-windowing op één `fileUri` | Dezelfde `fileUri` N× aanroepen met "transcribeer alleen MM:SS–MM:SS" | ❌ Betaalt vol audio-inputtokens × N (duur), en de gedocumenteerde **timestamp-drift bug** in Gemini 3.x maakt segmentgrenzen onbetrouwbaar |
| C. Audio in Storage + backend ffmpeg-split | Audio persisteren in Storage, backend haalt op + splitst met `@ffmpeg-installer/ffmpeg` (al aanwezig) | ⚠️ Werkt, maar voegt Storage-kosten + een extra upload/fetch toe; de browser heeft de gedecodeerde audio al, dus A is eenvoudiger |

---

## Huidige implementatie (vóór dit ticket)

```
[opname] --browser compress--> 1 MP3 blob --chunked upload--> Gemini Files API --> 1 fileUri
   --> transcribeAudioFast(fileUri) --> 1 Gemini-call (RAW_STORY_TRANSCRIPTION_PROMPT) --> rawStory
   --> storyGenerationWorker --> content (gepolijst verhaal)
```

- **Frontend:** `audio-compression.service.ts` (decode → resample 24 kHz mono → lamejs MP3), `audio-complete-processing.service.ts` (compress → `uploadToGemini` → `transcribeAudioFast`).
- **Backend:** `transcribe-audio-fast.ts` — `TranscribeAudioFastRequest` heeft één `fileUri: string`; `processTranscriptionAsync` doet één Gemini-call en schrijft `rawStory`.
- **Prompt:** `raw-story-transcription.prompt.ts` via `buildRawStoryPrompt(kankaContext)` (`audio/transcription-prompt.ts`).
- **Multi-file (#53):** meerdere bestanden worden client-side geconcateneerd tot één blob vóór upload — dit ticket is daarvan de **inverse** en moet ermee samenwerken (eerst concateneren tot de hele avond, dán in segmenten knippen).

---

## Ontwerp / Technische details

### Stap 1 — Frontend: segment-splitsing in `AudioCompressionService`

Nieuwe methode die de bestaande decode + resample-pipeline hergebruikt, maar de PCM in segmenten knipt en elk segment apart naar MP3 encodeert:

```typescript
export interface AudioSegmentResult {
  blob: Blob;
  index: number;        // 0-based volgorde
  startSec: number;     // begin in de originele opname
  endSec: number;       // einde in de originele opname
  durationSeconds: number;
}

export interface SegmentationOptions extends CompressionOptions {
  segmentSeconds: number;   // default ~1080 (18 min)
  overlapSeconds: number;   // default ~15 — voorkomt afgekapte woorden op grenzen
}
```

- Decode + resample één keer (zoals nu) tot mono Float32 PCM @ `targetSampleRate`.
- Bereken `N = ceil(duration / segmentSeconds)`.
- Per segment `k`: `startSec = max(0, k*segmentSeconds - overlapSeconds)`, `endSec = min(duration, (k+1)*segmentSeconds)`. Sample-indices = `floor(sec * sampleRate)`. Slice de Float32Array en encodeer die slice met een **eigen** `Mp3Encoder` (lamejs).
- Overlap: elk segment begint ~`overlapSeconds` vóór z'n nominale start, zodat een woord op de grens niet verloren gaat. De downstream story-stap egaliseert de kleine overlap; eventueel kan de segment-prompt de overlap als "ter context, niet opnieuw uitschrijven" markeren.
- **Geen gedragswijziging voor korte opnames:** als `duration <= minDurationForSegmentation` (default 25 min) → één segment (= huidige flow).

### Stap 2 — Frontend: orkestratie in `AudioCompleteProcessingService`

- `startCompleteProcessing`: na (eventuele multi-file) concatenatie de duur bepalen en beslissen of er gesegmenteerd wordt.
- Bij segmentatie: upload **elk** segment-blob via de bestaande `uploadToGemini` (levert per segment een `fileUri`), verzamel `{ index, fileUri, startSec, endSec }[]`.
- Roep `transcribeAudioFast` aan met de **array** i.p.v. één `fileUri`.
- Progress: compressie (0-50%), uploads (50-65%, verdeeld over N segmenten), transcriptie/story (65-100%, backend). Meldingen: "Segment 3 van 10 uploaden…".

### Stap 3 — Backend: meerdere `fileUri`s accepteren en per segment transcriberen

`transcribe-audio-fast.ts`:

```typescript
export interface AudioSegmentRef {
  index: number;
  fileUri: string;
  startSec?: number;
  endSec?: number;
}

export interface TranscribeAudioFastRequest {
  campaignId: string;
  sessionId: string;
  fileUri?: string;              // backward-compatible (één segment)
  fileUris?: AudioSegmentRef[];  // nieuw (meerdere segmenten)
  audioFileName: string;
  audioFileSize?: number;
  userCorrections?: string;
}
```

- Normaliseer naar een lijst: `fileUris ?? [{ index: 0, fileUri }]`.
- Loop over segmenten (oplopende `index`): per segment `waitForGeminiFileToBecomeActive` → Gemini-call met de **segment-prompt** (Stap 4) → tekst verzamelen.
- **Concateneer** in volgorde tot `rawStory` (join met dubbele newline; eventueel een onzichtbare grensmarkering voor debugging).
- Per-segment logging van `usageMetadata` + `finishReason` (truncatie zou per 18-min segment niet meer mogen voorkomen).
- **Foutafhandeling per segment:** retry (1-2×); als één segment definitief faalt → niet de hele sessie laten falen, maar een korte gemarkeerde gap-notitie invoegen en doorgaan (configureerbaar: hard-fail vs. continue-with-gap).
- Daarna onveranderd: `storyGenerationWorker` triggeren met de samengestelde `rawStory`.

> **Belangrijk — uitvoeringsmodel.** N sequentiële Gemini-calls duren samen enkele minuten, te lang voor de huidige fire-and-forget in een `onCall`. Volg het robuuste patroon dat story-generatie al gebruikt: verplaats de segment-verwerking naar een **achtergrond-worker** (`WorkerQueueService.triggerWorker`). De callable valideert + enqueued + keert direct terug; de worker verwerkt segmenten en schrijft voortgang/resultaat naar Firestore (frontend volgt al via `onSnapshot`). Alternatief voor beperkte segmentaantallen: inline `await` met verhoogde `timeoutSeconds` (zoals `generatePodcastAudio` doet). **Sequentieel** verwerken als startpunt; gelimiteerde parallelisatie (2-3 tegelijk) is een latere optimalisatie, mits binnen rate limits.

### Stap 4 — Segment-bewuste prompt

Een variant van `RAW_STORY_TRANSCRIPTION_PROMPT` voor losse fragmenten. Verschillen:

- Kop: "Dit is segment X van Y van een langere sessie (ongeveer minuut A tot B). Transcribeer getrouw **alles** wat je in dit fragment hoort."
- **Verwijder** de "dek de HELE sessie / verdeel je budget over 3 uur / houd marge"-instructies — die zijn per segment niet van toepassing en veroorzaakten juist budget-angst.
- **Behoud volledig** alle trouw-regels (alleen wat hoorbaar is, niet gokken bij namen/getallen, geen invulling).
- Geen verwijzingen naar andere segmenten; de overlap is alleen om woorden op grenzen niet te verliezen.
- Kanka-context blijft per segment meegestuurd voor correcte namen/plaatsen.

### Stap 5 — Configuratie via `settings/ai` (override zonder deploy)

Onder `features.transcription` of een nieuw blok `transcriptionSegmentation`:

```typescript
{
  enabled: boolean;                      // default true
  segmentMinutes: number;                // default 18
  overlapSeconds: number;                // default 15
  minDurationMinutesForSplit: number;    // default 25
  onSegmentFailure: 'gap' | 'fail';      // default 'gap'
}
```

Defaults in `ai-settings.ts`; override via Firestore zodat segmentlengte/overlap getuned kan worden zonder code-wijziging.

### Stap 6 — Datamodel (Firestore `audioSessions/{id}.transcriptionFast`)

Uitbreiden met segment-metadata; `rawStory` blijft één samengestelde string (downstream story-generatie ongewijzigd):

```typescript
transcriptionFast: {
  // bestaand …
  segmentCount: number;
  segments: Array<{
    index: number;
    fileUri: string;
    startSec: number;
    endSec: number;
    status: 'pending' | 'completed' | 'failed';
    charCount?: number;
    finishReason?: string;
  }>;
}
```

> Let op naamgeving: er bestaat al een `TranscriptionSegment`-type in `audio-session.models.ts` (oudere, getimede transcriptiesegmenten). Gebruik een onderscheidende naam (bv. `AudioSegmentRef` / `audioSegments`) om verwarring te voorkomen.

---

## Segmentparameters (default-onderbouwing)

- **18 min/segment:** ~34.5k input-tokens (32 tokens/sec) — ruim binnen 1M context; 65k output-budget is veel meer dan een fragment van 18 min nodig heeft → geen truncatie, vol detail. Korter = nog hogere fidelity maar meer calls; 18 min is de balans.
- **3 uur → 10 segmenten; 4 uur → ~14.**
- **Overlap 15 s:** vangt woorden op grenzen op; minimale dubbeling die de story-stap egaliseert.
- **Splitsdrempel 25 min:** daaronder is één pass prima → geen onnodige calls/kosten.

---

## Edge cases

- **Korte opname (< drempel):** ongewijzigde single-segment flow (geen regressie).
- **Segment grotendeels stilte/offtopic:** trouw-prompt staat een kort segment toe — correct.
- **Upload/ACTIVE-fout per segment:** retry; bij definitieve fout `onSegmentFailure`-beleid.
- **Naam-/plotcontinuïteit over segmenten:** Kanka-context per segment + de story-stap die alles reconcilieert.
- **Woord afgekapt op grens:** opgevangen door overlap.
- **Kosten/tijd:** N transcriptie-calls (meer wall-clock + iets meer prompt-tokens), maar **audio-inputtokens blijven ≈ gelijk** aan één pass (elk segment alleen z'n eigen audio). Output-budget vermenigvuldigt bewust.

---

## Verwacht resultaat

- Een opname van 2,5-4 uur levert een transcript waarin de **tweede helft net zo gedetailleerd en getrouw** is als de eerste — geen detailverlies meer richting het einde.
- Aantoonbaar **minder verzinsels** (kortere context + behouden trouw-regels).
- Substantieel **langer en rijker** transcript doordat elk segment z'n eigen budget heeft.
- Geen per-segment `MAX_TOKENS`-truncatie meer in de logs.
- Korte opnames: ongewijzigd gedrag.
- Segmentlengte/overlap configureerbaar via `settings/ai` zonder deploy.

---

## Bestanden die wijzigen

| Bestand | Wijziging |
|---|---|
| `src/app/audio/services/audio-compression.service.ts` | `compressSegments()` — PCM in segmenten knippen + per segment MP3-encode |
| `src/app/audio/services/audio-complete-processing.service.ts` | Orkestratie: N uploads, `transcribeAudioFast` met `fileUris[]`, segment-progress |
| `functions/src/transcribe-audio-fast.ts` | `fileUris[]` accepteren, segment-loop, concatenatie, per-segment foutafhandeling; verwerking naar achtergrond-worker |
| `functions/src/audio/transcription-prompt.ts` | Segment-bewuste promptvariant (`buildSegmentRawStoryPrompt`) |
| `functions/src/prompts/raw-story-transcription.prompt.ts` | Segment-prompttekst toevoegen |
| `functions/src/utils/ai-settings.ts` | Defaults voor `transcriptionSegmentation` |
| `functions/src/types/audio-session.types.ts` | `transcriptionFast` segment-metadata + settings-type |
| `src/app/audio/services/audio-session.models.ts` | Frontend types voor segment-metadata (let op bestaande `TranscriptionSegment`) |

---

## Test strategie

1. **Unit (frontend):** segment-slice-wiskunde — sample-grenzen, overlap, laatste segment, single-vs-multi beslissing op de drempel.
2. **Unit (backend):** normalisatie `fileUri` ↔ `fileUris[]`, concatenatie-volgorde, per-segment foutafhandeling (`gap` vs `fail`).
3. **Integratie (backend):** loop met gemockte Gemini-calls; verifieer volgorde + samengestelde `rawStory`.
4. **Handmatig (E2E):** een bekende 3-uurs opname opnieuw uploaden; bevestig dat de **tweede helft** nu detail-pariteit heeft met de eerste; check logs op afwezigheid van `MAX_TOKENS` per segment.
5. **Regressie:** korte opname (< drempel) → identiek aan huidige flow.
6. **Kwaliteit:** steekproef op verzinsels — komt elk genoemd feit terug in de audio?

---

## Relatie tot andere tickets

- **#53 Multi-File Audio Upload** — concateneert meerdere bestanden tot één avond; dit ticket knipt die avond daarna in segmenten. Volgorde: eerst concateneren, dán segmenteren.
- **#54 Refactor naar Raw Story** — levert de `rawStory` → `content` pipeline waarop dit voortbouwt (concatenatie blijft één `rawStory`).
- **#12 Gemini Max-Tokens Truncatie** & **#13 Resume from Failure** — per-segment budget + per-segment retry sluiten hierop aan.
- **#37 Gemini Batch API Transcription** — alternatief uitvoeringsmodel; segmenten zouden later via de Batch API parallel verwerkt kunnen worden.

---

## Open vragen / tuning (te valideren tijdens implementatie)

1. Optimale segmentlengte (15 vs 18 vs 20 min) — start op 18, tune op basis van fidelity-meting.
2. Sequentieel vs. gelimiteerd parallel transcriberen — start sequentieel; meet wall-clock vóór parallelisatie.
3. Achtergrond-worker vs. inline `await` met verhoogde timeout — voorkeur worker (robuuster bij N segmenten).
4. Overlap als losse "context"-instructie in de segment-prompt, of puur audio-overlap zonder prompt-vermelding.

---

## Bronnen

- Diagnose uit deze sessie: detailverlies in de tweede helft = single-pass aandachtsverval over lange audio.
- Gemini audio: ~32 tokens/seconde, 1M input-context, 64k output-budget (per call).
- Bestaande ffmpeg-toolchain in `functions/` (`@ffmpeg-installer/ffmpeg`, `fluent-ffmpeg`) — relevant voor alternatief C.
