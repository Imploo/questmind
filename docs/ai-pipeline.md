# AI-stappen in QuestMind

Overzicht van alle AI-stappen, hun input en wat ze opleveren.

Laatst bijgewerkt: 2026-10-21

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
| 1 | **Character Chat** (`characterChatText`) | Gemini, thinking low | Gebruikersbericht, chatgeschiedenis, huidig character | JSON `{ text, shouldUpdateCharacter }` |
| 2 | **Character Draft** (`characterDraft`) | Gemini, thinking medium | Chatcontext | Volledig D&D 5e-character (JSON) als draft-versie |
| 3 | **Spell Resolution** (`spellResolution`) | Gemini, thinking low | Spells zonder beschrijving | `description` + `usage` per spell |
| 4 | **Feature Resolution** (`featureResolution`) | Gemini, thinking low | Features/traits zonder beschrijving | `description` per feature |
| 5 | **Image Prompt** (`imagePromptGeneration`) | Gemini, thinking low | Character-context + optionele referentieafbeelding | Beschrijvende beeldprompt (tussenstap) |
| 6 | **Image Generation** (`imageGeneration`) | FAL.ai `fal-ai/flux/schnell` | Prompt uit stap 5 | Portretafbeelding |

### Details

**1. Character Chat** — `functions/src/character-chat.ts` (`characterChat`, aangeroepen vanuit `src/app/chat/chat.service.ts`)
Geeft een chatantwoord terug. Als `shouldUpdateCharacter` true is, start de frontend stap 2.

**2. Character Draft** — `functions/src/generate-character-draft.ts`
Schrijft naar `characters/{id}/versions`:
- Is de laatste versie al een draft → die wordt overschreven.
- Anders → nieuwe versie met `isDraft: true`, `source: 'ai'`, `commitMessage: 'Draft via AI chat'`.

Tijdens generatie staat `isGenerating: true` op het character.

**3. Spell Resolution** — `functions/src/resolve-spell.ts`
Update `character.spellcasting.spells` in de character-versie.

**4. Feature Resolution** — `functions/src/resolve-feature.ts`
Update `character.featuresAndTraits` in de character-versie.

**5 + 6. Afbeelding** — `functions/src/generate-image.ts` (`generateImage`)
Stap 5 en 6 draaien altijd samen: Gemini schrijft de prompt, FAL.ai genereert de afbeelding. De afbeelding wordt opgeslagen in Firebase Storage, met metadata (`storagePath`) in Firestore voor de galerij.

---

## Audio-sessies

```
opname ──► 7. Gespreksverslag ──► 8. Verhaal ──► (op verzoek) 9. Podcastscript ──► 10. Podcaststemmen
           rawStory               content                     HOST1/HOST2-script    MP3
```

| # | Stap (key) | Model | Input | Resultaat |
|---|---|---|---|---|
| 7 | **Geannoteerd gespreksverslag** (`transcription`) | Gemini, thinking low, 65.536 output tokens | Audio-segmenten + optionele Kanka-context | `rawStory` (geannoteerd log) |
| 8 | **Verhaal** (`storyGeneration`) | Gemini, thinking medium | Gespreksverslag + Kanka-context + eerdere verhalen + DM-correcties | `content`, status `completed` |
| 9 | **Podcastscript** (`podcastScript`) | Gemini, thinking medium | Sessieverhaal | Dialoog `HOST1:` / `HOST2:` |
| 10 | **Podcaststemmen** (`podcastVoices`) | Gemini TTS `gemini-3.8-flash-tts` | Script uit stap 9 | MP3 in Storage |

### Details

**7. Transcriptie** — `functions/src/transcribe-audio-fast.ts`, prompt in `functions/src/prompts/raw-story-transcription.prompt.ts`
- Lange opnames worden **client-side** opgeknipt in segmenten (ticket #67). Instelbaar via `settings/ai.transcriptionSegmentation`:
  - `segmentMinutes: 30`, `overlapSeconds: 15`, `minSplitMinutes: 35`, `concurrency: 4`, `maxAttempts: 2`, `onSegmentFailure: 'gap'`
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
- **Annotaties** beschrijven alleen hoorbare cues (toon, volume, tempo, lachen, aarzeling); geen motieven of gedachten. Geen duidelijke cue → geen annotatie.
- **Onverstaanbare audio wordt weggelaten**, zonder placeholder. Niets verzinnen.
- **Off-game** (regeldiscussies, pauzes, grappen over het echte leven) → één korte `[OOC: ...]`-regel per stuk.
- Bij een fout geeft het model `ERROR: NO_AUDIO_DETECTED` / `ERROR: AUDIO_CORRUPTED` terug; een mislukt segment wordt `[Segment X van Y: geen verstaanbare audio.]`.
- Na afloop start automatisch stap 8 via de worker-queue.

**8. Verhaal** — `functions/src/workers/story-generation-worker.ts`
- Haalt Kanka-context op (als ingeschakeld voor de campaign) en eerdere voltooide verhalen uit dezelfde campaign (chronologisch, binnen een tekenlimiet).
- Prompt: `functions/src/prompts/session-story-generator.prompt.ts`. Zet het gespreksverslag om naar een verhaal in de derde persoon, verleden tijd:
  - Spelersacties ("ik val aan", "ik rol een 17") → acties van het character; DM-vertelling → proza.
  - Annotaties en `(Groep: ...)` kleuren toon en tempo, maar zijn geen gebeurtenissen. `[OOC: ...]` wordt genegeerd.
  - Dubbele regels door de segment-overlap worden één keer opgenomen; gaten blijven gaten.
  - Oudere sessies hebben nog een verhalende `rawStory`; die wordt op dezelfde manier gepolijst.
- Schrijft het eindverhaal naar `content` op de sessie en zet de status op `completed`.

**9 + 10. Podcast** — `functions/src/generate-podcast-audio.ts`, TTS in `functions/src/utils/podcast-tts.ts`
- Stap 9 zet het verhaal om naar een twee-host dialoog; lengte begrensd door `maxCharacters` (default 5000). Pauzes als `<short pause>`; geen regieaanwijzingen, want 3.8 TTS leest de tekst letterlijk voor.
- Stap 10 rendert het script als multi-speaker audio via de **Interactions API** (`googleAi.interactions.create`, vereist `@google/genai` ≥ 2.24). Stemmen: `Puck` (host 1) en `Leda` (host 2).
  - Elke beurt is een apart `text`-item met een `speech_metadata`-annotatie (`speaker` + `style`). De toon-instructie staat in `style`, niet in de tekst.
  - Het script wordt in blokken van ~3000 tekens gerenderd. Output wordt expliciet als ruwe PCM (`audio/l16`, 24 kHz) opgevraagd, aan elkaar geplakt en daarna naar MP3 omgezet. (Standaard levert 3.8 WAV; WAV-blokken plakken zou headers midden in de audio zetten.)
- Opslag: `campaigns/{campaignId}/podcasts/{sessionId}/v{version}.mp3`, plus een entry in `podcasts[]` en `latestPodcastVersion` op de sessie.
- `ttsProvider` staat standaard op `gemini`. De ElevenLabs-optie (`model`, `host1VoiceId`, `host2VoiceId`) is legacy: het abonnement is opgezegd. Opruimen staat in ticket #66.

---

## Bekende aandachtspunten

- **Legacy `characterChat`-config**: wordt in de admin alleen bewaard voor oudere opgeslagen settings; de chat gebruikt `characterChatText`.
