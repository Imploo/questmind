# Ticket #71: Podcast-share afmaken — dedup, intrekken, vervaldatum, auto-opruimen en validatie

**Created:** 2026-10-27
**Priority:** High
**Status:** Todo
**Effort:** 1-2 dagen
**Dependencies:** Bouwt voort op commit 7ff9788 ("shareable public podcast links with link previews"). Gebruikt `functions/src/utils/access.ts` uit #70 (fase A6). Als #71 eerder wordt opgepakt, maak die helper dan hier al aan volgens de specificatie in #70.
**Bron:** Code-review van 2026-10-27 op `functions/src/create-podcast-share.ts`.

---

## Beschrijving

Sinds 7ff9788 kan elk campagnelid een publieke link maken naar een sessiepodcast of een verhaalpodcast:
- `createPodcastShare` maakt een doc in `podcastShares/{randomId}`.
- `/share/podcast/:shareId` is een publieke spelerpagina.
- `podcastSharePage` voegt Open Graph-tags toe voor linkpreviews.

De review vond deze problemen:

1. **Dubbele shares mogelijk.** De dedup is check-then-create zonder transactie (`create-podcast-share.ts:100`). Bij een dubbelklik of bij twee leden tegelijk ontstaan twee shares voor dezelfde podcast.
2. **Een share is permanent.** Er is geen intrekken, geen vervaldatum, en de share wordt niet opgeruimd als de sessie, het verhaal of de podcast verdwijnt of opnieuw wordt gegenereerd. De share blijft dan een verouderde download-URL tonen, of audio publiceren die de eigenaar heeft weggehaald.
3. **Ids worden niet gevalideerd.** `campaignId` en `sessionId` komen zonder controle op `/` in Firestore-paden terecht (`:74`). Met `campaignId = 'c1/audioSessions/s1'` gebeurt de lidmaatschapscheck tegen het verkeerde document.
4. **De ledencheck wijkt af.** De eigen `isCampaignMember` (`:122`) verschilt van `firestore.rules` (mist de fallback `users/{uid}.campaigns`) en van de andere functions.
5. **Versievalidatie is te los.** `0`, negatieve getallen, `NaN` en kommagetallen worden geaccepteerd (`:68`). `NaN` geeft daarna een misleidende "nog niet klaar"-melding.
6. **`durationSec` is een schatting op basis van het aantal woorden** (`podcast-pipeline.ts:61`, woorden/150×60), niet de echte lengte van de MP3.
7. **Opmaakfout** `?{` op `:84`.

## Verwacht resultaat

- Per podcastversie bestaat er hooguit één actieve share, ook bij gelijktijdige aanroepen.
- Een share kan worden ingetrokken met een knop "Link intrekken", door de maker of door de campagne-eigenaar.
- Een share verloopt automatisch **90 dagen** na aanmaak.
- Een share verdwijnt automatisch als de bron verdwijnt of verandert: sessie of verhaalversie verwijderd, campagne verwijderd, podcastversie verwijderd of opnieuw gegenereerd (andere `audioUrl`), of status niet meer `completed`.
- Een ingetrokken, verlopen of opgeruimde link toont op de sharepagina "Deze link bestaat niet (meer)" (HTTP 404 bij `podcastSharePage`).
- Alle invoer wordt gevalideerd; de ledencheck gaat via de gedeelde `access.ts`.
- De getoonde duur is de echte lengte van de audio.

## Genomen beslissingen (met de gebruiker afgestemd, 2026-10-27)

| Onderwerp | Beslissing |
|---|---|
| Wie mag delen | **Elk campagnelid** (huidig gedrag behouden), via de gedeelde `assertCampaignMember` |
| Intrekken | **Alle drie:** een knop "Link intrekken" + een vervaldatum + automatisch opruimen bij verwijderen of regenereren |
| Wie mag intrekken | De maker van de share (`createdBy`) of de campagne-eigenaar *(aanname; zie Open vragen)* |
| Vervaltermijn | 90 dagen *(aanname; zie Open vragen)* |

---

## Technische details

### 1. Datamodel

