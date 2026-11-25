# AI-stappen in QuestMind

Overzicht van alle AI-stappen, hun input en wat ze opleveren.

Laatst bijgewerkt: 2026-11-23

## Configuratie

Elke stap heeft een key onder `settings/ai` → `features.<key>` in Firestore en is aan te passen via de admin-pagina (model, `maxOutputTokens`, `thinkingLevel`).

- **Defaults** staan op twee plekken en moeten synchroon blijven:
  - Backend: `functions/src/utils/ai-settings.ts`
  - Admin-pagina: `src/app/admin/admin.component.ts` (`defaultConfigs`)
- **Opgeslagen waarden gaan voor** de defaults: `{ ...DEFAULTS, ...firestoreSettings }`.
- De admin-pagina slaat bij elke wijziging de **volledige** set op (inclusief defaults van dat moment). Met **"Reset to defaults"** wordt `settings/ai` leeggemaakt, zodat de code-defaults weer gelden.
- Standaardmodel voor alle Gemini-stappen: `gemini-3.8-flash`.
- `thinkingLevel`: `low` | `medium` | `high` (`minimal` wordt niet ondersteund door 3.8 Flash). Alleen meegestuurd voor `gemini-3*`-modellen (`functions/src/utils/gemini-config.ts`).

---

## Character builder

| # | Stap (key) | Model | Input | Resultaat |
|---|---|---|---|---|
| 1 | **Character Chat** (`characterChatText`) | Gemini, thinking low | Gebruikersbericht, opgeslagen chatgeschiedenis (+ samenvatting), huidig character | JSON `{ text, shouldUpdateCharacter, title? }`, opgeslagen als bericht |
| 1b | **Chat-samenvatting** (`characterChatText`) | Gemini, thinking low | Oudere berichten van een lang gesprek + vorige samenvatting | `summary` op het gesprek |
| 2 | **Character Draft** (`characterDraft`) | Gemini, thinking medium | Chatcontext | `{ summary, character }`: volledig D&D 5e-character (JSON) + één zin over de wijziging, opgeslagen als nieuwe actieve versie |
| 3 | **Spell Resolution** (`spellResolution`) | Gemini, thinking low | Spells zonder beschrijving | `description` + `usage` per spell |
| 4 | **Feature Resolution** (`featureResolution`) | Gemini, thinking low | Features/traits zonder beschrijving | `description` per feature |
| 5 | **Image Prompt** (`imagePromptGeneration`) | Gemini, thinking low | Character-context + optionele referentieafbeelding | Beschrijvende beeldprompt (tussenstap) |
| 6 | **Image Generation** (`imageGeneration`) | Gemini `gemini-nano-banana-2.1` | Prompt uit stap 5 | Portretafbeelding |

### Details

**1. Character Chat** — `functions/src/character-chat.ts` + `functions/src/chat/` (aangeroepen vanuit `src/app/chat/chat.service.ts`)

Gesprekken worden per character bewaard en door de backend afgehandeld, zodat een antwoord (en een character-update) ook doorloopt als de app tussendoor dichtgaat.

```
app ──► characterChat (callable) ──► Cloud Task ──► characterChatWorker ──► Firestore ──► app (live)
        schrijft vraag + leeg antwoord              stap 1, daarna zo nodig stap 2 of 5+6
```

