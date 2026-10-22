# Ticket #69: Campaign-verhaal — geversioneerd totaalverhaal van alle sessies (+ podcast per versie)

**Created:** 2026-10-22
**Priority:** Medium
**Status:** Done
**Effort:** 4-6 dagen
**Dependencies:** Bouwt voort op de sessie-story pipeline (#54, `story-generator.service.ts`) en de podcast-pipeline (#66, `generate-podcast-audio.ts` / `podcast-tts.ts`)

---

## Implementatie-status (afgerond — 2026-10-22)

**Geïmplementeerd:**
- Backend `functions/src/generate-campaign-story.ts` → callable `generateCampaignStory` (alleen campaign-owner, `timeoutSeconds: 540`). Bronselectie in `campaign-story/campaign-story-sources.ts` (alleen `status: 'completed'` + niet-lege `content`, sortering `sessionDate` → `createdAt`-fallback/tiebreak, `skippedSessions` met reden). Versie-allocatie in een transactie op `campaign.campaignStory.latestVersion` met `tx.create()`, zodat een verloren teller nooit een bestaande versie kan overschrijven. Weigert met `failed-precondition` bij een lopende generatie (< 15 min) of zonder bruikbare sessies. Fouten → `status: 'failed'` op het versiedoc + `captureFunctionError`.
- Prompt `prompts/campaign-story-generator.prompt.ts` (doel ~1.200 woorden, geklemd op 500-1.800, kopjes per verhaalboog en nooit per sessie, slotalinea "Waar staan we nu?", JSON `{ title, content }`). Generator `campaign-story/campaign-story-generator.service.ts` met `responseSchema`; woordtelling buiten [400, 2.200] → warn + Sentry, geen retry.
- AI settings: `campaignStory` default (`gemini-3.8-flash`, 16384 tokens, `targetWords: 1200`) via `getCampaignStoryConfig()`; in admin een blok "Campaign-verhaal" met een extra veld "Doel (woorden)".
- Podcast-refactor: gedeelde module `podcast/podcast-pipeline.ts` (`generatePodcastScript`, `parseScriptResponse`, `upsertPodcast`, `uploadPodcastMp3`). `generatePodcastAudio` (sessie) gebruikt die zonder gedragswijziging. `getPodcastScriptPrompt(max, kind)`: `'session'` is byte-identiek aan vóór dit ticket (handmatig geverifieerd); `'campaign'` krijgt een terugblik-framing.
- Callable `generateCampaignStoryPodcast` (`{ campaignId, storyVersion }`): alleen owner, alleen voor completed versies, dezelfde `podcastScript`- en `podcastVoices`-instellingen. Opslag in `podcasts[]` op het versiedoc, MP3 in `campaigns/{id}/campaign-story-podcasts/v{n}/p{m}.mp3`.
- Rules: `campaigns/{id}/campaignStories/{versionId}` (members lezen, client-writes geweigerd) en het Storage-pad voor verhaal-podcasts (members lezen, alleen backend schrijft).
- Frontend `src/app/campaign-story/`: `CampaignStoryPageComponent` (smart), `CampaignStoryViewComponent`, `CampaignStoryVersionsDrawerComponent` (sluit via Esc en via een klik op de overlay), `CampaignStoryPodcastsComponent`, `CampaignStoryService` + `CampaignStoryRepository` (realtime, nieuwste eerst), staleness-hint via `countChangedSessions()`. Route `/campaign/:id/story`, nav-item "Verhaal" in nav-rail en sidebar.
- Tests: bronselectie, prompt (incl. podcast-kinds), response-parsing, beide callables (auth/owner/precondition/allocatie/fout-pad); frontend utils, drawer en view.

**Afwijkingen t.o.v. de technische details hieronder:**
- Het podcast-versienummer wordt server-side in een transactie gealloceerd. De client stuurt geen `podcastVersion` mee.
- Geen `script`-parameter om alleen de audio opnieuw te genereren (geen UI voor nodig).
- `ProgressTrackerService` is niet gegeneraliseerd. De voortgang van verhaal-podcasts staat op de `PodcastEntry` zelf, die van het verhaal op het versiedoc.
- De podcast-player is een eigen dumb component, niet uitgetrokken uit `session-story.component.ts`.
- `storyUpdatedAt` is weggelaten uit de bron-snapshot. `storyVersion` (`storyRegenerationCount`) is genoeg voor de staleness-check.
- `updatedAt` op het campaign-doc wordt bewust niet geschreven: het frontend-schema verwacht daar een ISO-string.

**Nog te doen (handmatig):** de kwaliteitstest uit het testplan met echte Gemini-runs (lengte, chronologie, framing en duur van de podcast).

**Deploy:** `firebase deploy --only functions,firestore:rules,storage` plus hosting.

---

## Beschrijving

Per audiosessie bestaat er nu een gegenereerd sessieverhaal (`content` op `campaigns/{campaignId}/audioSessions/{sessionId}`), plus optioneel podcasts. Wat ontbreekt: een **totaalverhaal van de hele campaign**. Daarmee kun je in één keer teruglezen wat de party tot nu toe heeft meegemaakt, zonder elke sessie apart te openen.

Dit ticket voegt een **campaign-verhaal** toe:

- Het verhaal is een **samenvatting** van alle sessieverhalen in **chronologische volgorde** (op basis van `sessionDate`).
- Het moet goed leesbaar blijven: ongeveer **1 tot 3 A4** (zie lengte-afspraken hieronder), ongeacht hoeveel sessies er zijn.
- Het verhaal wordt **geversioneerd** opgeslagen. Elke generatie levert een nieuwe versie op en oude versies blijven leesbaar.
- Oude versies zijn bewust **niet prominent**: ze zitten achter een knopje rechtsboven dat een **drawer met versies** opent.
- Er is een knop om **direct een nieuw verhaal te genereren**.
- Van elke verhaalversie kan een **podcast** gegenereerd worden, met de **normale podcast-instellingen** (dezelfde stemmen, dezelfde `maxCharacters`-limiet en dus vergelijkbare duur als een sessie-podcast).

---

## Expected result

1. In de navigatie (nav-rail én sidebar) staat een nieuw item **"Verhaal"** dat naar `/campaign/:campaignId/story` gaat.
2. De pagina toont de **nieuwste versie** van het campaign-verhaal: titel, versienummer, datum van generatie en het aantal verwerkte sessies, met daaronder het verhaal zelf.
3. Rechtsboven staat een klein, onopvallend icoonknopje (bijv. een "history"/klok-icoon met tooltip "Versies"). Dat opent een **drawer** van rechts met alle versies (nieuwste bovenaan). Klik op een versie en die wordt in de hoofdweergave getoond. Een duidelijke badge laat zien dat je een oudere versie bekijkt, met een link "Terug naar nieuwste".
4. Er is een knop **"Nieuw verhaal genereren"**. Die start een nieuwe generatie, toont de voortgang en laat na afloop automatisch de nieuwe versie zien.
5. Bij een geselecteerde versie staat een knop **"Podcast genereren"**. De podcast(s) van die versie zijn op de verhaalpagina af te spelen, met dezelfde player-ervaring als bij sessie-podcasts.
6. **Alleen de campaign-owner** ziet en gebruikt de generate-knoppen (verhaal en podcast). Andere members kunnen alle versies en podcasts lezen en afspelen.
7. Zijn er sessies bijgekomen of gewijzigd sinds de getoonde nieuwste versie, dan ziet de owner een subtiele hint: "2 nieuwe/gewijzigde sessies sinds deze versie".
8. Een campaign zonder sessies met een afgerond verhaal toont een lege staat ("Nog geen sessieverhalen om samen te vatten"). De generate-knop is dan uitgeschakeld.
9. De bestaande **Podcast library** blijft alleen voor sessie-podcasts. Campaign-verhaal-podcasts verschijnen daar **niet**.

---

## Gemaakte keuzes (afgestemd met gebruiker)

| Vraag | Keuze |
|-------|-------|
| Plek in de UI | Eigen nav-item **"Verhaal"**, route `/campaign/:campaignId/story` |
| Wie mag genereren | **Alleen de campaign-owner** (`campaign.ownerId`); alle members kunnen lezen |
| Generatie-strategie | **Altijd volledig opnieuw** uit alle sessieverhalen (niet incrementeel op de vorige versie) |
| Waar staan de podcasts | **Alleen op de verhaalpagina**, niet in de Podcast library |

Verder vastgelegd uit de oorspronkelijke vraag:
- Versies achter een knopje rechtsboven → drawer. Bewust niet te prominent.
- Podcast met de normale podcast-instellingen (stemmen, `maxCharacters`) en dus vergelijkbare duur.
- Chronologie op basis van de sessiedatum.

---

### Aanvullende keuzes (open punten, bevestigd door gebruiker op 2026-10-22)

1. **Lengte:** doel **~1.200 woorden**, minimum ~500, maximum ~1.800 (één A4 is ongeveer 500-600 woorden). Het verhaal schaalt mee met het aantal sessies: bij 1-2 sessies is ~1 A4 genoeg, bij veel sessies gaat het naar ~3 A4 en wordt er per sessie strenger samengevat. Het doel is configureerbaar via `settings/ai.features.campaignStory.targetWords`, dus bij te stellen zonder deploy.
2. **Kanka-context:** wordt **niet** meegestuurd. De sessieverhalen zijn al met Kanka-context gegenereerd, dus namen en spelling zijn daar al gecorrigeerd. Extra context maakt de prompt groter en verleidt het model om dingen toe te voegen die niet in de sessies gebeurd zijn.
3. **Titel van een versie:** het model levert een korte titel mee (bijv. "De val van Grauwhaven") en de UI toont daarnaast "Versie 3 — 22 okt 2026".
4. **Verwijderen van versies:** buiten scope. Versies zijn klein (tekst) en de historie is juist het doel.
5. **Hoofdstukindeling:** het model mag `##`-tussenkopjes gebruiken per verhaalboog of fase, maar **niet** per sessie. Een kopje per sessie maakt het een opsomming in plaats van één doorlopend verhaal.

---

## Technische details

### Huidige situatie (relevante code)

| Onderdeel | Bestand | Relevant |
|-----------|---------|----------|
| Sessieverhaal (frontend model) | `src/app/audio/services/audio-session.models.ts` → `SessionStory` / `AudioSessionRecord` | `content` = gegenereerd verhaal, `sessionDate?: string` (`YYYY-MM-DD` uit `<input type="date">`), `createdAt`, `storyRegenerationCount`, `rawStory` (= geannoteerd gesprekslog, **niet** gebruiken) |
| Sessieverhaal generatie | `functions/src/story/story-generator.service.ts`, `functions/src/prompts/session-story-generator.prompt.ts` | Patroon voor Gemini-call + `PreviousStory`-type (`title`, `sessionDate`, `content`) |
| Podcast callable | `functions/src/generate-podcast-audio.ts` | Script-generatie → TTS → upload naar Storage → `podcasts[]` op sessiedoc. Checkt **sessie**-owner (`sessionData.ownerId`) |
| Podcast TTS | `functions/src/utils/podcast-tts.ts` → `generatePodcastAudioBuffer()` | Herbruikbaar zoals het is |
| Podcast prompt | `functions/src/prompts/podcast-script-generator.prompt.ts` → `getPodcastScriptPrompt(maxCharacters)` | Tekst gaat over "sessie recap"; heeft een campaign-variant nodig |
| AI settings | `functions/src/utils/ai-settings.ts` | `storyGeneration`, `podcastScript`, `podcastVoices` (`maxCharacters: 5000`) |
| Voortgang | `functions/src/services/progress-tracker.service.ts` | Hard gekoppeld aan `audioSessions/{sessionId}` |
| Frontend podcast | `src/app/audio/services/podcast-generation.service.ts`, `podcast-audio.service.ts` | `podcast-audio.service.ts` behandelt client-side `deadline-exceeded` als verwacht (commit `607a8c8`) |
| Navigatie | `src/app/layout/nav-rail/nav-rail.component.ts`, `src/app/layout/sidebar/sidebar.component.ts` | Items `audio` / `podcasts` + active-state logica |
| Routes | `src/app/app.routes.ts` | Children van `campaign/:campaignId` |
| Drawer-voorbeeld | `src/app/features/character-builder/components/character-drawer/`, `src/app/audio/session-list-sidebar.component.ts` | Bestaande DaisyUI-stijl drawers/sidebars |
| Rules | `firestore.rules`, `storage.rules` (`isCampaignOwner()` uit #68) | Er is nog geen match voor een campaign-story subcollectie, dus reads worden standaard geweigerd |

### Datamodel

Nieuwe subcollectie: `campaigns/{campaignId}/campaignStories/{versionId}` met `versionId = "v{version}"` (bijv. `v3`).

```ts
// functions/src/types/campaign-story.types.ts (+ frontend-tegenhanger met Zod-schema)
export type CampaignStoryStatus = 'generating' | 'completed' | 'failed';

export interface CampaignStorySourceSession {
  sessionId: string;
  title: string;
  sessionDate: string | null;      // YYYY-MM-DD, null als onbekend
  storyVersion: number;            // storyRegenerationCount ?? 1 op moment van genereren
  storyUpdatedAt?: string;         // storyRegeneratedAt ?? storyGeneratedAt
}

export interface CampaignStoryVersion {
  version: number;
  status: CampaignStoryStatus;
  title?: string;
  content?: string;                // markdown
  wordCount?: number;
  sourceSessions: CampaignStorySourceSession[];   // in gebruikte (chronologische) volgorde
  skippedSessions: { sessionId: string; title: string; reason: 'no_story' | 'failed' | 'processing' }[];
  createdBy: string;               // uid
  createdAt: Timestamp;
  completedAt?: Timestamp;
  modelUsed?: string;
  progress?: number;
  progressMessage?: string;
  error?: string | null;
  podcasts: PodcastEntry[];        // hergebruikt bestaand PodcastEntry-type
  latestPodcastVersion?: number;
}
```

Op het campaign-document (alleen door de backend geschreven):

```ts
campaignStory?: {
  latestVersion: number;           // teller voor versie-allocatie
  latestCompletedVersion?: number; // voor de UI: welke versie standaard tonen
}
```

**Versie-allocatie:** in een Firestore-**transactie** op het campaign-doc (`campaignStory.latestVersion + 1`). Het nieuwe `v{n}`-doc wordt in dezelfde transactie aangemaakt met `status: 'generating'`. Zo kunnen twee snelle klikken nooit hetzelfde versienummer krijgen. Daarnaast weigert de callable een nieuwe generatie zolang er nog een versie met `status: 'generating'` jonger dan ~15 min bestaat (`failed-precondition`).

**Waarom een subcollectie en geen array op het campaign-doc:** verhalen van 1.800 woorden × tientallen versies zouden het campaign-doc (1 MB-limiet) onnodig groot maken. Bovendien wordt dat doc overal in de app gelezen.

### Bronselectie & chronologie

1. Haal alle `audioSessions` van de campaign op.
2. **Neem mee:** sessies met een afgerond gegenereerd verhaal (`content` niet leeg en de status geeft een afgeronde story aan; check het precieze statusveld in `AudioSessionRecord`). Gebruik `content`, **niet** `rawStory`.
3. **Sla over** (en leg vast in `skippedSessions`): sessies zonder verhaal, met mislukte verwerking of nog in verwerking.
4. **Sortering:** op `sessionDate` (oplopend). Is die er niet, dan valt de sortering terug op `createdAt` (de uploaddatum). Bij gelijke datum geeft `createdAt` de doorslag. Sessies zonder `sessionDate` krijgen in de prompt "Datum onbekend (geüpload op …)".
5. Is er na filtering geen enkele bruikbare sessie, dan geeft de callable `failed-precondition` terug en wordt er geen versie aangemaakt.

### Prompt — `functions/src/prompts/campaign-story-generator.prompt.ts`

Nieuwe prompt (Nederlands, in lijn met de sessie-story prompt). Kernpunten:

- Input: de lijst sessies in chronologische volgorde, elk met `SESSIE {n} — {titel} — {datum}` en de volledige `content`.
- Taak: schrijf **één doorlopend verhaal** van de hele campaign tot nu toe. Het is een samenvatting, dus geen hervertelling van elke scène.
- **Lengte:** richt je op ~`{targetWords}` woorden (min ~500, max ~1.800). Hoe meer sessies, hoe compacter per sessie. Focus op wat het verhaal vooruit helpt: belangrijke beslissingen, wendingen, ontmoetingen met sleutel-NPC's, verloren/gewonnen dingen, open mysteries.
- **Chronologie:** behoud de volgorde van de sessies. Vroege sessies mogen compacter (die zijn al "geschiedenis"), recente sessies iets uitgebreider.
- **Trouw:** gebruik uitsluitend gebeurtenissen, namen en details uit de sessieverhalen. Verzin niets. Bij tegenstrijdigheden tussen sessies wint de latere sessie, en het model mag daar niet over speculeren.
- **Structuur:** markdown, `##`-tussenkopjes alleen per verhaalboog of fase (nooit per sessie), afsluiten met een korte "Waar staan we nu?"-alinea (open draden, huidige situatie van de party).
- **Output-formaat:** JSON `{ "title": string, "content": string }` via `responseMimeType: 'application/json'` + `responseSchema`. `title` is een korte, verhalende titel (max ~8 woorden).

`wordCount` wordt in de backend berekend en gelogd. Valt het buiten [400, 2.200], dan volgt een `logger.warn` en een Sentry breadcrumb, maar geen retry (houd het simpel; bijstellen kan via de settings).

**Inputgrootte:** 20 sessies × ~3.000 woorden ≈ 60k woorden ≈ 80k tokens. Dat past ruim in de Gemini-context. Een max-input-guard is dus niet nodig, maar log het aantal input-tokens (`usageMetadata`) voor het kostenbeeld.

### AI settings

In `functions/src/utils/ai-settings.ts` (+ types in `audio-session.types.ts` → `AISettings.features`):

```ts
campaignStory: { model: 'gemini-3.8-flash', maxOutputTokens: 16384, thinkingLevel: 'medium', targetWords: 1200 }
```

`targetWords` is een extra veld. Óf `AIFeatureConfig` krijgt een optioneel `targetWords`, óf er komt een aparte `CampaignStoryFeatureConfig extends AIFeatureConfig` (voorkeur, zoals `TranscriptionFeatureConfig`). In de admin-UI (`src/app/admin/admin.component.ts` + `ai-settings.service.ts`) komt een blok "Campaign-verhaal" volgens hetzelfde patroon als "Story generation".

### Backend

**1. Callable `generateCampaignStory`** — `functions/src/generate-campaign-story.ts`, geëxporteerd in `index.ts`.

- Request: `{ campaignId: string }`.
- Auth: ingelogd, en `campaignData.ownerId === auth.uid`, anders `permission-denied`.
- Flow: bronselectie → transactie (versie alloceren, doc `generating`) → Gemini-call → doc bijwerken naar `completed` (`content`, `title`, `wordCount`, `modelUsed`, `completedAt`) + `campaignStory.latestCompletedVersion` op het campaign-doc.
- Bij een fout: doc naar `failed` met `error`, `captureFunctionError('generateCampaignStory', …)`. **Geen `console.error`.**
- Net als `generatePodcastAudio`: `await` de verwerking zodat de function blijft leven. Zet `timeoutSeconds` ruim (bijv. 540) en zorg dat de client een `deadline-exceeded` als verwacht behandelt. De echte status komt uit Firestore.
- Voortgang: `progress` / `progressMessage` direct op het versiedoc (10% bronnen laden, 30% genereren, 90% opslaan, 100% klaar).

**2. Podcast van een verhaalversie** — callable `generateCampaignStoryPodcast`.

Om DRY te blijven wordt de kern van `generate-podcast-audio.ts` eerst uitgetrokken naar een service:

```ts
// functions/src/podcast/podcast-generation.service.ts
generatePodcastScript({ title, date, body, kind: 'session' | 'campaign' }): Promise<{ script; modelUsed }>
renderAndUploadPodcast({ script, storagePath, metadata, onProgress }): Promise<{ audioUrl; fileSize }>
```

- `generatePodcastAudio` (sessie) wordt een dunne wrapper om deze service. **Het gedrag blijft gelijk**, inclusief de sessie-owner check, het storage-pad en `ProgressTrackerService`.
- `generateCampaignStoryPodcast` request: `{ campaignId, storyVersion: number, podcastVersion: number, script?: PodcastScript }` (`script` optioneel, zoals bij sessies, voor regenereren alleen de audio).
- Auth: campaign-owner. Het verhaal moet `status: 'completed'` hebben.
- Instellingen: **dezelfde** `getPodcastVoiceConfig()` (stemmen + `maxCharacters`) en `getAiFeatureConfig('podcastScript')`. Er komen geen nieuwe podcast-settings bij, dus de duur is vergelijkbaar met een sessie-podcast.
- Opslag: `podcasts[]` op het versiedoc `campaigns/{cid}/campaignStories/v{n}` (`upsertPodcast`-logica hergebruiken, mee verhuisd naar de service). `storyVersion` in de `PodcastEntry` is het verhaalversienummer.
- Storage-pad: `campaigns/{campaignId}/campaign-story-podcasts/v{storyVersion}/p{podcastVersion}.mp3`.
- Voortgang: via `progress` / `progressMessage` in de `PodcastEntry` op het versiedoc. `ProgressTrackerService` is sessie-specifiek. Generaliseer die óf naar een `DocumentReference`-parameter, óf schrijf de voortgang direct via `updatePodcastEntry`. Voorkeur: generaliseren, zodat beide paden hetzelfde mechanisme gebruiken.

**3. Podcast-prompt variant.** `getPodcastScriptPrompt(maxCharacters, kind)`:
- `kind: 'session'` geeft de huidige tekst **byte-identiek** (unit test).
- `kind: 'campaign'` vervangt de sessie-specifieke framing ("sessie recap", "volgende sessie") door een "de campagne tot nu toe"-framing: terugblik op de grote lijnen, hoe de party veranderd is, open draden en speculatie over waar het heen gaat. Alle regels over toon, trouw aan het verhaal en de `maxCharacters`-limiet blijven gelijk.
- De user-part krijgt `CAMPAIGN STORY TITLE` / `GENERATED` / `CAMPAIGN STORY` in plaats van de `SESSION …`-labels.

### Firestore rules

```
match /campaigns/{campaignId}/campaignStories/{versionId} {
  allow read: if isCampaignMember(campaignId);
  allow write: if false;   // alleen backend (Admin SDK)
}
```

Controleer ook of de bestaande update-regel op `campaigns/{campaignId}` client-writes op `campaignStory.*` toestaat aan de owner. Dat is niet erg (het veld is alleen een teller), maar de backend blijft de bron van waarheid.

### Storage rules

```
match /campaigns/{campaignId}/campaign-story-podcasts/{storyVersion}/{filename} {
  allow read: if isCampaignMember(campaignId);
  allow write: if false;   // alleen backend
}
```

`isCampaignMember` bestaat al in `storage.rules`. **Deploy:** `firebase deploy --only firestore:rules,storage` naast de functions en de hosting.

### Frontend

**Route & navigatie**
- `app.routes.ts`: child `{ path: 'story', loadComponent: () => import('./campaign-story/campaign-story-page.component') … }` (lazy).
- `nav-rail.component.ts` + `sidebar.component.ts`: item `{ id: 'story', label: 'Verhaal', route: /campaign/:id/story, icon: 'book' }` tussen Audio en Podcasts, met de active-state check op het `story`-segment.

**Services (smart, `providedIn: 'root'`, `inject()`)**
- `CampaignStoryService`: realtime `versions` (query op `campaignStories`, `orderBy('version', 'desc')`) als signal via `toSignal`, `generate(campaignId)` en `generatePodcast(campaignId, storyVersion)`. Deadline-exceeded wordt als verwacht behandeld (zelfde aanpak als `podcast-audio.service.ts`). Fouten via `logger.error()` uit `shared/logger`.
- Staleness-berekening: vergelijk de `sourceSessions` van de nieuwste completed versie met de huidige bruikbare sessies (nieuw `sessionId` óf hogere `storyVersion`). Dat wordt een `computed()`.

**Componenten** (`src/app/campaign-story/`)
- `CampaignStoryPageComponent` (smart): bepaalt de geselecteerde versie (`signal<number | null>`, `null` = nieuwste completed), owner-check (`campaign.ownerId === currentUser.uid`), drawer open/dicht, en orkestreert de generatie.
- `CampaignStoryViewComponent` (dumb): `input()` versie → titel, meta ("Versie 3 · 22 okt 2026 · 7 sessies"), gerenderde markdown (hergebruik de markdown-rendering van `session-story.component.ts`), badge "Oudere versie" + output `backToLatest`.
- `CampaignStoryVersionsDrawerComponent` (dumb): `input()` versies + geselecteerde versie, `output()` `select` / `close`. Toont per versie nummer, datum, aantal sessies, status (generating/failed met foutmelding) en een podcast-indicator. Gebruik dezelfde DaisyUI-stijl als `character-drawer` / `session-list-sidebar`, met overlay en sluiten via Esc of een klik buiten de drawer (via het `host`-object, niet `@HostListener`).
- `CampaignStoryPodcastsComponent` (dumb): lijst van podcasts van de geselecteerde versie met player. Hergebruik de bestaande podcast-player-markup uit `session-story.component.ts` of trek die eerst uit naar een gedeelde dumb component (DRY).
- Header-layout: links de titel, rechts `[Nieuw verhaal genereren]` (alleen owner) + icoonknop "Versies" (voor iedereen).
- Tijdens het genereren: knop disabled met spinner en `progressMessage`. De nieuwe versie verschijnt automatisch via de realtime query.

Alle componenten: `ChangeDetectionStrategy.OnPush`, `input()` / `output()`, native control flow, geen `ngClass` / `ngStyle`, geen `standalone: true`. Raadpleeg de Angular MCP best practices tijdens de implementatie.

---

## Acceptatiecriteria

- [ ] Nav-item "Verhaal" in nav-rail en sidebar, met de juiste active-state.
- [ ] De owner kan een nieuw verhaal genereren. Het verschijnt als nieuwe versie en wordt automatisch getoond.
- [ ] Het verhaal volgt de chronologie van `sessionDate` (fallback `createdAt`) en gebruikt alleen sessies met een afgerond verhaal.
- [ ] Lengte valt bij een normale campaign binnen ~500-1.800 woorden.
- [ ] De versie-drawer opent via het knopje rechtsboven, toont alle versies en laat oudere versies lezen, met een duidelijke "oudere versie"-indicatie.
- [ ] De owner kan per versie een podcast genereren met de normale podcast-instellingen. Afspelen kan op de verhaalpagina.
- [ ] Non-owners zien geen generate-knoppen. De backend weigert hun calls met `permission-denied`.
- [ ] Gelijktijdig dubbel klikken levert geen dubbele versienummers of parallelle generaties op.
- [ ] Een staleness-hint verschijnt na het toevoegen of regenereren van een sessie.
- [ ] Sessie-podcasts werken ongewijzigd (regressie). De Podcast library toont geen campaign-podcasts.
- [ ] Firestore- en Storage-rules toegevoegd; client-writes op `campaignStories` geweigerd.
- [ ] Fouten via Sentry (`captureFunctionError` backend, `logger.error` frontend).
- [ ] `npm run build`, `npm run build:backend`, `npm run lint`, `npm run test` slagen.

---

## Testplan

### Unit tests (backend)
- Bronselectie: filtert sessies zonder verhaal of met een mislukte verhaalgeneratie, sorteert op `sessionDate` met `createdAt`-fallback en tiebreak, en vult `skippedSessions` correct.
- Prompt-builder: sessies in de juiste volgorde, datum "onbekend"-tekst, `targetWords` ingevuld.
- `getPodcastScriptPrompt(max, 'session')` is byte-identiek aan de huidige output.
- Callable: `permission-denied` voor non-owner, `failed-precondition` zonder bruikbare sessies of bij een lopende generatie, versie-allocatie verhoogt de teller.
- Refactor van de podcast-service: bestaande tests van `generate-podcast-audio` blijven groen.

### Unit tests (frontend)
- `CampaignStoryService`: staleness-`computed()` (nieuwe sessie, geregenereerde sessie, niets veranderd).
- Page component: owner ziet de knoppen, non-owner niet. Een versie selecteren toont de oudere-versie-badge.
- Drawer: emit `select` / `close`.

### Handmatige kwaliteitstest
- Campaign met 1 sessie, 5 sessies en (indien beschikbaar) 10+ sessies: leest het als één doorlopend verhaal, klopt de volgorde, en blijft de lengte binnen 1-3 A4?
- Sessie zonder datum: komt op een logische plek terecht.
- Podcast van een verhaalversie: framing "de campagne tot nu toe", duur vergelijkbaar met een sessie-podcast.

---

## Risico's

| Risico | Mitigatie |
|--------|-----------|
| Model hervertelt alles en wordt te lang bij veel sessies | Expliciete woordlimiet + instructie "compacter per sessie naarmate er meer zijn"; `targetWords` configureerbaar; woordtelling gelogd |
| Model verzint verbanden tussen sessies | Trouw-regels zoals in de podcast-prompt; Kanka-context bewust niet meegestuurd |
| Ontbrekende of foutieve `sessionDate` geeft een verkeerde volgorde | Fallback op `createdAt`; volgorde zichtbaar in de versie-metadata (`sourceSessions`) |
| Refactor van de podcast-pipeline breekt sessie-podcasts | Eerst refactoren zonder gedragswijziging + tests; byte-identieke prompt-test |
| Callable-timeout aan de client | Zelfde aanpak als sessie-podcast: `deadline-exceeded` als verwacht, status via Firestore |

---

## Buiten scope

- Verhaalversies verwijderen of hernoemen.
- Handmatig bewerken van het gegenereerde verhaal.
- Incrementele generatie (vorige versie + nieuwe sessies).
- Selectie van welke sessies meedoen (altijd alle bruikbare sessies).
- Campaign-podcasts in de Podcast library.
- Export naar PDF/Word.
- Gebruikerscorrecties (`userCorrections`) bij het campaign-verhaal; kan later als het nodig blijkt.
