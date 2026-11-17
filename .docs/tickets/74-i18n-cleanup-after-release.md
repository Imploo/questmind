# Ticket #74: Opruimen na de vertalingen — oude tekstvelden, controles na de deploy en kleine punten

**Created:** 2026-11-17
**Priority:** Low (deel B: doen bij de eerste deploy van #72)
**Status:** Todo
**Effort:** 1-1,5 dag, in losse delen
**Dependencies:** #72 moet live staan. Deel A kan pas **één release daarna**: tot die tijd kunnen er nog browsers open staan met de oude versie van de app.
**Bron:** De open punten uit de uitvoering van #72 (`./done/72-i18n-nl-en-language-choice.md`, sectie "Uitvoering"), de code-review en de tekstreview van 2026-11-17.

---

## Beschrijving

Ticket #72 heeft de app tweetalig gemaakt. Een paar dingen zijn daarbij bewust blijven liggen of konden niet worden gecontroleerd:

- De backend schrijft de oude tekstvelden nog, voor browsers die de oude app-versie open hebben.
- Een deel van #72 is alleen door tests gedekt en niet met echte data of een echte deploy bekeken.
- De reviews leverden kleine punten en tekstkeuzes op die een beslissing vragen.

Dit ticket verzamelt dat werk, zodat het niet verdwijnt. De delen staan los van elkaar en kunnen apart worden opgepakt.

## Verwacht resultaat

- De backend schrijft geen tekst meer die niemand toont; de bijbehorende velden en constanten zijn weg.
- Wat in #72 niet kon worden gecontroleerd, is na de deploy bekeken en afgevinkt of als bug gemeld.
- De kleine punten en tekstkeuzes zijn opgelost of bewust afgewezen.

---

## Deel A — Oude tekstvelden weghalen (na één release)

Sinds #72 toont de frontend geen backendtekst meer: hij vertaalt `stage`, `progressStep` en `reason` zelf. De oude velden worden nog geschreven voor clients met de oude app-versie. Die vallen weg zodra iedereen de nieuwe versie heeft; de app toont zelf een melding "nieuwe versie beschikbaar".

**Backend**
- [ ] `progressMessage` op podcast-entries niet meer schrijven: `podcast/run-podcast-generation.ts:88`, `:132`, `:146`, `:201`. De constante `PODCAST_MESSAGES` (`:57`) en het veld `message` in de voortgangsupdates (`:82`, `utils/podcast-tts.ts`) kunnen dan weg.
- [ ] `progressMessage` op campagneverhalen niet meer schrijven: `generate-campaign-story.ts:31-32` (`progressFields`) en `STEP_MESSAGES`.
- [ ] Het veld `progressMessage` uit de types: `types/audio-session.types.ts:169` en `types/campaign-story.types.ts:41`.
- [ ] `progress.message` op sessies: `services/progress-tracker.service.ts` schrijft het in `updateProgress` (`:36`), `markFailed` (`:75`) en `markCompleted` (`:104`); er zijn 16 aanroepers. Kies één van de twee:
  - het veld niet meer opslaan en de tekst alleen nog loggen (`:53`), of
  - het veld houden als logregel voor wie in de Firestore-console meekijkt.
- [ ] De tests bijwerken die op deze velden controleren.

**Frontend**
- [ ] `progressMessage` uit de modellen: `audio/services/audio-session.models.ts:77-78` (staat al als deprecated) en `campaign-story/campaign-story.models.ts:43`.
- [ ] De frontend schrijft zelf ook `progress.message` tijdens een upload: `audio/audio-upload-page.component.ts:109`, `audio/services/audio-complete-processing.service.ts:161` en de aanroepers van de functies op `:176` en `:217`, en `audio/services/session-progress.utils.ts:50,66,76`. Weghalen als het veld in de backend ook verdwijnt.

**Niet weghalen: de terugval op `status`.** #72 noemde "de terugval verwijderen", maar dat klopt niet helemaal. Podcasts en verhaalversies van vóór #72 hebben geen `progressStep` en krijgen die ook nooit. Voor die documenten blijft de vertaalde tekst per `status` nodig (`shared/components/podcast-version-item.component.ts:228-229`, `campaign-story/campaign-story.utils.ts:41-49`).

## Deel B — Controleren na de eerste deploy van #72

Deze punten zijn in #72 alleen door tests gedekt. Loop ze na op beta, in het Nederlands en in het Engels.

- [ ] **The Sidekick:** zet de taal op Engels en stel een vraag. Het antwoord, de titel van het gesprek en de samenvatting zijn Engels; speltermen blijven Engels. Zet de taal terug op Nederlands en controleer hetzelfde.
- [ ] **Ability-score-waarschuwingen** in de chat staan in de taal van het gesprek.
- [ ] **Voortgangskaart:** upload een opname van meer dan 35 minuten. De kaart toont per stap een vertaalde titel en tijdens het transcriberen "Segment x van y".
- [ ] **Podcast genereren:** de stappen en "Deel x van y" staan in de gekozen taal, bij een sessie en bij een campagneverhaal.
- [ ] **Mislukte stap:** forceer een fout (bijvoorbeeld een tweede verhaal starten terwijl er één loopt). De melding staat in de gekozen taal; een opgeslagen fout staat ingeklapt onder "Technische details".
- [ ] **Linkpreviews:** deel een podcast met de app op Engels en op Nederlands en plak de links in WhatsApp. Deel ook een karakter.
- [ ] **Uitnodigen en ledenbeheer** in de campagne-instellingen: de foutmeldingen staan in de gekozen taal.
- [ ] **Twee apparaten:** kies een taal op het ene apparaat; het andere volgt na herladen.
- [ ] **Oude data:** een sessie, een podcast en een verhaalversie van vóór #72 tonen een normale status en geen lege regel.

## Deel C — Kleine punten uit #72

- [ ] **Scrollen bij een taalwissel.** Een gesprek dat eindigt met een app-melding ("Karakter is aangepast!") scrolt naar beneden als de taal wisselt, omdat de lengte van die tekst verandert (`chat/chat.component.ts:629-633`, `lastMessageMark`). Laat de lengte van app-meldingen buiten het kenmerk.
- [ ] **Samenvatting in de versiegeschiedenis.** De eenregelige samenvatting van een chatwijziging (`functions/src/generate-character-draft.ts:176`) volgt de taal van het gesprek, niet de taalkeuze; `language` komt in die functie wel binnen. Geef de taal door aan `prompts/character-json-generator.prompt.ts:49`.
- [ ] **Naam in het manifest.** `public/manifest.webmanifest:2` zegt nog "QuestMind - AI-Powered Audio Journal". De beschrijving is in #72 gecorrigeerd, de naam niet. Let op: dit is de naam die een geïnstalleerde app toont.
- [ ] **Auth-fout zonder code.** `auth/auth.service.ts:181` toont `err.message` als een fout geen code heeft. Dat is ruwe, onvertaalde tekst; gebruik `texts.generic`.
- [ ] **Bestandsgrootte.** `shared/formatting.service.ts:18,21` gebruikt `toFixed`, dus Nederlands toont "2.0 MB" in plaats van "2,0 MB". Gebruik `formatNumber` met de actieve locale.
- [ ] **Verzendfout in de chat.** Een `invalid-argument` zonder `reason` (bijvoorbeeld een te groot karakter, `functions/src/character-chat.ts:85`) krijgt "probeer het opnieuw", terwijl opnieuw proberen niet helpt. Geef die weigering een eigen `reason` en tekst.
- [ ] **Dubbele sleutels.** `chat.reply.tooManyRequests` herhaalt `errors.tooManyRequests`; `campaignStory.progress.*` overlapt met de groep `progress`. Samenvoegen als het zonder omweg kan.

## Deel D — Tekstkeuzes die een beslissing vragen

Uit de tekstreview. Bij elk punt staan de opties; de eerste is het voorstel.

| Sleutel | Nu | Opties |
|---|---|---|
| `campaign.defaultName` (EN) | "Matt Campaign" | "Matt's Campaign" · zo laten |
| `sheet.noAttacks` | NL "Nog geen attacks ingesteld", EN "No attacks configured" | EN "No attacks configured yet" · NL zonder "Nog" |
| `play.pips.spend` / `restore` (EN) | "Spend 1 of Level 1 slot" | "Spend 1 Level 1 slot" · zo laten |
| `audio.upload.dropHint` + `browse` | één zin over twee sleutels ("…hierheen, of" + "blader") | één sleutel met een plek voor de link (vraagt een kleine templatewijziging) · zo laten |
| "Try again." tegenover "Please try again." (EN) | groep `characters` gebruikt de korte vorm, de rest de lange | overal "Please try again." · overal de korte vorm |
| `campaign.voiceRoster.label` / `help` (EN) | "the introduction" | "the voice introduction", zoals de sectie heet |
| `play.messages.shortRest` (NL) | "Besteed hit dice…" | "Gebruik hit dice…", zoals de sheet "Hit die gebruiken" zegt |
| Recharge-label "Manual" / "Handmatig" | vertaald (app-tekst) | zo laten · Engels houden als spelterm |

De specs die op deze zinnen controleren: `campaign/campaign-context.service.spec.ts:62`, `character-sheet.component.spec.ts:127`, `play/use-pips.component.spec.ts:52`, `shared/utils/character-play-state.spec.ts:253-267`.

## Deel E — Tests betrouwbaarder maken

De Angular-testrunner deelt modules en browseropslag tussen spec-bestanden (`isolate: false`). Dat gaf tijdens #72 drie soorten wisselvallige fouten.

- [ ] **`vi.mock(...)` van een module werkt niet betrouwbaar** als een eerder spec-bestand die module al laadde. De specs die `firebase/functions` zo mockten, zijn in #72 herschreven: een echte Functions-instantie van een verzonnen project met een gestubde `fetch` (voorbeeld: `chat/chat.service.spec.ts`). Er is nog één module-mock over, van de logger in `auth/admin.guard.spec.ts:9`. Herschrijf die met `vi.spyOn`, en leg in `.claude/claude.md` vast dat nieuwe specs geen `vi.mock` op modules gebruiken.
- [ ] **De testtaal hangt af van localStorage.** Een spec die een taal achterlaat, bepaalt de starttaal van de volgende. Het ene lek is gedicht; maak het structureel met een gezamenlijke testopzet die localStorage na elke test wist, of laat `provideTestLanguage` de standaard zijn.
- [ ] **`shared/services/pdf-generator.service.spec.ts`** haalt onder zware belasting de limiet van 5 seconden niet (één test duurt dan tot 11 seconden). Geef die tests een ruimere limiet.

## Deel F — Uitzoeken: dubbele standaardcampagne voor een nieuwe gebruiker

Gevonden bij de code-review, **niet nagelopen in een draaiende app** en al aanwezig vóór #72.

`campaign/campaign-context.service.ts` kan voor een gloednieuwe gebruiker twee keer een standaardcampagne aanmaken: `ensureProfile` schrijft `campaigns: []`, de snapshot daarvan start `loadCampaignsFromProfile`, en `loadForUser` roept die daarna nog eens aan met dezelfde lege lijst.

- [ ] Reproduceer met de auth- en Firestore-emulator: registreer een nieuwe gebruiker en tel de documenten in `campaigns`. Bij de lokale controle van #72 ontstond er één campagne, maar dat is één meting.
- [ ] Als het kan gebeuren: laat één plek de standaardcampagne aanmaken en bewaak dat met een test.

Dit raakt aan #73, dat het aanmaken en beheren van lidmaatschap naar de backend verplaatst. Stem af wie het oplost.

---

## Verificatie

In parallel (Haiku-subagents, conform CLAUDE.md):
```bash
npm run build
npm run build:backend
npm run lint
npm run test
```

Voor deel A daarnaast, na de deploy:
1. Start een upload en een podcast: de voortgang verschijnt zoals voorheen.
2. Kijk in Firestore: nieuwe podcast-entries en verhaalversies hebben `progressStep` en geen `progressMessage`.
3. Open een podcast en een verhaalversie van vóór #72: de status staat er nog.

## Buiten scope

- Een taal per campagne voor verhalen, podcasts en transcripten (buiten scope van #72; eigen ticket als het gewenst is).
- De rechten op gebruikersprofielen: #73.
- Meer talen dan Nederlands en Engels.

## Open vragen

1. **`progress.message` op sessies:** helemaal weg, of houden als logregel voor in de Firestore-console?
2. **Deel D:** akkoord met de voorstellen in de eerste kolom met opties, of wil je ze per stuk beslissen?
3. **Wanneer is "één release later"?** Voorstel: zodra #72 twee weken op productie staat.