- **Opslag**: `characters/{id}/chats/{chatId}` (titel, laatste bericht, labels, samenvatting) met `messages/{messageId}` (`sender`, `kind`, `status`, `text`, ...). Alleen de eigenaar kan ze lezen; alleen de backend schrijft ze. De eigenaar mag via de regels alleen een gesprek hernoemen en een lopende character-update annuleren. Verwijderen gaat via `deleteCharacterChat`.
- **`characterChat`** controleert eigenaarschap, schrijft de vraag en een antwoord met `status: 'pending'`, zet de beurt op de wachtrij en keert direct terug. Een PDF wordt voor de worker geparkeerd in Storage (`chat-attachments/...`, niet leesbaar voor clients) en na de beurt verwijderd. Het character reist mee in de taak (de app stuurt het character zoals de eigenaar het nu ziet, inclusief play state).
- **`characterChatWorker`** (`runChatTurn`) bouwt de context op uit de opgeslagen berichten, streamt het antwoord en schrijft de tekst hooguit elke halve seconde naar het antwoordbericht (`status: 'streaming'` → `'done'`). Een fout komt als `status: 'error'` + `errorCode` op het bericht; de app maakt er een melding van. Een taak die dubbel wordt afgeleverd doet niets: alleen een antwoord dat nog `pending` is wordt opgepakt.
- **Context**: het character, de samenvatting van het oudere deel (als die er is) en de vragen en antwoorden daarna. Afbeeldingsverzoeken, character-updates en mislukte antwoorden tellen niet mee.
- **Titel**: een nieuw gesprek krijgt de ingekorte eerste vraag als titel (`titleSource: 'auto'`). Zolang dat zo is vraagt stap 1 in hetzelfde antwoord om een `title` (`'ai'`). Een titel die de eigenaar zelf koos (`'user'`) wordt niet overschreven.
- **Als `shouldUpdateCharacter` true is** start de worker stap 2 zelf. De voortgang staat als systeembericht (`kind: 'characterUpdate'`) in het gesprek; na afloop staan daar het versienummer en `previousVersionId`, de versie die tot dan actief was: de link "Undo" in de chat zet die weer actief. Annuleert de eigenaar (`status: 'cancelled'`), dan wordt het gegenereerde character niet opgeslagen.
- **Afbeelding**: een bericht met "maak afbeelding" gaat als `mode: 'image'` naar dezelfde worker, die stap 5 + 6 uitvoert en de afbeelding op het antwoordbericht zet. Het nieuwste portret van het character dient als stijlreferentie.

**1b. Chat-samenvatting** — `functions/src/chat/chat-summary.ts`, prompt in `functions/src/prompts/chat-summary.prompt.ts`
Draait na een antwoord. Staan er meer dan 30 vragen en antwoorden klaar als context, dan worden alle behalve de laatste 20 samengevat in `summary` op het gesprek (`summarizedUntil` markeert tot waar). Gebruikt de instellingen van `characterChatText`. Mislukt de samenvatting, dan gaat de volgende beurt gewoon met een langere context mee.

**2. Character Draft** — `functions/src/generate-character-draft.ts`
Het vertrekpunt is het character dat de app meestuurt: de versie die de eigenaar actief heeft. Een wijziging op een oudere versie bouwt dus verder op die versie.

Schrijft in één transactie naar `characters/{id}/versions`:
- Een nieuwe versie met het volgende versienummer (hoogste + 1), `source: 'ai'` en als `commitMessage` de `summary` van het model (één zin; ontbreekt die, dan `'Updated via AI chat'`).
- `activeVersionId` op het character wijst daarna naar die versie. Er is geen draft meer: de wijziging is direct de actieve versie, en ongedaan maken is terugschakelen naar de vorige.

Tijdens generatie staat `isGenerating: true` op het character.

**3. Spell Resolution** — `functions/src/resolve-spell.ts`
Update `character.spellcasting.spells` in de character-versie.

**4. Feature Resolution** — `functions/src/resolve-feature.ts`
Update `character.featuresAndTraits` in de character-versie.

**5 + 6. Afbeelding** — `functions/src/generate-image.ts` (`generateCharacterImage`, aangeroepen door de chat-worker)
Stap 5 en 6 draaien altijd samen: Gemini schrijft de prompt en een Gemini-beeldmodel (Interactions API) genereert de afbeelding. De afbeelding wordt opgeslagen in Firebase Storage, met metadata (`storagePath`) in Firestore voor de galerij.

---

## Audio-sessies

```
opname ──► 7. Gespreksverslag ──► 8. Verhaal ──► (op verzoek) 9. Podcastscript ──► 10. Podcaststemmen
           rawStory               content                     HOST1/HOST2-script    MP3
```

