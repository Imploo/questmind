# Ticket #70: Codebase-opschoning — beveiliging, dead code, duplicatie en consistentie

**Created:** 2026-10-27
**Priority:** High (fase A: beveiliging = Critical)
**Status:** Done
**Effort:** 3-5 dagen (in één run uitvoerbaar, fase voor fase)
**Dependencies:** Geen. Raakt code uit #54, #66, #67, #69. Het podcast-share-feature (commit 7ff9788) valt hier buiten → zie #71.
**Bron:** Volledige codebase-review van 2026-10-27 (backend `functions/src` + frontend `src`). Twee review-agents; de ernstigste punten zijn handmatig geverifieerd.

---

## Beschrijving

Een volledige review van de codebase laat zien dat de architectuur in de basis klopt, maar dat er na de recente pijplijn-wijzigingen veel is blijven liggen:

1. **Beveiligingslekken in Cloud Functions.** Een API-key die naar een door de client opgegeven URL wordt gestuurd, een callable zonder enige auth-check, en meerdere callables zonder lidmaatschaps- of eigenaarscheck.
2. **Toegangscontrole is ~10 keer gekopieerd**, telkens met andere regels.
3. **Dead code (~2.500 regels).** Overblijfsels van batch-transcriptie, client-side transcriptie, de oude sidebar, ongebruikte utils/schema's/types en ongebruikte servicemethodes.
4. **Duplicatie** in podcast-orkestratie, Gemini-aanroepen, resolve-spell/feature, de podcast-UI en datumconversie.
5. **Logica- en consistentiefouten.** Een stale-check die nooit afgaat, dubbele Sentry-events, inconsistente CORS, verouderde teksten en kleine overtredingen van de projectregels.

Dit ticket bundelt alle punten. Elk punt heeft een checkbox, zodat het in één run afgevinkt kan worden.

## Verwacht resultaat

- Geen enkele callable vertrouwt nog op ids, URLs, paden of modelnamen van de client zonder server-side autorisatie.
- Eén gedeelde toegangslaag (`functions/src/utils/access.ts`) die alle callables gebruiken, met dezelfde semantiek als `firestore.rules`.
- Al het genoemde dead code is verwijderd; `npm run build`, `npm run build:backend`, `npm run lint` en `npm run test` zijn groen.
- Gedupliceerde logica is samengevoegd in gedeelde helpers/componenten.
- E-mail-login (inloggen, registreren, wachtwoord vergeten) zit in de bestaande `sign-in-page`.
- Geen gedragswijziging voor eindgebruikers, behalve de bewust benoemde (strengere rechten, e-mail-login, podcast-statusbadge, correcte stale-detectie).

## Genomen beslissingen (met de gebruiker afgestemd, 2026-10-27)