**`podcastShares/{shareId}`** (backend schrijft, publiek `get`):
```ts
export interface PodcastShare {
  title: string;
  subtitle: string;
  audioUrl: string;
  durationSec: number | null;        // echte duur (zie §7), null als onbekend
  campaignId: string;
  sourceDocPath: string;              // NIEUW: 'campaigns/c1/audioSessions/s1' of '.../campaignStories/v3'
  podcastVersion: number;             // NIEUW
  sourceKey: string;                  // behouden: `${sourceDocPath}#p${podcastVersion}`
  createdBy: string;
  createdAt: string;                  // ISO, zoals nu
  expiresAt: Timestamp;               // NIEUW: createdAt + 90 dagen (Firestore Timestamp, voor rules + TTL)
}
```

**`PodcastEntry` op het bron-doc** (`audioSessions/{id}.podcasts[]` en `campaignStories/{v}.podcasts[]`):
```ts
shareId?: string;                     // NIEUW: id van de actieve share, voor dedup en voor de UI
audioDurationSec?: number;            // NIEUW: echte duur (zie §7)
```

Constanten in `functions/src/podcast-share/podcast-share.config.ts`:
```ts
export const PODCAST_SHARES_COLLECTION = 'podcastShares';
export const PODCAST_SHARE_TTL_DAYS = 90;
```
Verplaats `create-podcast-share.ts` en `podcast-share-page.ts` naar `functions/src/podcast-share/`, zodat alle share-code bij elkaar staat. Pas de exports in `index.ts` aan; de functienamen blijven gelijk, zodat de Hosting-rewrite in `firebase.json` blijft werken.

### 2. Dedup met een transactie (fix voor punt 1)
In `createPodcastShare`, binnen `db.runTransaction`:
1. Lees het bron-doc en zoek de `PodcastEntry` met `version === podcastVersion`. Die moet `completed` zijn en een `audioUrl` hebben, anders `failed-precondition`.
2. Heeft de entry een `shareId`? Lees dan `podcastShares/{shareId}`. Bestaat die, is `expiresAt > now` en is `audioUrl` gelijk aan die van de entry, geef dan dat `shareId` terug (en schrijf niets).
3. Anders: genereer een nieuw random id (`randomBytes(16).toString('base64url')`, zoals nu), `tx.create(shareRef, share)` en zet `entry.shareId` via een transactionele update van de `podcasts`-array (lees-wijzig-schrijf binnen dezelfde transactie). Is er een oude share (verlopen of met een andere `audioUrl`), verwijder die dan in dezelfde transactie.

Hierdoor serialiseert Firestore gelijktijdige aanroepen op het bron-doc, dus er ontstaat nooit een tweede share. De query `where('sourceKey', '==', …)` vervalt.

> Let op met #70 B5: de sessiepodcast-flow schrijft de `podcasts`-array nu zonder transactie, met een verouderde kopie. Tot #70 B5 klaar is, kan een lopende podcastgeneratie `shareId` overschrijven. Dat is niet erg, want stap 2 valt dan terug op een nieuwe share en ruimt de oude op. Vermeld het wel in de PR. Na #70 B5 is het opgelost.

### 3. Validatie (fix voor punten 3, 4 en 5)
- `campaignId` en `sessionId` via `assertValidId` (niet leeg, string, geen `/`).
- `storyVersion` en `podcastVersion`: `Number.isInteger(v) && v >= 1`, anders `invalid-argument`.
- Precies één van `sessionId` / `storyVersion` (zoals nu).
- Lidmaatschap via `assertCampaignMember(db, campaignId, uid)` uit `utils/access.ts`, inclusief de fallback `users/{uid}.campaigns`, net als in `firestore.rules`. De lokale `isCampaignMember` verdwijnt.
- Opmaakfout `?{` op `:84` herstellen.

### 4. Intrekken: callable `revokePodcastShare`
```ts
interface RevokePodcastShareRequest { shareId: string }
```
- Auth vereist. `shareId` matcht `/^[\w-]{16,64}$/` (dezelfde regex als in `podcast-share-page.ts`).
- Lees de share; bestaat die niet, geef dan `{ revoked: false }` terug (idempotent, geen fout).
- Toegestaan als `share.createdBy === uid` óf als de gebruiker campagne-eigenaar is (`assertCampaignOwner` op `share.campaignId`). Anders `permission-denied`.
- In één transactie: de share verwijderen en `shareId` weghalen uit de bijbehorende `PodcastEntry` op `sourceDocPath` (alleen als die nog naar deze share wijst; een ontbrekend bron-doc is geen fout).
- `cors: SHARED_CORS` (na #70 A7: uit `config/cors.ts`), `wrapCallable`, `ensureAuthForTesting`.

### 5. Vervaldatum (90 dagen)
- `expiresAt = Timestamp.fromMillis(Date.now() + PODCAST_SHARE_TTL_DAYS * 86_400_000)` bij aanmaken.
- **Firestore rules:**
  ```
  match /podcastShares/{shareId} {
    allow get: if resource.data.expiresAt > request.time;
    allow list, write: if false;
  }
  ```
- **`podcastSharePage`** leest via de Admin SDK (dus zonder rules). Behandel een share met `expiresAt <= now` als niet gevonden (404, geen OG-tags).
- **`PodcastShareService.getShare`** (frontend): een permission-denied op een verlopen share wordt `null`, zodat de pagina "bestaat niet (meer)" toont en geen foutmelding.
- **Fysiek opruimen:** zet een Firestore TTL-policy op `podcastShares.expiresAt` (handmatige stap, zie Deploy). TTL-verwijdering kan tot ~24 uur achterlopen; de checks hierboven zorgen dat een verlopen share direct onbereikbaar is. Er komt geen eigen scheduled function.
- **Bestaande shares** (sinds 7ff9788, zonder `expiresAt`): eenmalig backfillen met een script `functions/scripts/backfill-podcast-share-expiry.ts` dat `expiresAt = createdAt + 90 dagen` zet en `sourceDocPath`/`podcastVersion` uit `sourceKey` afleidt. Zonder backfill weigeren de nieuwe rules deze shares (wat acceptabel is, maar dan werken de al verstuurde links direct niet meer). Draai het script vóór de rules-deploy.

### 6. Automatisch opruimen bij verwijderen of regenereren
Nieuwe Firestore-triggers in `functions/src/podcast-share/podcast-share-cleanup.ts`:

| Trigger | Pad | Actie |
|---|---|---|
| `onDocumentDeleted` | `campaigns/{campaignId}/audioSessions/{sessionId}` | shares `where('sourceDocPath','==', path)` verwijderen |
| `onDocumentDeleted` | `campaigns/{campaignId}/campaignStories/{versionId}` | idem |
| `onDocumentDeleted` | `campaigns/{campaignId}` | shares `where('campaignId','==', campaignId)` verwijderen |
| `onDocumentUpdated` | `campaigns/{campaignId}/audioSessions/{sessionId}` | zie hieronder |
| `onDocumentUpdated` | `campaigns/{campaignId}/campaignStories/{versionId}` | zie hieronder |

**Logica voor de update-triggers** (`findSharesToRevoke(before.podcasts, after.podcasts)`, een pure functie met spec):
- Bekijk elke entry in `before` met een `shareId`. Revoke als in `after`:
  - de entry met die `version` niet meer bestaat, of
  - `audioUrl` is veranderd (de podcast is opnieuw gegenereerd), of
  - `status !== 'completed'`.
- **Early return** als `before.podcasts` en `after.podcasts` geen enkele `shareId` bevatten. Deze triggers vuren bij elke voortgangsupdate van een sessie, dus de check moet goedkoop zijn (geen reads).
- Verwijder alleen het share-doc. **Schrijf niet terug naar het bron-doc**; dat zou de trigger opnieuw laten vuren. Een achterblijvende `shareId` op de entry is onschadelijk, want stap 2 van §2 controleert of de share nog bestaat.
- Firestore-indexen: `sourceDocPath` en `campaignId` zijn single-field queries, die standaard al geïndexeerd zijn.

Fouten gaan naar Sentry via `captureFunctionError`.

### 7. Echte duur (fix voor punt 6)
- In `functions/src/utils/podcast-tts.ts` is de PCM-buffer bekend (16-bit mono): `durationSec = Math.round(pcmBuffer.length / 2 / sampleRate)`. Geef die terug naast de MP3-buffer.
- Beide podcast-flows (sessie en verhaal) slaan `audioDurationSec` op de `PodcastEntry` op. Bij #70 C2 gebeurt dat in de gedeelde orkestratie.
- `createPodcastShare` gebruikt `podcast.audioDurationSec ?? null`. Valt **niet** terug op de geschatte `duration`.
- Frontend: het podcast-versiecomponent (#70 C5, of de huidige drie plekken) toont `audioDurationSec` als die er is, en anders de schatting met "~" ervoor.

### 8. Frontend
- **`PodcastShareService`:**
  - `revokeShare(shareId)` roept `revokePodcastShare` aan.
  - `getShare` vangt permission-denied op en geeft `null` terug (§5).
  - `PodcastShare` krijgt `expiresAt`.
- **`PodcastShareButtonComponent`** (dumb blijft niet haalbaar, want het injecteert al services; houd het als klein smart component):
  - Nieuwe input `shareId` (uit `podcast.shareId`) en `canRevoke` (de parent berekent: huidige gebruiker is campagne-eigenaar, of de huidige gebruiker is `createdBy`). Omdat `createdBy` alleen op het share-doc staat: sla bij het aanmaken ook `sharedBy` op de `PodcastEntry` op. Dan hoeft de UI niets extra te lezen.
  - Is er een `shareId`, toon dan "🔗 Link kopiëren" (het bestaande gedrag, dat dezelfde share teruggeeft) en, als `canRevoke`, een tweede knop "Link intrekken" met een bevestiging ("Iedereen met deze link verliest toegang. Doorgaan?"). Na het intrekken een toast "Link ingetrokken".
  - Tekst bij het kopiëren uitbreiden: "Link gekopieerd — geldig tot {datum}."
- **`PodcastSharePageComponent`:** de melding "Deze link bestaat niet (meer)" dekt ook verlopen en ingetrokken links. Optioneel: "Verloopt op {datum}" onder de speler.
- Gebruiksplekken (`podcast-library`, `session-story`, `campaign-story-podcasts`) geven `shareId`, `sharedBy` en `canRevoke` door. Als #70 C5 al klaar is, gebeurt dat op één plek in `app-podcast-version-item`.

### 9. Firestore rules (sessies)
`audioSessions` is schrijfbaar door de sessie-eigenaar (`firestore.rules:124`). Een client kan dus zelf `shareId`/`sharedBy` op een entry zetten. Dat is onschadelijk: de share-doc is de bron van waarheid, en `revokePodcastShare` controleert `createdBy` op het share-doc, niet op de entry. Geen rules-wijziging nodig voor de bron-docs.

---

## Tests

**Backend (`functions/src/podcast-share/*.spec.ts`):**
- `createPodcastShare`:
  - niet ingelogd → `unauthenticated`; niet-lid → `permission-denied`; lid via de fallback `users/{uid}.campaigns` → ok
  - `campaignId`/`sessionId` met `/` → `invalid-argument`; `podcastVersion` `0`, `-1`, `1.5` of `NaN` → `invalid-argument`
  - podcast niet `completed` → `failed-precondition`
  - tweede aanroep → hetzelfde `shareId`
  - bestaande share verlopen → nieuwe share, de oude verwijderd
  - bestaande share met een andere `audioUrl` → nieuwe share, de oude verwijderd
  - `expiresAt` = nu + 90 dagen; `durationSec` = `audioDurationSec` of `null`
- `revokePodcastShare`:
  - maker → ok; campagne-eigenaar → ok; ander lid → `permission-denied`
  - onbekende share → `{ revoked: false }`
  - `shareId` wordt van de entry gehaald
- `findSharesToRevoke`: entry verwijderd, `audioUrl` gewijzigd, status gewijzigd, niets gewijzigd, geen shares (early return).
- Delete-triggers verwijderen de juiste shares (met een mock van de query).
- `podcastSharePage`: een verlopen share → 404 zonder OG-tags.
- `podcast-tts`: de duurberekening voor een bekende buffer en sample rate.

**Frontend:**
- Share-knop: de revoke-knop is alleen zichtbaar met `canRevoke`; bevestigen roept `revokeShare` aan; annuleren doet niets.
- `getShare`: permission-denied → `null`.

## Verificatie
In parallel (Haiku-subagents, conform CLAUDE.md):
```bash
npm run build
npm run build:backend
npm run lint
npm run test
```
Handmatig in de emulator:
1. Twee keer snel op "Delen" klikken → één doc in `podcastShares`.
2. "Link intrekken" → de sharepagina toont "bestaat niet (meer)"; een WhatsApp-preview geeft geen titel.
3. Podcast opnieuw genereren → de share is weg.
4. Sessie verwijderen → de share is weg.
5. `expiresAt` handmatig in het verleden zetten → de pagina toont "bestaat niet (meer)".

## Deploy (handmatig)
1. **Backfill-script** draaien tegen productie (vóór de rules).
2. `firebase deploy --only functions,firestore:rules` + hosting.
3. **TTL-policy** aanzetten (eenmalig):
   ```bash
   gcloud firestore fields ttls update expiresAt \
     --collection-group=podcastShares --enable-ttl --project=<project-id>
   ```

## Bekende beperking
De share wijst naar de getokeniseerde Storage-URL van de MP3. Wie die URL (niet de sharelink) al heeft gekopieerd, kan de MP3 blijven downloaden, ook na intrekken of verlopen. Alleen het roteren van het download-token sluit dat af, maar dan moet de `audioUrl` in de app ook worden bijgewerkt. **Buiten scope.** Eventueel een vervolgticket als dit belangrijk blijkt.

## Open vragen (aannames in dit ticket; bevestigen of aanpassen)
1. **Vervaltermijn:** 90 dagen. Moet dat korter of langer, of moet de deler het kunnen kiezen?
2. **Wie mag intrekken:** de maker van de share en de campagne-eigenaar. Moet de sessie-eigenaar het ook kunnen voor shares van zijn of haar sessie?
3. **Na verlopen:** mag een lid daarna gewoon een nieuwe link maken (huidige aanname: ja, met een nieuw id)?
