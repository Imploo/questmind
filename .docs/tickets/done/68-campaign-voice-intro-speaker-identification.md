# Ticket #68: Voorstelrondje-audio per campaign voor sprekerherkenning in transcripties

**Created:** 2026-10-21
**Priority:** High
**Status:** Done
**Effort:** 2-4 dagen
**Dependencies:** Bouwt voort op #54 (raw story / conversation log pipeline) en #67 (segment-transcriptie)

---

## Implementatie-status (afgerond — 2026-10-21)

**Belangrijkste ontwerpkeuze — `inlineData` i.p.v. Files API-cache:** het voorstelrondje wordt client-side gecomprimeerd naar mono MP3 (64 kbps, max 5 min ≈ 2,4 MB). De backend downloadt het per transcriptie-run één keer uit Firebase Storage en stuurt het als base64 `inlineData` mee in elke segment-call. De sessie-segmenten blijven `fileData`-referenties en tellen dus niet mee voor de inline-limiet. Daardoor vervallen de 48u-verloopcache, backend-writes naar het campaign-document en het `private/`-subdocument uit de oorspronkelijke opzet (zie "Technische details" hieronder, die beschrijven nog de oorspronkelijke Files API-variant). Een bestand > 10 MB wordt overgeslagen met een warning + Sentry (base64 maakt het ~1/3 groter; zo blijft het request ruim onder de ~20 MB inline-limiet).

**Geïmplementeerd:**
- Backend `functions/src/audio/voice-intro.service.ts` → `loadVoiceIntroAudio()`: downloadt uit Storage, base64, non-fatal (`captureException` + `null` bij fouten, lege of te grote bestanden).
- Backend `transcribe-audio-fast.ts`: leest `settings.voiceIntro` in dezelfde campaign-read als `kankaEnabled` (`getCampaignTranscriptionSettings`), laadt de intro in de async-verwerking (de callable blijft direct terugkeren), parts per segment = `[VOICE_INTRO_REFERENCE_PROMPT, intro-audio, prompt, sessie-audio]`, schrijft `transcriptionFast.voiceIntroUsed`.
- Prompts (`raw-story-transcription.prompt.ts`): `buildFullTranscriptionPrompt()` / `buildSegmentTranscriptionPrompt()` met optie `{ hasVoiceIntro }`. Zonder intro is de output byte-identiek aan vóór dit ticket (getest). Met intro: aparte SPEAKERS-regels (stem-match → karakternaam, DM-stem altijd `DM`, twijfel → `Speler (onbekend)`), aangepaste segmentregel, en een preamble die het transcriberen van het voorstelrondje verbiedt (ook bij een stil segment).
- `storage.rules`: `campaigns/{campaignId}/voice-intro/{filename}` — members lezen, owner create/update (< 25 MB, `audio/*`), aparte delete-regel voor de owner. Nieuwe helper `isCampaignOwner()`.
- Frontend: `CampaignVoiceIntro` in `campaign.models.ts` + Zod-schema; `CampaignService.updateVoiceIntro()` (dotted-path write `settings.voiceIntro` / `deleteField()`, zodat andere settings niet overschreven worden); `CampaignVoiceIntroService` (valideren, comprimeren, uploaden, doc bijwerken, daarna oude file opruimen; verwijderen; playback-URL); dumb `CampaignVoiceIntroComponent`; nieuwe sectie "Transcription" in `campaign-settings.component.ts`.
- Fallback in `transcribeSegment()`: als alle pogingen mét voorstelrondje falen (bijv. Gemini weigert de intro-audio door een afwijkend MIME-type of corrupte audio), volgt één poging zónder intro + `captureException`. Een kapotte intro kan een sessie dus nooit laten falen.
- Retry/retranscribe: alle aanroepers van `transcribeAudioFast` geven `campaignId` mee en krijgen het voorstelrondje dus automatisch.

**Keuzes bij de open punten:** alleen de owner uploadt/vervangt/verwijdert (consistent met de Firestore-regel dat alleen de owner het campaign-document mag updaten); max 5 min; bronbestand max 100 MB (vóór compressie), upload max 25 MB; voorbeeldzin + opname-advies in de UI.

**Niet gedaan:** de optionele kill-switch in `settings/ai` (de feature staat per campaign al uit zolang er geen voorstelrondje is geüpload).

**Deploy:** `storage.rules` moet apart gedeployed worden (`firebase deploy --only storage`), naast de functions en de hosting.