| # | Stap (key) | Model | Input | Resultaat |
|---|---|---|---|---|
| 7 | **Geannoteerd gespreksverslag** (`transcription`) | Gemini, thinking low, 65.536 output tokens | Audio-segmenten + optionele Kanka-context | `rawStory` (geannoteerd log) |
| 8 | **Verhaal** (`storyGeneration`) | Gemini, thinking medium | Gespreksverslag + Kanka-context + eerdere verhalen + DM-correcties + het huidige verhaal als dat met de hand is bewerkt | `content`, status `completed` |
| 9 | **Podcastscript** (`podcastScript`) | Gemini, thinking medium | Sessieverhaal | Dialoog `HOST1:` / `HOST2:` |
| 10 | **Podcaststemmen** (`podcastVoices`) | Gemini TTS `gemini-3.8-flash-tts` | Script uit stap 9 | MP3 in Storage |

### Details

**7. Transcriptie** — `functions/src/transcribe-audio-fast.ts`, prompt in `functions/src/prompts/raw-story-transcription.prompt.ts`
- Lange opnames worden **client-side** opgeknipt in segmenten (ticket #67). Instelbaar via `settings/ai.transcriptionSegmentation`:
  - `segmentMinutes: 30`, `overlapSeconds: 15`, `minSplitMinutes: 35`, `concurrency: 4`, `maxAttempts: 4` (met oplopende wachttijd tussen pogingen), `onSegmentFailure: 'gap'`
- Elk segment wordt apart getranscribeerd met een eigen output-budget; de resultaten worden samengevoegd tot één `rawStory`.
- Het resultaat is **geen verhaal** maar een **geannoteerd gespreksverslag**: vrij letterlijk wat er gezegd wordt, wie het zegt en hoe het klinkt. Regelformaat:
  ```
  DM [rustig, dreigend]: <wat de DM zegt — vertelling, NPC's, monsters>
  <Characternaam> [opgewonden]: <wat de speler zegt>
  Speler (onbekend) [aarzelend]: <als het character niet uit de audio blijkt>
  (Groep: <energie aan tafel, bijv. gelach of spanning>)
  [OOC: <korte samenvatting van off-game gepraat>]
  ```
- **Sprekers:** `DM` voor alles wat de DM inspreekt (ook NPC's). Spelers krijgen hun character-naam alleen als de audio dat duidelijk maakt (aangesproken, zichzelf noemen, DM benoemt het); anders `Speler (onbekend)`. Namen worden niet over segmenten heen meegenomen. De Kanka-lijst is alleen voor spelling, nooit voor sprekertoewijzing.
- **Annotaties** beschrijven hoe iets klinkt (toon, emotie, energie, tempo, lachen, aarzeling) en staan bij elke regel met een merkbare toon; alleen neutrale korte regels mogen zonder. Geen motieven of gedachten.
- **Onverstaanbare audio wordt weggelaten**, zonder placeholder. Niets verzinnen.
- Regels die niet in het formaat passen (bijv. gelekte denkstappen van het model) worden vóór opslaan weggefilterd (`functions/src/audio/session-log-sanitizer.ts`). Bij een leeg Gemini-antwoord wordt `finishReason`/`blockReason` gelogd.
- **Off-game** (regeldiscussies, pauzes, grappen over het echte leven) → één korte `[OOC: ...]`-regel per stuk.
- Bij een fout geeft het model `ERROR: NO_AUDIO_DETECTED` / `ERROR: AUDIO_CORRUPTED` terug; een mislukt segment wordt `[Segment X van Y: geen verstaanbare audio.]`.
- Segmenten die ontbreken (mislukt na alle pogingen, of zonder verstaanbare spraak) komen met hun tijdsbereik in `transcriptionFast.missingSegments` (`{ segment, startSec, endSec, reason: 'failed' | 'unintelligible' }`). De sessiepagina toont daarover een waarschuwing boven het verhaal, met de tijdstippen in de opname; bij een mislukt stuk staat erbij dat opnieuw transcriberen kan helpen.
- Na afloop start automatisch stap 8 via de worker-queue.

**8. Verhaal** — `functions/src/workers/story-generation-worker.ts`
- Haalt Kanka-context op (als ingeschakeld voor de campaign) en eerdere voltooide verhalen uit dezelfde campaign (chronologisch, binnen een tekenlimiet).
- Prompt: `functions/src/prompts/session-story-generator.prompt.ts`. Zet het gespreksverslag om naar een verhaal in de derde persoon, verleden tijd:
  - Spelersacties ("ik val aan", "ik rol een 17") → acties van het character; DM-vertelling → proza.
  - Annotaties en `(Groep: ...)` kleuren toon en tempo, maar zijn geen gebeurtenissen. `[OOC: ...]` wordt genegeerd.
  - **Verhalend, niet technisch:** schade, hit points, worpen en regeltermen worden niet genoemd maar vertaald naar wat er gebeurt ("de genadeslag, waarna de wachter door zijn knieën zakte").
  - Dubbele regels door de segment-overlap worden één keer opgenomen; gaten blijven gaten.
  - Oudere sessies hebben nog een verhalende `rawStory`; die wordt op dezelfde manier gepolijst.
- Schrijft het eindverhaal naar `content` op de sessie en zet de status op `completed`.
- **Met de hand bewerkt verhaal gaat mee.** Ieder lid van de campagne kan het verhaal van een afgeronde sessie bewerken (tab Verhaal → "Verhaal bewerken"): schrappen wat niet klopt, aanvullen, of een notitie tussen haakjes zetten. Opnieuw genereren, de gegevens van de sessie en verwijderen blijven bij de eigenaar van de sessie. Opslaan zet `storyEditedAt`, `storyEditedBy` en `storyEditedByName` op de sessie (zie [Samen bewerken](#samen-bewerken)). Vanaf dan gaat het huidige verhaal bij elke nieuwe generatie mee als **vorige versie** (`buildPreviousVersionBlock` in de prompt), ook in de generaties daarna: de verbeteringen zitten dan in het nieuwe verhaal, en dat gaat de keer erop weer mee.
  - Volgorde bij een tegenstrijdigheid: DM-correcties → vorige versie → gespreksverslag.
  - Wat de vorige versie vertelt en niet in het verslag staat, is door de DM toegevoegd en blijft staan. Wat in het verslag staat maar in de vorige versie ontbreekt, is geschrapt en komt niet terug.
  - Een notitie tussen haakjes wordt uitgevoerd en in de tekst verwerkt; de haakjes zelf verdwijnen.
  - Na **opnieuw transcriberen** is het verslag nieuw: dan mogen scènes die de vorige versie niet kent er wel bij, maar wat is rechtgezet blijft rechtgezet.
  - Een verhaal dat **nooit** met de hand is bewerkt gaat niet mee: opnieuw genereren begint dan gewoon vanaf het verslag (zo blijft een mislukt of afgekapt verhaal niet hangen).
  - Tekst die nog in het bewerkveld staat wordt eerst opgeslagen als op "Verhaal opnieuw genereren" wordt geklikt.
- **Versie van het verhaal**: `storyRegenerationCount` gaat één omhoog bij elke nieuwe generatie over een bestaand verhaal heen en bij elke bewerking met de hand (ontbreekt = 1). Het campagneverhaal vergelijkt dit getal met wat het heeft verwerkt (`sourceSessions[].storyVersion`): een gewijzigde sessie telt mee bij "nog niet verwerkt" en krijgt op de sessiepagina de melding dat het campagneverhaal bijgewerkt kan worden.

**9 + 10. Podcast** — `functions/src/generate-podcast-audio.ts`, TTS in `functions/src/utils/podcast-tts.ts`
- Stap 9 zet het verhaal om naar een twee-host dialoog; lengte begrensd door `maxCharacters` (default 5000). Pauzes als `<short pause>`; geen regieaanwijzingen, want 3.8 TTS leest de tekst letterlijk voor.
- Stap 10 rendert het script als multi-speaker audio via de **Interactions API** (`googleAi.interactions.create`, vereist `@google/genai` ≥ 2.24). Stemmen: `Puck` (host 1) en `Leda` (host 2).
  - Elke beurt is een apart `text`-item met een `speech_metadata`-annotatie (`speaker` + `style`). De toon-instructie staat in `style`, niet in de tekst.
  - Het script wordt in blokken van ~3000 tekens gerenderd. Output wordt expliciet als ruwe PCM (`audio/l16`, 24 kHz) opgevraagd, aan elkaar geplakt en daarna naar MP3 omgezet. (Standaard levert 3.8 WAV; WAV-blokken plakken zou headers midden in de audio zetten.)
- Opslag: `campaigns/{campaignId}/podcasts/{sessionId}/v{version}.mp3`, plus een entry in `podcasts[]` en `latestPodcastVersion` op de sessie.
- Instelbaar via admin: `geminiModel`, `host1VoiceName`, `host2VoiceName`, `maxCharacters`. ElevenLabs is volledig verwijderd (ticket #66).

---

## Campagneverhaal

Eén doorlopend, samengevat verhaal van de hele campagne, in versies (ticket #69). Alleen de eigenaar van de campagne kan een nieuwe versie laten schrijven.

| # | Stap (key) | Model | Input | Resultaat |
|---|---|---|---|---|
| 11 | **Campagneverhaal** (`campaignStory`) | Gemini, thinking medium | Alle sessieverhalen + geschreven verslagen uit Kanka + Kanka-naslag + de vorige versie als die met de hand is bewerkt | `{ title, content }` op `campaigns/{id}/campaignStories/v{n}` |
| 12 | **Podcast van het campagneverhaal** (`podcastScript` + `podcastVoices`) | als stap 9 + 10 | Een versie van het campagneverhaal | MP3 in Storage |

### Details

**11. Campagneverhaal** — `functions/src/generate-campaign-story.ts`, prompt in `functions/src/prompts/campaign-story-generator.prompt.ts`

Twee soorten bronnen, samen in chronologische volgorde (`functions/src/campaign-story/campaign-story-sources.ts`):

- **Sessieverhalen**: de `content` van elke sessie met status `completed`, op `sessionDate` (anders de uploaddatum).
- **Verslagen uit Kanka**: de journals van de gekoppelde Kanka-campagne (`functions/src/campaign-story/campaign-story-kanka.ts`). Bedoeld voor sessies waar geen opname van is, vaak de eerste: daar is het verslag van een speler of de DM de enige bron. Alleen als Kanka voor de campagne aan staat (`settings.kankaEnabled` + `settings.kankaCampaignId`).

Hoe een journal wordt gelezen:

- De tekst is de entry van het journal plus de posts eronder, als platte tekst (HTML eruit, mentions uitgeschreven).
- **Privé blijft privé**: journals met `is_private` en posts die alleen de DM of de schrijver kan lezen (`visibility_id` anders dan 1 of 5) worden overgeslagen, net als privé-personages, -plekken, -quests en -organisaties. Iedereen in de campagne leest het verhaal.
- Een journal met een **datum** in Kanka krijgt die plek in de tijdlijn; op dezelfde dag als een sessie staat het verslag vóór het sessieverhaal.
- Een journal **zonder datum** gaat in een apart blok. Het model plaatst het aan de hand van de titel (bijv. "Sessie 2") en de inhoud; lukt dat niet, dan telt het als voorgeschiedenis van vóór de eerste opname. Een datum invullen in Kanka is dus de betrouwbaarste manier om de volgorde vast te leggen.
- Limieten: 40.000 tekens per journal (daarna ingekort), 300.000 tekens voor alle journals samen.

Wat het model ermee moet doen:

- Een verslag telt even zwaar als een sessieverhaal. Beschrijven ze dezelfde avond, dan worden ze samengevoegd en één keer verteld; bij een tegenstrijdige naam of feit geldt het geschreven verslag.
- Verslagen in de ik- of wij-vorm worden omgezet naar de derde persoon; "ik" is de schrijver (het personage dat in Kanka als auteur van het journal staat).
- Een journal dat geen gebeurtenissen beschrijft maar achtergrond (lore, notities) is alleen achtergrond.
- **Naslag**: namen, type en de eerste regels van de niet-privé personages, plekken, quests en organisaties gaan mee voor spelling en om te weten wie of wat iets is. Het zijn nooit gebeurtenissen.

Met de hand bewerken (ieder lid van de campagne; een nieuwe versie laten schrijven blijft bij de eigenaar):

- De **nieuwste voltooide versie** is te bewerken ("Verhaal bewerken" naast "Versies"): titel en tekst. De app schrijft `title`, `content`, `wordCount`, `editedAt`, `editedBy` en `editedByName` rechtstreeks naar de versie; `firestore.rules` staat precies die velden toe, voor leden van de campagne en alleen op de versie in `campaignStory.latestCompletedVersion`. Al het andere op een versie schrijft alleen de backend. Zie [Samen bewerken](#samen-bewerken).
- Een bewerkte versie gaat bij de volgende generatie mee als **vorige versie**. De nieuwe versie krijgt `basedOnVersion` en gaat daardoor de keer daarna zelf weer mee: verbeteringen blijven zo in alle latere versies staan. Zolang niemand iets heeft bewerkt gaat er geen vorige versie mee en wordt het verhaal elke keer vers uit de bronnen geschreven.
- Regels in de prompt (`VERBETERINGEN VAN DE DM`):
  - Spreekt de vorige versie een bron tegen, dan klopt de vorige versie. Wat de DM heeft toegevoegd blijft staan; wat de vorige versie weglaat, wordt niet teruggehaald uit de bronnen.
  - Bronnen krijgen een label ten opzichte van de vorige versie (`campaign-story-sources.ts`): **NIEUW** (zat er nog niet in: opnemen) of **HERZIEN** (sessieverhaal opnieuw gegenereerd of bewerkt, journal gewijzigd in Kanka: de herziene bron gaat vóór de vorige versie). Een fout die uit een sessieverhaal komt, kun je dus het best ook in dat sessieverhaal rechtzetten.
  - Een notitie tussen haakjes wordt uitgevoerd en in de tekst verwerkt. Dat geldt ook voor een notitie in een sessieverhaal dat als bron dient.
  - De titel van de vorige versie blijft, tenzij die niet meer past.
- Wie zelf aan het bewerken is kan geen nieuwe versie starten (niet-opgeslagen tekst zou niet meegaan). Start de eigenaar een nieuwe versie terwijl een ander lid typt, dan blijft dat formulier open maar kan er pas weer worden opgeslagen als de versie klaar is; daarna kiest dat lid tussen de eigen tekst en de nieuwe versie.
- Een podcast die al van de versie was gemaakt verandert niet mee met een bewerking.

Verder:

- De versie bewaart waar het verhaal uit is geschreven: `sourceSessions` en `sourceJournals`. Met Kanka gekoppeld kan er ook een verhaal worden geschreven als nog geen enkele sessie een verhaal heeft.
- **Kanka niet bereikbaar** (storing, ongeldig of ontbrekend `KANKA_API_TOKEN`, rate limit): er wordt geen versie gestart en de eigenaar krijgt een melding (`kanka-unavailable`). Zonder Kanka zouden de sessies die alleen als verslag bestaan ongemerkt uit het verhaal verdwijnen.
- De Kanka-lijsten worden per pagina opgehaald (maximaal 10 pagina's per soort).

**12. Podcast** — `functions/src/generate-campaign-story-podcast.ts`
Zelfde instellingen en stappen als de sessiepodcast (9 + 10), met het campagneverhaal als bron. Wat uit de verslagen in het verhaal staat, komt dus ook in de podcast. De scriptprompt is dezelfde als voor een sessie, met een eigen framing (`kind: 'campaign'`): een terugblik op de grote lijnen die eindigt bij waar de party nu staat, zonder discussie over de toekomst als slot.

---

## Samen bewerken

Een verhaal (van een sessie of van de campagne) is een gezamenlijk stuk: ieder lid kan het met de hand verbeteren, **één tegelijk**. Er is geen live meetypen; een slot en een controle bij het opslaan zorgen dat niemands werk verloren gaat.

**1. Het slot: één lid bewerkt tegelijk.** `StoryEditLockService` (`src/app/shared/services/story-edit-lock.service.ts`) houdt per verhaal één document bij in `campaigns/{id}/storyEditors/{target}` (`target`: `session_{sessionId}` of `campaign-story`), met `uid`, naam en `updatedAt` (servertijd).

- **Nemen**: wie op "Verhaal bewerken" klikt neemt het slot in een transactie; pas daarna gaat het formulier open. Heeft een ander het slot, dan is de knop uitgeschakeld en staat erbij wie er bezig is. Klikken twee leden tegelijk, dan krijgt er één het slot en de ander een melding.
- **Afgedwongen in `firestore.rules`**: een slot van een ander is alleen te overschrijven als het 90 seconden niet is ververst. Alleen de houder kan het verwijderen.
- **Houden**: zolang het formulier open is wordt het slot elke 25 seconden ververst. Het wordt teruggegeven als het formulier sluit of de pagina weggaat.
- **Verlopen**: klapt iemand het tabblad dicht of valt de verbinding weg, dan is het slot na 90 seconden vrij.
- **Laten openstaan**: wie het formulier open laat staan en 10 minuten niets doet op de pagina (geen toets, geen klik), geeft het slot terug; de tekst blijft in het formulier. Zodra dat lid verdergaat wordt het slot weer genomen, als niemand anders het intussen heeft. Heeft een ander het wel, dan staat dat in het formulier en kan er pas weer worden opgeslagen als die klaar is.
- **Opslaan** vraagt het slot (opnieuw): zonder slot wordt er niet opgeslagen.
- **Genereren**: de eigenaar krijgt een bevestigingsvraag als hij opnieuw wil genereren terwijl een ander het slot heeft.
- Naam: de weergavenaam van het account, anders het deel van het e-mailadres vóór de @.

**2. Opslaan controleert of het verhaal nog hetzelfde is.** Het formulier onthoudt de tekst waarmee het lid begon. Opslaan gaat in een Firestore-transactie (`FirestoreRepository.patchInTransaction`): staat er intussen iets anders, dan wordt er niets geschreven. Met het slot komt dat alleen nog voor als het verhaal opnieuw is gegenereerd terwijl iemand typte, of als iemand na een lange pauze het slot kwijt was en een ander intussen heeft opgeslagen.

- Het formulier ziet de wijziging ook al vóór het opslaan, omdat het verhaal live binnenkomt. Wat het lid heeft getypt blijft staan; er verschijnt een melding (met de naam van wie het wijzigde, als dat een lid was) en de huidige versie is in te zien.
- Het lid kiest: **Mijn tekst opslaan** (vervangt de huidige versie; eerst overnemen wat bewaard moet blijven) of **Huidige versie laden** (de eigen tekst vervalt).
- Sessie: `AudioSessionStateService.saveStoryEdit`. Campagne: `CampaignStoryService.saveEdit` (vergelijkt titel en tekst).
- Een transactie heeft verbinding nodig: offline is er geen slot te nemen en niet op te slaan; de tekst blijft in het formulier.

Rechten (`firestore.rules`):

- **Sessie**: een lid dat niet de eigenaar is mag van een sessie met status `completed` alleen `content`, `storyEditedAt`, `storyEditedBy`, `storyEditedByName`, `storyRegenerationCount` (precies één hoger) en `updatedAt` schrijven, ondertekend met de eigen uid. Titel, datum, transcript en status blijven van de eigenaar.
- **Campagneverhaal**: zie stap 11.
- **`storyEditors`**: leden lezen; een lid neemt een vrij of verlopen slot op eigen naam, ververst en verwijdert alleen het eigen slot.
- De callable `storyGenerationWorker` weigert iedereen behalve de eigenaar van de sessie; `generateCampaignStory` iedereen behalve de eigenaar van de campagne.

---

## Bekende aandachtspunten

- **Functions opruimen**: de deploy (`scripts/deploy-firebase.js`) verwijdert functions die niet meer in `functions/src` staan. Daarvoor gaat `--force` mee, maar alleen op de functions-stap; hosting en regels worden daarna zonder `--force` uitgerold, zodat Firestore-indexen die niet in `firestore.indexes.json` staan blijven bestaan.
- **Lokaal draaien**: de chat heeft de Cloud Tasks-emulator nodig (`firebase emulators:start --only functions,tasks`, zie `npm run start:backend:functions`).

- **Legacy `characterChat`-config**: wordt in de admin alleen bewaard voor oudere opgeslagen settings; de chat gebruikt `characterChatText`.