| Onderwerp | Beslissing |
|---|---|
| Legacy retry via Gemini `fileUri`/`fileUris` | **Volledig verwijderen.** Retry gaat altijd via `storagePath`. Oude sessies zonder opgeslagen audio kunnen niet opnieuw getranscribeerd worden (Gemini-bestanden verlopen na ~48 uur, dus dat kon toch al niet). |
| E-mail-login (`AuthButton` + `SignInModal`) | **Inbouwen in `sign-in-page`.** De Email/Password-provider staat al aan in de Firebase console. |
| Frontend Zod-schema's | **Verwijderen** (inclusief specs). De interfaces in `*.model.ts` blijven de enige bron. |
| Podcast-share-feature | **Apart ticket (#71).** |

---

## Fase A — Beveiliging (Critical, eerst doen)

### A1. Gemini API-key lekt naar een door de client gekozen URL
- **Waar:** `functions/src/transcribe-audio-fast.ts:843` doet `fetch(`${fileUri}?key=${apiKey}`)`. `fileUri`/`fileUris` komen ongecontroleerd uit `request.data` (`:116-123`); `normalizeSegments` checkt alleen op een niet-lege string.
- **Impact:** elke ingelogde gebruiker kan `fileUri: "https://attacker.example/x"` meesturen en ontvangt `GOOGLE_AI_API_KEY`. **Na de fix de key roteren** (handmatige stap, zie Deploy).
- **Fix (volgens beslissing):** het hele `fileUri`/`fileUris`-pad verwijderen (zie D6). `transcribeAudioFast` accepteert alleen nog `storagePath` (of leest de opname zelf uit het sessiedoc).
- Zorg dat geen enkele overgebleven `fetch` de key nog in een query-string zet. Gebruik de header `x-goog-api-key` of de SDK (`googleAi.files.get`).
- [x] fileUri-pad weg, key nergens meer in een URL (`grep -rn "key=\${" functions/src` is leeg)

### A2. `storyGenerationWorker` heeft geen enkele auth-check
- **Waar:** `functions/src/services/worker-queue.service.ts:51-80` (`createWorker`) wraps de handler in een kale `onCall`. `workers/story-generation-worker.ts:78-127` vertrouwt `campaignId`, `sessionId` en `transcriptionText` van de client en schrijft `content` en `status: 'completed'`.
- **Impact:** iedereen, ook zonder login, kan het verhaal van elke sessie overschrijven met eigen tekst.
- **Fix:**
  - Maak er een normale callable van met `wrapCallable`, `cors: SHARED_CORS` en `ensureAuthForTesting`.
  - Vereis auth en `assertCampaignMember` (A6).
  - Negeer `transcriptionText` van de client; lees `rawStory`/de transcriptie server-side uit het sessiedoc.
  - Verwijder `WorkerQueueService` (zie D2).
  - Check in de frontend wie `storyGenerationWorker` aanroept (`audio-backend-operations.service.ts` → `regenerateStory()`) en pas de payload aan.
- [x] Callable vereist auth + lidmaatschap, leest de brontekst server-side

### A3. Audio-pipeline-callables zonder lidmaatschapscheck
- **Waar:** `process-session-audio.ts:48-62` (`processSessionAudio`) en `transcribe-audio-fast.ts:109-155` (`transcribeAudioFast`) checken alleen `request.auth`. Het commentaar in `storage.rules` beweert dat de backend het lidmaatschap controleert.
- **Impact:** elke ingelogde gebruiker kan op elke sessie betaald Gemini- en ffmpeg-werk starten.
- **Fix:** `assertCampaignMember(db, campaignId, uid)` en controle dat de sessie bestaat. Kijk of de huidige UI alleen de sessie-eigenaar laat (her)verwerken; zo ja, ook `assertSessionOwner` (of campagne-eigenaar).
- [x] Beide callables controleren lidmaatschap (en eventueel eigenaarschap)

### A4. Character-callables zonder eigenaarscheck
- **Waar:**
  - `generate-character-draft.ts:131-146` (`generateCharacterDraftCallable`) schrijft `isGenerating` en draftversies naar elke `characterId`.
  - `generate-image.ts:43-170` (`generateImage`) schrijft afbeeldingen naar elk character.
  - `generateImage` downloadt elk bucketpad dat als `referenceImageStoragePath` wordt meegegeven (`:76`).
  - `generateImage` gebruikt `chatRequest.systemPrompt` en het fal-`model` van de client (`:50`, `:97`).
  - `character-chat.ts` controleert ook geen eigenaarschap.
- **Fix:**
  - `assertCharacterOwner(db, characterId, uid)` (dezelfde regel als `resolve-spell.ts:40-45`: `characters/{id}.userId === uid`) in alle drie.
  - `referenceImageStoragePath` moet beginnen met `images/${characterId}/`, anders `invalid-argument`.
  - Het fal-model komt uit een allow-list of uit AI settings, nooit vrij van de client.
  - De system prompt wordt server-side bepaald; de client levert alleen inhoud/context.
- [x] Eigenaarscheck in draft, image en chat
- [x] Referentiepad beperkt, model via allow-list/settings, system prompt server-side

### A5. `processVoiceIntro` verwijdert de upload vóór de eigenaarscheck
- **Waar:** `process-voice-intro.ts:57-98`. De eigenaarscheck zit binnen een `try` waarvan de `finally` altijd `sourcePath` verwijdert.
- **Impact:** een niet-eigenaar kan de backend de wachtende intro-upload van de eigenaar laten wissen.
- **Fix:** de existence- en eigenaarschecks vóór de `try` zetten; alleen na een geslaagde autorisatie opruimen.
- [x] Checks vóór de try/finally + test die bewijst dat een niet-eigenaar niets laat verwijderen

### A6. Gedeelde toegangslaag `functions/src/utils/access.ts`
Nu staat de toegangscontrole in ~10 functies, steeds anders:

| Functie | Huidige regel |
|---|---|
| `generatePodcastAudio` | lid (alleen `members`-map) **en** sessie-eigenaar (`:90-105`) |
| `generateCampaignStory`, `generateCampaignStoryPodcast`, `processVoiceIntro` | campagne-eigenaar |
| `createPodcastShare` | eigen `isCampaignMember` (array of map) |
| `processSessionAudio`, `transcribeAudioFast`, `storyGenerationWorker` | **geen** |
| `resolveSpell`, `resolveFeature` | character-eigenaar |
| `characterChat`, `generateCharacterDraft`, `generateImage` | **geen** |

**Implementatie:**
```ts
// functions/src/utils/access.ts
export async function loadCampaignForUser(
  db: Firestore, campaignId: string, uid: string, opts?: { requireOwner?: boolean }
): Promise<DocumentData>;                 // not-found / permission-denied HttpsError
export async function assertCampaignMember(db, campaignId, uid): Promise<DocumentData>;
export async function assertCampaignOwner(db, campaignId, uid): Promise<DocumentData>;
export async function assertSessionOwner(db, campaignId, sessionId, uid): Promise<DocumentData>;
export async function assertCharacterOwner(db, characterId, uid): Promise<DocumentData>;
export function assertValidId(value: unknown, field: string): string; // non-empty string, no '/'
```
- **Lidmaatschap-semantiek gelijk aan `firestore.rules` `isCampaignMember`:**
  - `ownerId === uid`, of
  - `uid` zit in `campaign.members` (array; map-vorm ook accepteren voor oude docs), of
  - `campaignId` zit in `users/{uid}.campaigns`.
- `assertValidId` weigert `/`, lege strings en niet-strings. Gebruik het op elk id dat in een Firestore- of Storage-pad terechtkomt.
- Vervang alle losse checks in de tabel hierboven door deze helpers. Behoud daarbij het bestaande *niveau* van elke functie (owner blijft owner), tenzij A2-A4 strenger vragen.
- `createPodcastShare` krijgt de helper ook. De rest van de share-fixes staat in #71.
- [x] `access.ts` + spec (array, map, users-profile-fallback, owner, niet-lid, ongeldige id)
- [x] Alle callables gebruiken de helpers; geen inline `ownerId ===` / `members[...]` meer in `functions/src` (behalve in `access.ts`)

### A7. CORS-instellingen gelijktrekken + circulaire import
- **Waar:**
  - 7 callables gebruiken `cors: SHARED_CORS`.
  - `processSessionAudio`, `transcribeAudioFast`, `processVoiceIntro` en `storyGenerationWorker` zetten niets (v2-default; nog niet runtime-geverifieerd of dat "alle origins" is).
  - `SHARED_CORS` wordt uit `./index` geïmporteerd door ~8 modules, wat een circulaire import oplevert.
- **Fix:** `SHARED_CORS` naar `functions/src/config/cors.ts` verplaatsen en op alle callables toepassen. `index.ts` exporteert alleen nog functies.
- [x] Alle callables hebben `cors: SHARED_CORS`; geen module importeert nog iets uit `./index`

---

## Fase B — Logica- en consistentiefouten

### B1. Stale-progress-detectie gaat nooit af (frontend)
- **Waar:** `src/app/audio/audio-session.component.ts:237-249` doet `new Date(session.progress.updatedAt)` op een Firestore-`Timestamp`. Dat geeft Invalid Date, `getTime()` wordt NaN, en de 45-minutencheck faalt altijd stil.
- **Fix:** gebruik de gedeelde `toMillis`/`toDate` uit C7. Zet de drempel als benoemde constante (met uitleg waarom 45 minuten) naast `STALE_GENERATION_MS`.
- [x] Unit-test met een `Timestamp`, een ISO-string en een `Date`

### B2. Stale-generatievenster korter dan de functie-timeout
- **Waar:** `functions/src/campaign-story/campaign-story-paths.ts:12` zet `STALE_GENERATION_MS` op 15 min met commentaar "(function timeout)". `generateCampaignStoryPodcast` zet echter geen `timeoutSeconds` en erft 1200 s (`index.ts:20`). Tussen minuut 15 en 20 kan een tweede generatie parallel starten.
- **Fix:** `timeoutSeconds: 900` expliciet op `generateCampaignStoryPodcast` (en controleer `generateCampaignStory`, dat al 540 heeft). Leid `STALE_GENERATION_MS` af van de grootste timeout van de functies die het gebruiken.
- [x] Timeout en stale-venster consistent, met commentaar

### B3. Dubbele Sentry-events bij pipelinefouten
- **Waar:**
  - `utils/logger.ts:31-50`: `logger.error` stuurt al naar Sentry.
  - `ProgressTrackerService.markFailed` logt opnieuw (`progress-tracker.service.ts:123`).
  - Transcription-worker: `:576` + `markFailed`.
  - Story-handler: `:191` + `markFailed` + rethrow + `storyGenerationTaskWorker:233`.
- **Fix:** één Sentry-event per fout, op het hoogste niveau van elke worker. `markFailed` gebruikt `logger.warn` (zonder Sentry).
- [x] Per fout precies één Sentry-capture (spec met een mock van Sentry)

### B4. `wrapCallable` stuurt verwachte clientfouten naar Sentry
- **Waar:** `functions/src/utils/sentry-error-handler.ts:96-104` capturet elke throw.
- **Fix:** bij `HttpsError` met code `invalid-argument`, `unauthenticated`, `permission-denied`, `not-found`, `failed-precondition` of `already-exists`: alleen een breadcrumb (of `logger.warn`), geen capture. Andere codes en niet-`HttpsError` blijven gecaptured.
- [x] Spec voor beide paden

### B5. Sessie-podcast: race condition, client-gekozen versie, dode takken
- **Waar:** `functions/src/generate-podcast-audio.ts`.
  - `existingPodcasts` wordt één keer gelezen (`:106`) en die verouderde array wordt bij elke `updatePodcastEntry` weggeschreven zonder transactie (`:20-30, :186, :234, :250`). Gelijktijdige writes naar `podcasts` gaan verloren.
  - De podcast-`version` wordt door de client gekozen en er is geen guard tegen een lopende generatie.
  - De `script`-tak (`:68-79, :195-203`) is dood: `podcast-audio.service.ts:66` stuurt nooit `script`.
  - De buitenste `catch` met `captureFunctionError` (`:140-145`) draait vrijwel nooit, want `generatePodcastInBackground` slikt alle fouten zelf.
- **Fix:** gelijktrekken met `generate-campaign-story-podcast.ts:61-102`: versie-allocatie in een transactie, een `isActiveGeneration`-guard en transactionele patches per entry. De `script`-tak verwijderen. Frontend: `podcastVersion` niet meer meesturen.
- Dit valt samen met C2: implementeer het via de gedeelde orkestratie.
- [x] Versie server-side, transactionele updates, script-tak weg, frontend aangepast

### B6. Podcast-statusbadge ontbreekt bij `script_complete` (frontend)
- **Waar:** de backend schrijft `pending` → `script_complete` → `completed` (`generate-podcast-audio.ts:187,198`). De badge-`@if` in `podcast-library.component.ts:86` en `session-story.component.ts:341` checkt alleen `pending|generating_audio|uploading`. `campaign-story-podcasts.component.ts` doet het wel goed met `@switch`/`@default`.
- **Fix:** opgelost via het gedeelde component uit C5 (met een `@default`-tak). Haal statussen die de backend nooit schrijft (`loading_context`, `generating_script`, `generating_audio`, `uploading`) uit het `PodcastVersion.status`-type, of laat de backend ze echt schrijven. Kies de eerste optie.
- [x] Status-union matcht wat de backend schrijft; elke status heeft een badge

### B7. `podcast-library.component.ts` kleine fouten
- `loading` wordt nooit `true` (`:44`), dus de spinner is dode UI. Verwijderen of correct zetten.
- `scriptGeneratedAt: toDate(undefined)` geeft Invalid Date (`:206`). Wordt `null`.
- De lijst wordt in een `effect()` opgebouwd dat een signal `.set()`. Dat wordt een `computed()` (projectregel).
- [x] Alle drie opgelost

### B8. `generateImage` onbereikbare code
- `generate-image.ts:143-145` heeft een fallback naar `images/uncategorized`, en `:155` checkt `characterId && request.auth`. Beide zijn al verplicht bij `:39-47`. Verwijderen.
- `CharacterChatRequest` bestaat twee keer met een andere betekenis (`character-chat.ts:12` en `generate-image.ts:14`). Hernoem die in `generate-image.ts` naar `ImagePromptContext`.
- [x] Opgeruimd

### B9. Verouderde teksten en commentaren
- UI: "Gemini 2.5 Pro TTS" (`podcast-library.component.ts:148`) en "Gemini 2.5 Flash TTS" (`session-story.component.ts:405`). TTS draait sinds 9db3b1e op Gemini 3.8 Flash. Verwijder de modelnaam uit de UI, zodat dit niet opnieuw veroudert.
- Backend-commentaren die de oude frontend-pipeline beschrijven:
  - `types/audio-session.types.ts:111` ("frontend uploads a single segment")
  - `audio/stored-audio.service.ts:15` ("stored ... by the frontend")
  - `audio/voice-intro.service.ts:25` ("compressed client-side")
  - `services/kanka.service.ts:41` (een niet-bestaande parameter `sessionDate`)
  - `generate-character-draft.ts:23` ("called from Cloud Tasks", maar Cloud Tasks is verwijderd in ec72048)
- [x] Teksten en commentaren kloppen weer

---

## Fase C — Duplicatie wegwerken

### C1. Gemini-client-helper (backend)
- **Waar:** de boilerplate staat ~9 keer:
  - `character-chat.ts:54-149`
  - `generate-character-draft.ts:33-111`
  - `generate-image.ts:57-108`
  - `resolve-spell.ts` en `resolve-feature.ts`
  - `story/story-generator.service.ts:24-45`
  - `podcast/podcast-pipeline.ts:79-103`
  - `campaign-story/campaign-story-generator.service.ts:23-55`
  - `transcribe-audio-fast.ts:747-797`

  Het patroon: key uit `process.env`, `new GoogleGenAI`, `buildGenerationParams`, usage en finish-reason loggen, lege tekst, JSON-parse en code-fence-strip. Een ontbrekende key geeft nu wisselend `failed-precondition`, `internal` of een gewone `Error`.
- **Fix:** `functions/src/utils/gemini-client.ts`:
  ```ts
  export function getGeminiClient(): GoogleGenAI;            // één foutpad bij ontbrekende key
  export async function generateText(opts: GenerateOpts): Promise<string>;
  export async function generateJson<T>(opts: GenerateOpts & { schema?: object }): Promise<T>;
  ```
  Met eenduidige logging van usage/finishReason en één `stripCodeFences`. Alle bovenstaande plekken migreren. Transcriptie (audio-parts) mag een eigen variant houden als de helper dat te complex maakt, maar dan wel via `getGeminiClient()`.
- [x] Helper + spec, alle aanroepen gemigreerd

### C2. Podcast-orkestratie samenvoegen
- **Waar:** de sessie- en verhaal-flow delen `podcast/podcast-pipeline.ts`, maar versie-, entry- en voortgangsbeheer staat er twee keer:
  - transactie vs verouderde array
  - `ProgressTracker` vs entry-progress
  - Engelse vs Nederlandse meldingen
  - verhaaltekst uit Firestore vs van de client

  Daarnaast staat `PodcastSegment` drie keer: `podcast/podcast-pipeline.ts:14`, `utils/podcast-tts.ts:6`, en inline in `PodcastEntry.script`.
- **Fix:** `runPodcastGeneration({ entryStore, loadSource, ... })` in `podcast/` met een pluggable `PodcastEntryStore` (allocate, patch, fail) per doc-type. Beide callables worden dunne wrappers.
  - De verhaaltekst van een sessie komt server-side uit het sessiedoc.
  - Meldingen worden in één taal geschreven: **Nederlands**, zoals de rest van de UI-teksten.
  - Eén `PodcastSegment`-type.
- [x] Gedeelde orkestratie, beide callables gemigreerd, bestaande specs groen + nieuwe spec voor `runPodcastGeneration`

### C3. `resolve-spell.ts` en `resolve-feature.ts` samenvoegen
- ~90% identiek (per `diff`): auth- en eigenaarscheck, Gemini-JSON-call, code-fence-strip, parse en active-version-patch.
- **Fix:** `resolveCharacterEntry({ featureKey, prompt, listPath, matchName, fields })` in `functions/src/character/`. Beide exports blijven bestaan (frontend-API ongewijzigd) als dunne wrappers.
- [x] Gedeelde implementatie, specs groen

### C4. Kanka-contextprompt één keer
- **Waar:** `story/story-generator.service.ts:94-121` en `audio/transcription-prompt.ts:44-78` zijn al uit elkaar gegroeid (`filter(Boolean)`, andere "Remember"-tekst). Het campagnedoc wordt per transcriptie twee keer gelezen (`getCampaignTranscriptionSettings` op `:324` en `fetchKankaContextForTranscription` in `kanka.service.ts:58`).
- **Fix:** één `buildKankaContextBlock(context)` in `services/kanka.service.ts` (of `prompts/`), en het campagnedoc één keer lezen en doorgeven.
- [x] Eén builder, één campaign-read

### C5. Gedeeld podcast-versiecomponent (frontend)
- **Waar:** de podcast-versierij (badge, duur/grootte/datum, download, delen, `<audio>`) staat drie keer:
  - `podcast-library.component.ts:75-135`
  - `session-story.component.ts:328-390`
  - `campaign-story-podcasts.component.ts:37-95`

  Downloaden gebeurt op drie manieren: `PodcastAudioService.downloadPodcastMP3`, `PodcastGenerationService.download` en `<a download>`.
- **Fix:** een dumb component `app-podcast-version-item` in `src/app/shared/components/` met inputs `podcast`, `shareTarget`, `downloadName` en optioneel `showScript`. Statusbadge via `@switch` met `@default` (lost B6 op). Eén downloadmethode in één service. OnPush, `input()`, geen services in het component zelf; de share-knop wordt als child gebruikt.
- [x] Component + spec, drie plekken gemigreerd, één downloadpad

### C6. Firestore-pad naar de audio-sessie via de repository (frontend)
- **Waar:** `` `campaigns/${campaignId}/audioSessions/${sessionId}` `` wordt met `doc`/`onSnapshot`/`updateDoc` 6 keer met de hand gebouwd:
  - `audio-backend-operations.service.ts:123,207`
  - `audio-complete-processing.service.ts:67,164,188`
  - `podcast-audio.service.ts:107`

  `AudioSessionRepositoryFactory` bestaat al. `PodcastAudioService.listenToPodcastProgress` (`@deprecated`) opent een tweede snapshot-listener op een doc dat `AudioSessionStateService` al streamt.
- **Fix:** alle reads en writes via `AudioSessionStateService` en de repository. Podcast-voortgang wordt via `computed` afgeleid uit `sessions()`; `listenToPodcastProgress` verdwijnt.
- [x] Geen handgebouwde audioSessions-paden meer in services/components

### C7. Eén datum-util (frontend)
- **Waar:** de omzetting van een Firestore-timestamp naar een datum staat 4-5 keer:
  - `FormattingService.formatDate` (`shared/formatting.service.ts:22-38`)
  - `campaign-story.utils.ts:34` `toMillis`
  - de inline `toDate` in `podcast-library.component.ts:199-203`
  - de dode `core/utils/timestamp.util.ts`
- **Fix:** één `toDate(value: unknown): Date | null` en `toMillis(value: unknown): number` in `src/app/shared/utils/date.utils.ts`. Ondersteunt `Timestamp`, `{seconds, nanoseconds}`, ISO-string, `Date` en number. Alle plekken migreren; lost B1 op.
- [x] Util + spec, alle plekken gemigreerd

### C8. Overige kleine duplicatie
- **Frontend:** `audio-upload.component.ts:345` heeft een eigen `formatFileSize` (geeft '0 MB', alleen MB). Gebruik `FormattingService.formatFileSize`.
- **Frontend:** er zijn twee user-profile-services: `core/user.service.ts` (repository + live listener) en `campaign/user-profile.service.ts` (raw `doc(db,'users',…)` op 5 plekken). Voeg ze samen tot één service op `UserProfileRepository`; `ensureProfile` blijft bestaan.
- **Backend storage-helpers:**
  - `storage-url.ts` met `buildTokenDownloadUrl(bucket, path, token)` (nu met de hand in `podcast-pipeline.ts:124-137`; `audio-processing.service.ts:127` zet een token; `generate-image.ts:173` bouwt een URL zonder token).
  - `ffmpeg.setFfmpegPath` één keer, in een `utils/ffmpeg.ts` (nu in 3 bestanden).
  - `withTempDir(fn)` voor het mkdtemp/rm-patroon (2×).
- **Backend:** de timestamp→millis-omzetting staat twee keer (`campaign-story-paths.ts:14` `toMillisOrZero`, `campaign-story-sources.ts:82` `toMillis`). Houd er één over.
- **Backend:** `isEmulator` staat twee keer (`utils/logger.ts:3`, `utils/emulator-helpers.ts:11`). Houd er één over in `emulator-helpers`.
- **Backend:** de doc-ref `campaigns/{id}/audioSessions/{id}` wordt ~8 keer opnieuw gebouwd. Maak `sessionRef(db, campaignId, sessionId)` in `utils/session-ref.ts`.
- [x] Alles hierboven

---

## Fase D — Dead code verwijderen

Verifieer bij elk punt vlak voor het verwijderen met `grep` dat er (buiten specs) echt geen gebruikers zijn. Verwijder bijbehorende specs mee.

### Backend
- [x] **D1.** `functions/src/utils/check-batch-status.ts`: CLI-script met 0 importers, het enige echte `console.error`-gebruik, `process.exit` bij het laden, en wordt mee gecompileerd. Verwijderen.
- [x] **D2.** `WorkerQueueService` (`services/worker-queue.service.ts`): `triggerWorker`, `getHandler` en `handlerMap` worden alleen in de spec gebruikt, en `createWorker` vervalt na A2. Klasse + spec verwijderen.
- [x] **D3.** Ongebruikte types in `types/audio-session.types.ts`:
  - `TranscriptionChunk`, `TranscriptionSegment` (`:5-25`)
  - `RetranscribeStatus`, `RegenerateStoryStatus` (`:58-71`)
  - `TranscriptionModeConfig` / `modes.batch` (`:90-103`)
  - `AISettings.modelConfig` "Legacy support" (`:157-162`)
  - `ProcessAudioSessionRequest`, `RetranscribeAudioRequest`, `RegenerateStoryRequest` (`:218-243`)
- [x] **D4.** `services/progress-tracker.service.ts`: `ProgressStage`, `ProgressFailure`, `AudioSessionProgress` (`:6-38`, 0 gebruik) en `clearProgress`/`getProgress` (`:149-188`, alleen spec).
- [x] **D5.** Exports die alleen een spec gebruikt of helemaal niemand:
  - `parsePcmSampleRate` (`utils/pcm-to-mp3.ts:18`)
  - `RAW_STORY_TRANSCRIPTION_PROMPT` (`prompts/raw-story-transcription.prompt.ts:172`)
  - `handleHttpsError` en `wrapHttp` (`utils/sentry-error-handler.ts:51,111`)

  Let op: `podcastSharePage` (sinds 7ff9788) is een `onRequest` maar gebruikt `wrapHttp` niet; laat dat zo en verwijder `wrapHttp`.
- [x] **D6.** Het legacy `fileUri`/`fileUris`-transcriptiepad:
  - `transcribe-audio-fast.ts:42-83, :123, :225-235` (`normalizeSegments` e.d.)
  - het veld `transcriptionFast.fileUri` "backward compatibility" in de types
  - de wachtfunctie rond `:836-860`

  Hoort bij A1.
- [x] **D7.** Payloadveld `kankaContext` in `workers/story-generation-worker.ts:24,135`: wordt door niemand gezet (de transcription-worker geeft `enableKankaContext` door).
- [x] **D8.** `AISettings.features.characterChat`: controleer of de backend het leest (die gebruikt `characterChatText`). Zo niet, verwijder het uit types en uit de admin-normalisatie. *(Onzeker: eerst verifiëren.)*

### Frontend
- [x] **D9.** De oude sidebar-boom: `app-sidebar` heeft 0 gebruikers (de shell gebruikt `app-nav-rail` en `app-mobile-topbar`, `app-shell.component.ts:15,18`). Verwijderen:
  - `layout/sidebar/sidebar.component.ts`
  - `sidebar-header/`, `sidebar-nav/` (incl. `sidebar-nav-item`), `sidebar-footer/`
  - `layout/sidebar.service.ts`

  **Niet** `audio/session-list-sidebar.component.ts`; die wordt wel gebruikt. Haal ook het "Verhaal"-nav-item uit de sidebar dat #69 daar toevoegde (het staat al in de nav-rail).
- [x] **D10.** Batch-transcriptie in `audio/services/audio-backend-operations.service.ts`:
  - `retranscribeAudio()` (`:77-102`) roept `transcribeAudioBatch` aan, een backend-functie die niet bestaat, en heeft 0 aanroepers.
  - `listenToRetranscribeProgress`, `listenToRegenerateStoryProgress`, hun private mappers en de types `Retranscribe*`/`RegenerateStory*` (allemaal `@deprecated`, ticket #43).

  De service houdt alleen `regenerateStory()` over.
- [x] **D11.** `transcriptionBatch` overal weg:
  - `audio-session.component.ts:204-220` (`hasActiveBackgroundJob`, `backgroundJobMessage`)
  - `TranscriptionBatchMetadata` en de stages `batch-submitted`, `batch-processing`, `retranscribing`, `regenerating-story` in `audio-session.models.ts`
  - de mapping in `session-progress-card.component.ts:161-165`
- [x] **D12.** Het legacy retry-pad in `audio-session.component.ts` (~`:556-600`, `callTranscribeAudioFast`, `collectSegmentFileUris`) samen met `TranscriptionFastMetadata.segments` en `AudioSegmentRecord`. Retry gaat via de bestaande `transcribeAudioFast`-callable met `storagePath` in `audio-complete-processing.service.ts:131`. Zonder opgeslagen opname toont de UI een duidelijke melding ("Geen opgeslagen audio; upload de opname opnieuw") in plaats van een retry-knop.
- [x] **D13.** `audio/services/audio-utilities.ts` (0 importers, overblijfsel van client-side transcriptie).
- [x] **D14.** `AudioCompleteProcessingService.listenToProgress()` (`audio-complete-processing.service.ts:156-177`, 0 aanroepers).
- [x] **D15.** `features/character-builder/components/character-drawer/character-drawer.component.ts`: geen gebruikers, geen route.
- [x] **D16.** `campaign/campaign-invite.service.ts`: nooit geïnjecteerd, en de user-by-email-query dupliceert `campaign.service.ts:252-254`.
- [x] **D17.** Ongebruikte utils en modellen (0 importers buiten specs):
  - `core/utils/timestamp.util.ts`
  - `core/utils/streaming-response.utils.ts`
  - `core/models/utils/type-utils.ts`
  - `prompts/dnd-character-assistant.prompt.ts`
  - `core/models/schemas/index.ts`
- [x] **D18.** Zod-schema's (beslissing: verwijderen):
  - `user.schema.ts`, `kanka.schema.ts`, `campaign.schema.ts` en hun specs.
  - `audio-session.schema.ts` (281 regels): verplaats `UploadProgress` en `UnifiedProgress` als gewone interfaces naar `audio-session.models.ts` (re-export op `:265`) en verwijder het schema.
  - Controleer daarna of `zod` nog ergens in `src/` gebruikt wordt. Zo niet, haal het uit de frontend-dependencies (niet uit `functions/` als de backend het gebruikt).
- [x] **D19.** Ongebruikte publieke servicemethodes:
  - `UserService.refreshProfile` (lege no-op)
  - `AiSettingsService.getSettings`, `getError`, `getCharacterChatConfig`
  - `CharacterService.linkCampaign`, `unlinkCampaign`
  - `ChatService.clearHistory`
  - `PodcastAudioService.playPodcastMP3` + `stopPlayback` + `currentAudio`
  - `CampaignService.getUserRole`, `updateCampaignSettings`
  - `CampaignContextService.canCreateSessions`
  - `UserProfileService.getProfile` (zie C8)
- [x] **D20.** Ongebruikte legacy-velden op `AudioSessionRecord`/`AudioUpload` (`audio-session.models.ts`):
  - `storageUrl`, `activeTranscriptionId`
  - `transcriptions` / `TranscriptionRecord` / `TranscriptionChunk`
  - `StorageMetadata` / `storageMetadata`
  - `AudioUpload.transcriptionMode`

---

## Fase E — E-mail-login in `sign-in-page` (beslissing: inbouwen)

**Huidige situatie:**
- `src/app/auth/sign-in-page.component.ts` toont alleen "Sign in with Google".
- `auth-button.component.ts` (109 regels) en `sign-in-modal.component.ts` (239 regels) hebben de volledige e-mailflow (inloggen, registreren, wachtwoord vergeten), maar `app-auth-button` wordt nergens gebruikt.
- `AuthService.signInWithEmail`, `signUpWithEmail`, `sendPasswordReset` en `authError` bestaan en werken.
- De Email/Password-provider staat aan in de Firebase console.

**Implementatie:**
- [x] Smart `SignInPageComponent` houdt de state (`mode: 'signin' | 'signup' | 'reset'`, loading, error, success) en roept `AuthService` aan. Na een succesvolle login of registratie: `router.navigate(['/'])`, net als bij Google.
- [x] Nieuw dumb component `EmailAuthFormComponent` (`src/app/auth/email-auth-form.component.ts`):
  - **Reactive form** (projectregel), met `email` (required, email) en `password` (required, min 6, niet bij reset).
  - Inputs `mode`, `loading`, `error`, `success`; outputs `submitted({email, password})` en `modeChange(mode)`.
  - OnPush, `input()`/`output()`, geen `ngClass`.
  - Laat de markup aansluiten op de bestaande stijl van de sign-in-page (wit kaartje, Tailwind).
- [x] Layout: de Google-knop bovenaan, dan een scheiding "of", dan het e-mailformulier. Daaronder links "Account aanmaken" / "Wachtwoord vergeten?" / "Terug naar inloggen".
- [x] Teksten: neem de bestaande Engelse teksten van de sign-in-page over, zodat de pagina consistent blijft. *(Als je liever Nederlands wilt: één keer omzetten voor de hele pagina.)*
- [x] De foutmeldingen komen uit `AuthService.getErrorMessage` (al aanwezig). Gebruik één bron: de pagina gebruikt `authService.authError()` óf vangt de throw op, niet beide.
- [x] Na registratie wordt het profiel aangemaakt via `CampaignContextService` → `userProfileService.ensureProfile(user)`. Controleer dat dit ook voor e-mailgebruikers zonder `displayName`/`photoURL` werkt (fallback: `displayName` = deel van het e-mailadres vóór de `@`).
- [x] Verwijder `auth-button.component.ts` en `sign-in-modal.component.ts` (de logica is verhuisd).
- [x] Specs: formuliervalidatie, mode-switch, submit roept de juiste `AuthService`-methode aan, de reset toont een succesmelding, een fout wordt getoond.

---

## Fase F — Projectregels

- [x] Expliciete `standalone: true` weghalen (5 bestanden):
  - `loading.component.ts:6`
  - `character-draft-preview.component.ts:9`
  - `character-version-history.component.ts:7`
  - `character-builder-page.component.ts:23`
  - (`character-drawer.component.ts:7` vervalt via D15)
- [x] `ChangeDetectionStrategy.OnPush` toevoegen: `loading.component.ts`, `character-draft-preview`, `character-version-history`. Controleer na OnPush dat deze componenten nog verversen; ze moeten signals of inputs gebruiken.
- [x] `src/main.ts:10`: `console.error` in de bootstrap-`.catch`. Laat dit staan (de logger is dan mogelijk nog niet beschikbaar) en zet er een korte comment bij.
- [x] Backend: na D1 mag `grep -rn "console\.error" functions/src --include=*.ts | grep -v spec` niets meer opleveren.

---

## Technische details

### Volgorde van uitvoering (aanbevolen)
1. **A6** `access.ts` en **A7** CORS-config. De rest bouwt hierop.
2. **A1-A5** beveiligingsfixes (met D6 en D2, die erbij horen).
3. **C1** Gemini-client, dan **C3** resolve en **C2** podcast-orkestratie (met B5).
4. **D** dead code, backend en frontend (D10-D12 samen met het retry-pad).
5. **C5-C8** frontend-duplicatie (met B1, B6, B7).
6. **B2-B4, B8-B9** overige consistentie.
7. **E** e-mail-login.
8. **F** projectregels.
9. Build, lint en tests (zie Verificatie).

### Bestanden die nieuw zijn
- `functions/src/utils/access.ts` (+ spec)
- `functions/src/config/cors.ts`
- `functions/src/utils/gemini-client.ts` (+ spec)
- `functions/src/utils/storage-url.ts`, `utils/ffmpeg.ts`, `utils/session-ref.ts`
- `functions/src/podcast/run-podcast-generation.ts` (+ spec)
- `functions/src/character/resolve-character-entry.ts` (+ spec)
- `src/app/shared/components/podcast-version-item.component.ts` (+ spec)
- `src/app/shared/utils/date.utils.ts` (+ spec)
- `src/app/auth/email-auth-form.component.ts` (+ spec)

### Callable-contracten die veranderen (frontend mee aanpassen)
| Callable | Wijziging |
|---|---|
| `transcribeAudioFast` | `fileUri`/`fileUris` vervallen; alleen `storagePath` |
| `storyGenerationWorker` | `transcriptionText` (en `kankaContext`) vervallen; server leest zelf |
| `generatePodcastAudio` | `podcastVersion` en `script` vervallen; server alloceert de versie. Check of de client de story-tekst meestuurt; zo ja, laten vallen |
| `generateImage` | `model` en `systemPrompt` van de client worden genegeerd of geweigerd; `referenceImageStoragePath` beperkt |
| Alle | Nieuwe `permission-denied`-fouten voor niet-leden/niet-eigenaren |

De frontend moet bij `permission-denied` een nette toast tonen, niet alleen loggen.

### Tests
- Elke beveiligingsfix krijgt een negatieve test: niet ingelogd → `unauthenticated`; niet-lid of niet-eigenaar → `permission-denied`; een id met `/` → `invalid-argument`.
- Bestaande specs van verwijderde code gaan mee weg. Specs van samengevoegde code worden naar de gedeelde implementatie verplaatst, niet gedupliceerd.

### Verificatie
In parallel (Haiku-subagents, conform CLAUDE.md):
```bash
npm run build
npm run build:backend
npm run lint
npm run test
```
Extra checks:
```bash
grep -rn "key=\${" functions/src --include=*.ts                 # leeg (A1)
grep -rn "from './index'" functions/src --include=*.ts          # leeg (A7)
grep -rn "transcribeAudioBatch\|transcriptionBatch" src functions/src --include=*.ts   # leeg
grep -rn "app-sidebar\b\|app-auth-button\|app-sign-in-modal" src --include=*.ts        # leeg
grep -rn "standalone: true" src --include=*.ts                  # leeg
```

### Deploy (handmatig, na merge)
1. `firebase deploy --only functions` (veel functies wijzigen; `storyGenerationWorker` krijgt een nieuwe signatuur) + hosting.
2. **Roteer `GOOGLE_AI_API_KEY`**: maak een nieuwe key in Google AI Studio / Cloud Console, `firebase functions:secrets:set GOOGLE_AI_API_KEY`, redeploy de functions, en trek de oude key in. Het lek bestond in productie, dus ga ervan uit dat de oude key gecompromitteerd kan zijn.
3. Controleer in Sentry dat het aantal events per pipelinefout daalt (B3, B4).

---

## Risico's en aandachtspunten

- **Strengere rechten kunnen bestaande flows breken**, als een lid nu iets doet wat alleen de eigenaar mag (bijv. audio verwerken voor een sessie van een ander lid). Houd bij A3 het huidige UI-gedrag aan als maatstaf. Twijfel → lidmaatschap (niet eigenaarschap) vereisen en het in het PR-verslag melden.
- **De users-profile-fallback in `isCampaignMember`** (`users/{uid}.campaigns`) is een extra Firestore-read. Doe die alleen als de campagnedoc-check faalt.
- **Oude sessies zonder `audioRecording`** verliezen hun retry-knop (bewuste beslissing). Ze krijgen de melding uit D12.
- **OnPush op character-componenten** (F) kan verversingsproblemen geven als ze muterende objecten krijgen; handmatig testen in de character builder.
- **C2 (podcast-orkestratie)** is het grootste refactorstuk. De sessiepodcast moet functioneel identiek blijven, behalve de server-side versie-allocatie en de Nederlandse statusmeldingen.

## Buiten scope
- Het podcast-share-feature (autorisatie, dedup, intrekken, vervaldatum, validatie, duur) → **#71**.
- Nieuwe features of UI-redesigns.
- Migratie van bestaande Firestore-data (alleen code; legacy-velden in oude docs mogen blijven staan, de code leest ze gewoon niet meer).