---

## Beschrijving

De transcriptie maakt een geannoteerd gesprekslog van een sessie-opname (`DM [rustig]: ...`, `Thorin [lachend]: ...`). Sprekerherkenning is nu het zwakste punt:

- De prompt (`LOG_RULES` in `functions/src/prompts/raw-story-transcription.prompt.ts`) staat een karakternaam alleen toe als **de audio zelf** duidelijk maakt wie er spreekt (aangesproken met de naam, of de DM benoemt wie er handelt). Anders wordt het `Speler (onbekend)`.
- Sinds #67 wordt elke sessie in segmenten van ~30 min getranscribeerd. Per segment geldt: *"Speaker names cannot be carried over from other segments"*. Elk segment begint dus opnieuw zonder te weten wie wie is.
- De Kanka-context mag expliciet **niet** gebruikt worden om sprekers te bepalen. Dat is terecht, want een namenlijst zegt niets over stemmen.

Gevolg: veel regels met `Speler (onbekend)`. Het latere story-generatie-proces weet daardoor niet goed welk personage iets zei of deed.

**Oplossing:** bij een campaign kan eenmalig een audiobestand worden geüpload waarin iedereen aan tafel zich voorstelt: spelers met spelernaam en karakternaam, en de DM als DM. Dat voorstelrondje gaat als **stemreferentie** mee met elke transcriptie-call (elk segment). Gemini kan de stemmen in de sessie dan vergelijken met de stemmen uit het voorstelrondje en de juiste karakternaam als spreker gebruiken.

---

## Expected result

1. In de campaign-instellingen staat een sectie **"Voorstelrondje (stemreferentie)"** waar een audiobestand geüpload, beluisterd, vervangen en verwijderd kan worden.
2. Het bestand staat permanent in Firebase Storage. De metadata staat op het campaign-document.
3. Bij elke transcriptie (nieuwe upload, retry en retranscribe) van een sessie in die campaign gaat het voorstelrondje als extra audio-part mee in **elke** segment-call naar Gemini.
4. De prompt legt uit dat de eerste audio een voorstelrondje is en de tweede de sessie. Het model labelt sprekers met hun **karakternaam** als de stem duidelijk overeenkomt met een stem uit het voorstelrondje.
5. De DM blijft `DM`, ook bij NPC-stemmen. Dat is het bestaande gedrag en dat blijft zo.
6. Twijfel blijft twijfel: als een stem niet betrouwbaar te koppelen is, blijft het label `Speler (onbekend)`. Een verkeerde naam is nog steeds erger dan geen naam.
7. Campaigns zonder voorstelrondje werken precies zoals nu (geen gedragswijziging).
8. Als het voorstelrondje niet geladen kan worden (Storage-fout, Gemini-upload faalt), loopt de transcriptie gewoon door zonder stemreferentie, met een warning in de logs en Sentry. De sessie faalt niet.

---

## Gemaakte keuzes (afgestemd met gebruiker)

| Vraag | Keuze |
|-------|-------|
| Hoe komt het voorstelrondje in de app? | **Alleen uploaden** van een bestaand audiobestand (geen opname in de browser) |
| Extra gestructureerde lijst (speler → karakter)? | **Nee, alleen audio.** Iedereen zegt zelf in de opname wie hij/zij is en welk karakter hij/zij speelt |
| Welk sprekerlabel in het transcript? | **Karakternaam** (bijv. `Thorin [lachend]: ...`) |
| Doet de DM mee? | **Ja.** De DM stelt zich voor en wordt herkend als `DM`. NPC-stemmen blijven onder `DM` |

---

## Open punten (nog te verifiëren met gebruiker)

- **Wie mag uploaden/vervangen?** Voorstel: alleen de campaign **owner**, net als de andere campaign-instellingen. Members mogen het wel beluisteren.
- **Maximale lengte:** voorstel max **5 minuten** / 25 MB. Een voorstelrondje duurt normaal 30 s tot 2 min.
- **Instructie voor de opname:** voorstel om in de UI een korte voorbeeldtekst te tonen, bijv. *"Hoi, ik ben Matt en ik speel Thorin, een dwergen-fighter."* Laat iedereen ~10-20 s praten, zodat er genoeg stemmateriaal is.

---

## Technische details

### Huidige situatie (relevante code)

| Bestand | Rol |
|---------|-----|
| `functions/src/transcribe-audio-fast.ts` | Cloud Function `transcribeAudioFast`. Normaliseert `fileUris[]`, transcribeert segmenten parallel via `transcribeSegment()` |
| `functions/src/transcribe-audio-fast.ts:471` | Gemini-call: `contents: [{ role: 'user', parts: [{ text: prompt }, { fileData: { mimeType, fileUri } }] }]` |
| `functions/src/audio/transcription-prompt.ts` | `buildRawStoryPrompt()` / `buildSegmentRawStoryPrompt()`, voegt de Kanka-context toe |
| `functions/src/prompts/raw-story-transcription.prompt.ts` | `LOG_RULES` (SPEAKERS-sectie), `RAW_STORY_TRANSCRIPTION_PROMPT`, `buildSegmentTranscriptionPrompt()` |
| `functions/src/upload-audio-to-gemini.ts` | Proxy voor de Gemini resumable upload (init/chunk). Logica is herbruikbaar voor server-side upload |
| `src/app/campaign/campaign.models.ts` | `Campaign`, `CampaignSettings` |
| `src/app/campaign/campaign-settings.component.ts` | UI voor campaign-instellingen |
| `src/app/audio/services/audio-storage.service.ts` | Upload naar Firebase Storage met `uploadBytesResumable` |
| `src/app/audio/services/audio-compression.service.ts` | Client-side decode/resample naar mono (herbruikbaar om het voorstelrondje te verkleinen) |
| `storage.rules` | Regels per pad. `isCampaignMember()` helper bestaat al |

### Belangrijke beperking: Gemini Files verlopen na 48 uur

Bestanden in de Gemini Files API worden na **48 uur** automatisch verwijderd. Het voorstelrondje wordt maanden lang hergebruikt, dus:

- **Bron van waarheid = Firebase Storage** (`campaigns/{campaignId}/voice-intro/{filename}`).
- De backend houdt een **gecachete Gemini fileUri** bij met vervaltijd. Als die nog minstens ~2 uur geldig is, wordt hij hergebruikt. Anders downloadt de backend het bestand uit Storage (Admin SDK), uploadt het opnieuw naar Gemini en slaat de nieuwe URI en vervaltijd op.
- Dit gebeurt **één keer per transcriptie-run**, vóór de parallelle segment-calls. Alle segmenten delen dezelfde fileUri.

> Alternatief: `inlineData` (base64) i.p.v. de Files API. Dat werkt alleen als het totale request onder ~20 MB blijft. Bij een gecomprimeerd mono-bestand van 1-2 min (< 2 MB) is dat haalbaar en het scheelt de cache-logica. **Aanbeveling:** Files API met cache, omdat die robuust is bij grotere bestanden en de payload niet per segment herhaalt. Kies tijdens implementatie definitief.

### Datamodel

Uitbreiding van `CampaignSettings` (frontend `campaign.models.ts` + Zod-schema `src/app/core/models/schemas/campaign.schema.ts` + backend type):

```typescript
export interface CampaignVoiceIntro {
  storagePath: string;          // campaigns/{campaignId}/voice-intro/{filename}
  fileName: string;             // originele bestandsnaam (voor weergave)
  mimeType: string;             // bijv. audio/mpeg, audio/wav, audio/webm
  sizeBytes: number;
  durationSec?: number;         // client-side bepaald, voor weergave/validatie
  uploadedAt: string;           // ISO
  uploadedBy: string;           // uid
  // Backend-cache (niet door de client schrijven):
  geminiFileUri?: string;
  geminiFileExpiresAt?: string; // ISO
}

export interface CampaignSettings {
  allowMembersToCreateSessions: boolean;
  kankaEnabled?: boolean;
  kankaCampaignId?: string;
  voiceIntro?: CampaignVoiceIntro;
}
```

> Overweging: de Gemini-cache (`geminiFileUri`, `geminiFileExpiresAt`) eventueel in een apart sub-document (`campaigns/{id}/private/voiceIntroCache`) zetten, zodat de backend schrijft zonder het campaign-document en de `updatedAt` te raken. Bij vervangen/verwijderen moet de cache dan óók worden geleegd.

### Storage rules

Nieuw pad in `storage.rules`:

```
match /campaigns/{campaignId}/voice-intro/{filename} {
  allow read: if isCampaignMember(campaignId);
  allow write: if isCampaignOwner(campaignId)   // of isCampaignMember, zie open punt
               && request.resource.size < 25 * 1024 * 1024
               && request.resource.contentType.matches('audio/.*');
  allow delete: if isCampaignOwner(campaignId);
}
```

`isCampaignOwner()` bestaat nog niet in de Storage rules en moet toegevoegd worden (`firestore.get(.../campaigns/$(campaignId)).data.ownerId == request.auth.uid`). Let op de bestaande opmerking dat cross-service Firestore-reads in Storage rules onbetrouwbaar zijn voor write-gating. Als dat een probleem blijkt, laat de upload dan via een callable Cloud Function lopen die de owner-check doet.

### Frontend

**Nieuwe dumb component** `CampaignVoiceIntroComponent` (`src/app/campaign/components/`):
- Inputs: `voiceIntro: CampaignVoiceIntro | undefined`, `canEdit: boolean`, `uploadProgress: number | null`, `audioUrl: string | null`
- Outputs: `fileSelected: File`, `remove: void`
- Toont: uitleg + voorbeeldzin, bestandsinput (`accept="audio/*"`), voortgangsbalk, `<audio controls>` speler, knoppen "Vervangen" en "Verwijderen"
- `ChangeDetectionStrategy.OnPush`, `input()`/`output()`, native control flow

**Smart-kant** (in `campaign-settings.component.ts` of een nieuwe `CampaignVoiceIntroService`, `providedIn: 'root'`):
1. Valideren: audio mime-type, ≤ 25 MB, duur ≤ 5 min (duur bepalen via `HTMLAudioElement.duration` of de compressieservice).
2. Optioneel comprimeren naar mono 16 kHz via `audio-compression.service.ts`. Dat houdt het bestand klein en bevat genoeg stemkenmerken.
3. Uploaden naar `campaigns/{campaignId}/voice-intro/{timestamp}-{filename}` met `uploadBytesResumable`.
4. `settings.voiceIntro` op het campaign-document zetten (en de backend-cache leegmaken).
5. Bij vervangen: het oude Storage-bestand na de succesvolle upload verwijderen.
6. Bij verwijderen: Storage-bestand verwijderen en `settings.voiceIntro` op `deleteField()` zetten.
7. Fouten via `logger.error()` uit `shared/logger` (geen `console.error`).

Optioneel: op de upload-pagina van een sessie een kleine indicator tonen ("Stemreferentie actief ✓" of "Geen voorstelrondje — sprekerherkenning beperkt", met een link naar de instellingen).

### Backend

**Nieuwe module** `functions/src/audio/voice-intro.service.ts`:

```typescript
export interface VoiceIntroRef {
  fileUri: string;
  mimeType: string;
}

/**
 * Returns a Gemini fileUri for the campaign's voice-intro, re-uploading from
 * Firebase Storage when the cached Gemini file is missing or about to expire.
 * Returns null when the campaign has no voice-intro or loading fails (non-fatal).
 */
export async function resolveVoiceIntro(
  campaignId: string,
  apiKey: string
): Promise<VoiceIntroRef | null>;
```

Stappen:
1. Campaign-document lezen → `settings.voiceIntro`. Ontbreekt die → `null`.
2. Is `geminiFileUri` aanwezig en `geminiFileExpiresAt` > nu + 2 u? Doe dan een korte GET op de file-metadata om te checken of hij nog `ACTIVE` is. Zo ja → teruggeven.
3. Anders: bestand downloaden uit Storage (`admin.storage().bucket().file(storagePath).download()`), uploaden naar Gemini (resumable upload, de helpers uit `upload-audio-to-gemini.ts` extraheren en hergebruiken, DRY), wachten op `ACTIVE` (`waitForGeminiFileToBecomeActive` bestaat al) en de cache wegschrijven.
4. Bij elke fout: `captureException()` uit `./utils/sentry-error-handler` met tag `voiceIntro`, `logger.warn` en `null` teruggeven. Nooit de transcriptie laten falen.

**Aanpassing `transcribeAudioFast`** (`functions/src/transcribe-audio-fast.ts`):
- Eén keer vóór de segment-loop: `const voiceIntro = await resolveVoiceIntro(campaignId, googleAiKey);`
- `voiceIntro` doorgeven aan `transcribeSegment()` en aan de prompt-builders (`hasVoiceIntro: boolean`).
- In `transcribeSegment()` de parts-volgorde aanpassen als er een voiceIntro is:

```typescript
parts: [
  { text: VOICE_INTRO_PREAMBLE },                                   // "De eerste audio is het voorstelrondje..."
  { fileData: { mimeType: voiceIntro.mimeType, fileUri: voiceIntro.fileUri } },
  { text: prompt },                                                 // bestaande (segment)prompt
  { fileData: { mimeType, fileUri } },                              // sessie-audio
]
```

- `waitForGeminiFileToBecomeActive` ook voor de intro-file aanroepen (of één keer in `resolveVoiceIntro`).
- In het opgeslagen transcriptieresultaat (`transcriptionFast`) vastleggen of er een stemreferentie is gebruikt (`voiceIntroUsed: boolean`), voor debugging en latere kwaliteitsvergelijking.

**Retry/retranscribe:** die lopen ook via `transcribeAudioFast` met `campaignId`, dus krijgen het voorstelrondje automatisch mee. Controleren of dat klopt voor alle aanroepers (ook `story-generation-worker.ts`, als die opnieuw transcribeert).

### Prompt-aanpassingen

In `raw-story-transcription.prompt.ts`:

**1. Nieuwe preamble** (alleen als er een voiceIntro is):

```
VOICE REFERENCE (FIRST AUDIO):
The first audio file is NOT part of the session. It is a short introduction round recorded
by this group: each player states their own name and the name of the character they play,
and the Dungeon Master introduces themselves as the DM.
Use it ONLY as a voice reference: learn what each person sounds like (pitch, timbre, accent,
speaking rhythm) and which character name belongs to that voice.
Do NOT transcribe the introduction audio and do NOT include anything said in it in your log.
The SECOND audio file is the session you must transcribe.
```

**2. `LOG_RULES` SPEAKERS-sectie conditioneel uitbreiden.** De bestaande regel ("only when the audio itself makes it clear") blijft voor campaigns zonder intro. Met intro komt daarbij:

```
- You MAY label a player with their CHARACTER name when their voice clearly matches a voice
  from the introduction round. Voice match counts as "the audio makes it clear".
- The DM's voice from the introduction is always "DM" — including when the DM voices NPCs,
  monsters or narration. Never label the DM's voice with a player character name.
- If a voice does not clearly match any introduced voice (similar-sounding players, crosstalk,
  poor audio, a guest who was not in the introduction), use "Speler (onbekend)". A wrong name
  is worse than "Speler (onbekend)".
- Use character names exactly as spoken in the introduction (and spelled per the campaign
  reference list when the same name appears there).
```

**3. Segmentprompt:** de regel *"Speaker names cannot be carried over from other segments"* vervangen als er een intro is: *"Identify speakers in this clip using the voice reference; do not rely on anything outside this clip and the voice reference."*

**4. Kanka-context:** de zin *"never use this list to decide who is speaking"* blijft staan. Die gaat over de namenlijst, niet over de stemreferentie. Wel toevoegen dat de spelling van karakternamen uit de lijst mag komen.

De prompt-builders krijgen een optionele parameter (`{ hasVoiceIntro: boolean }`), zodat het bestaande gedrag zonder intro byte-for-byte gelijk blijft (bestaande tests blijven groen).

### Kosten & limieten

- Gemini audio ≈ 32 tokens/seconde → een voorstelrondje van 2 min ≈ **3.840 input-tokens per segment**. Een sessie van 4 uur = 8 segmenten ≈ 31k extra input-tokens. Verwaarloosbaar t.o.v. de sessie-audio zelf (~460k tokens).
- Geen invloed op het output-budget (65k per segment).
- Optioneel: een toggle `voiceIntro.enabled` in `settings/ai`, zodat de feature zonder deploy uit kan als het de kwaliteit onverwacht verslechtert. Defaults zowel backend (`ai-settings.ts`) als frontend (`ai-settings.service.ts`), net als `transcriptionSegmentation` in #67.

---

## Acceptatiecriteria

- [ ] Owner kan in de campaign-instellingen een audiobestand uploaden, beluisteren, vervangen en verwijderen
- [ ] Validatie: alleen audio, ≤ 25 MB, ≤ 5 min. Duidelijke foutmeldingen
- [ ] Bestand staat in `campaigns/{campaignId}/voice-intro/`, metadata in `settings.voiceIntro`
- [ ] Storage rules: members lezen, alleen owner schrijft/verwijdert (of anders, na het open punt)
- [ ] `transcribeAudioFast` stuurt het voorstelrondje mee met elk segment, met de gedeelde Gemini fileUri
- [ ] Gemini-cache wordt hergebruikt binnen de geldigheid en automatisch ververst na het verlopen (48 u)
- [ ] Bij een fout in het laden van de intro loopt de transcriptie door zonder intro (warning + Sentry)
- [ ] Campaign zonder intro: prompt en gedrag ongewijzigd
- [ ] Inhoud van het voorstelrondje komt niet in het transcript terecht
- [ ] DM blijft `DM` (ook NPC-stemmen); spelers krijgen hun karakternaam bij een duidelijke stem-match
- [ ] `transcriptionFast.voiceIntroUsed` wordt opgeslagen
- [ ] Frontend gebruikt `logger.error()`, backend `captureException()`/`captureFunctionError()`
- [ ] `npm run build`, `npm run build:backend`, `npm run lint`, `npm run test` slagen

---

## Testplan

### Unit tests (backend)
- `resolveVoiceIntro`:
  - geen `voiceIntro` → `null`
  - geldige cache (> 2 u resterend, ACTIVE) → cache-URI, geen download/upload
  - verlopen cache → download + upload + cache-update
  - Storage-download faalt → `null` + captureException
  - Gemini-upload faalt → `null` + captureException
- Prompt-builders:
  - zonder `hasVoiceIntro` → output identiek aan de huidige versie (snapshot)
  - met `hasVoiceIntro` → bevat de voice-reference-regels; de segmentprompt bevat de "cannot be carried over"-regel niet meer
- `transcribeSegment`: met voiceIntro is de parts-volgorde `[preamble, intro-audio, prompt, sessie-audio]`; zonder voiceIntro ongewijzigd.

### Unit tests (frontend)
- `CampaignVoiceIntroComponent`: render-states (geen bestand / uploaden / aanwezig / read-only voor member)
- Validatie: te groot bestand, verkeerd type, te lang
- Service: upload → campaign-update; vervangen verwijdert het oude bestand; verwijderen ruimt Storage + veld op

### Handmatige kwaliteitstest
1. Neem een bestaande sessie met veel `Speler (onbekend)`. Tel het aantal onbekende regels en controleer een steekproef van ~30 regels op juistheid.
2. Upload een voorstelrondje en retranscribe dezelfde sessie.
3. Vergelijk: aantal `Speler (onbekend)` (moet flink dalen), aantal **foute** toewijzingen in dezelfde steekproef (mag niet stijgen), en of de intro-tekst ergens in het log opduikt (mag niet).
4. Test ook een sessie met een gast die niet in het voorstelrondje zit → moet `Speler (onbekend)` blijven.

---

## Risico's

| Risico | Mitigatie |
|--------|-----------|
| Model wijst met te veel zelfvertrouwen verkeerde namen toe ("stem lijkt op...") | Expliciete twijfelregel in de prompt; kwaliteitstest meet foute toewijzingen; toggle in `settings/ai` |
| Model transcribeert het voorstelrondje mee | Expliciete instructie + aparte preamble; test in acceptatiecriteria |
| Spelers met vergelijkbare stemmen | Valt terug op `Speler (onbekend)`; in de UI adviseren om iedereen 10-20 s te laten praten |
| Andere microfoon/ruimte dan tijdens de sessie | Advies in de UI: neem het voorstelrondje op met dezelfde opstelling als de sessies |
| Party-samenstelling verandert (nieuwe speler, nieuw karakter na een death) | Vervangen is eenvoudig; in de UI vermelden dat het voorstelrondje opnieuw opgenomen moet worden bij wijzigingen |
| Gemini-cache verloopt midden in een lange run | 2 u buffer bij hergebruik; een run duurt maximaal 20 min (`timeoutSeconds: 1200`) |
| Cross-service Firestore-reads in Storage rules onbetrouwbaar | Fallback: upload via een callable function met owner-check |

---

## Buiten scope

- Opnemen in de browser (kan een vervolgticket worden)
- Gestructureerde speler → karakter-lijst als tekst
- Meerdere voorstelrondjes per campaign (bijv. per party-samenstelling) of per sessie
- Herkenning van individuele NPC's als aparte sprekers
- Diarization via een aparte speech-API (bijv. Google Speech-to-Text speaker diarization)
