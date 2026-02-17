# Ticket #54: Refactor Transcription Pipeline naar Raw Story + Polished Story

**Created:** 2026-02-17
**Priority:** High
**Status:** Todo
**Effort:** 3-5 days
**Dependencies:** -

---

## Description

De huidige transcriptie-pipeline produceert een letterlijk JSON-transcript met timestamps en speaker labels per segment. Bij lange sessies (2-4 uur) loopt dit tegen de max output token limiet van Gemini Flash aan. De output is veel te token-intensief door de JSON-structuur.

De nieuwe aanpak vervangt het letterlijke transcript door een **ruw uitgebreid verhaal** in plain text, dat vervolgens door een tweede AI-stap tot een **gepolijst verhaal** wordt omgevormd. Correcties worden toegepast bij het polijsten, niet bij de transcriptie.

## Current Pipeline

```
Audio -> Gemini Flash -> JSON transcript (segments met timestamps, speakers)
                         -> Gemini Flash -> gepolijst verhaal (Nederlands)
```

**Probleem:** Het JSON-transcript is extreem token-intensief. Honderden objecten met `{ "timeSeconds": 123, "text": "...", "speaker": "DM" }` voor een sessie van 2-4 uur. Dit raakt de max output token limiet van Gemini Flash.

## New Pipeline

```
Audio -> Gemini Flash -> ruw verhaal (plain text, uitgebreid, alle details)
                         -> Gemini Flash -> gepolijst verhaal (Nederlands)
                                            ^
                                  user corrections + regenerate
```

### Stap 1: Audio naar ruw verhaal
- Input: audiobestand (via Gemini Files API)
- Output: **plain text** verhaal, geen JSON, geen timestamps
- Bevat alle details: wie wat zei, wat er gebeurde, combat encounters, NPC interacties
- Namen en acties van spelers/characters expliciet benoemen
- Kanka context meegeven voor correcte spelling van namen/locaties
- Veel minder tokens dan JSON-transcript (geschat 40-60% minder)

### Stap 2: Ruw verhaal naar gepolijst verhaal
- Input: ruw verhaal + optioneel user corrections + Kanka context
- Output: gepolijst verhaal in het Nederlands (bestaande story generation prompt)
- Identiek aan huidige story generation, maar nu vanaf ruw verhaal i.p.v. JSON-transcript

### Correcties en regeneratie
- Gebruiker bekijkt gepolijst verhaal
- Geeft correcties aan (bijv. "Khuri-Khan i.p.v. Corikan", "ze vochten niet, ze onderhandelden")
- Gepolijst verhaal wordt opnieuw gegenereerd vanaf **ruw verhaal + correcties**
- Audio hoeft niet opnieuw verwerkt te worden

## Technical Details

### Backend wijzigingen

#### 1. Nieuwe prompt: `raw-story-transcription.prompt.ts`

Vervangt `audio-transcription.prompt.ts`. Nieuwe prompt instrueert Gemini om:
- Een uitgebreid verhaal in plain text te schrijven van wat er in de audio gebeurt
- Alle details vast te leggen: wie wat zei/deed, combat, NPC interacties, plot
- Namen en acties expliciet te benoemen (geen anonieme "een speler")
- Geen JSON, geen timestamps, geen speaker labels
- Meta-game talk, pauzes en off-topic overslaan
- In het Nederlands te schrijven
- Anti-repetitie regels (bestaande regels overnemen)

#### 2. `transcribe-audio-fast.ts` aanpassen

Huidige flow:
1. Roep Gemini aan met audio + transcription prompt
2. Parse JSON response naar segments
3. Formatteer timestamps
4. Sla transcript op in Firestore
5. Trigger story generation worker

Nieuwe flow:
1. Roep Gemini aan met audio + **raw story prompt**
2. Ontvang plain text (geen JSON parsing nodig)
3. Sla **ruw verhaal** op in Firestore (`rawStory` veld)
4. Trigger story generation worker met ruw verhaal

Wijzigingen:
- Vervang `buildTranscriptionPrompt()` door nieuwe raw story prompt
- Verwijder `parseTranscriptionPayload()` JSON parsing
- Verwijder `formatTimestamp()` en timestamp-gerelateerde code
- Sla `rawStory` op i.p.v. `transcription.rawTranscript` / `transcription.segments`
- Behoud `transcription.rawTranscript` voor backward compat (vul met ruw verhaal)

#### 3. `story-generator.service.ts` aanpassen

Minimale wijziging: input is nu plain text ruw verhaal i.p.v. geformatteerd transcript. De story generation prompt (`SESSION_STORY_GENERATOR_PROMPT`) werkt al met plain text input.

#### 4. `story-generation-worker.ts`

- `transcriptionText` parameter hernoemen naar `rawStory` (of alias)
- De rest blijft gelijk

#### 5. Regenerate story flow

Huidige flow (in `audio-backend-operations.service.ts`):
- Haalt `transcription.rawTranscript` op uit Firestore
- Stuurt dit naar story generation

Nieuwe flow:
- Haalt `rawStory` op uit Firestore
- Stuurt dit + user corrections naar story generation
- Geen audio herverwerking nodig

### Frontend wijzigingen

#### 1. Session detail page
- Toon **ruw verhaal** in een uitklapbare sectie (voor wie het wil inzien)
- Toon **gepolijst verhaal** als primaire content (ongewijzigd)
- "Regenerate story" knop werkt op ruw verhaal + correcties

#### 2. Correcties flow
- User corrections worden bij regeneratie meegegeven
- Correcties worden opgeslagen op de sessie in Firestore
- Bij regeneratie: ruw verhaal + correcties -> nieuw gepolijst verhaal

### Firestore schema wijzigingen

```typescript
interface AudioSessionRecord {
  // NIEUW: ruw verhaal van de audio
  rawStory?: string;

  // BESTAAND: gepolijst verhaal (ongewijzigd)
  content: string;

  // BESTAAND: user corrections (ongewijzigd)
  userCorrections?: string;

  // DEPRECATED: oude transcript velden (kunnen later verwijderd worden)
  transcription?: TranscriptionResult;
}
```

### Wat wordt verwijderd/deprecated

| Item | Actie |
|------|-------|
| `audio-transcription.prompt.ts` | Vervangen door raw story prompt |
| `parseTranscriptionPayload()` | Verwijderen (geen JSON meer) |
| `formatTimestamp()` | Verwijderen (geen timestamps meer) |
| `TranscriptionSegment[]` output | Niet meer gegenereerd |
| `transcription.segments` in Firestore | Deprecated, niet meer geschreven |
| `transcription.timestamps` in Firestore | Deprecated, niet meer geschreven |

### Wat behouden blijft

| Item | Reden |
|------|-------|
| Gemini Files API upload | Audio moet nog steeds naar Gemini |
| `waitForGeminiFileToBecomeActive()` | Nog steeds nodig |
| Kanka context integratie | Wordt meegegeven aan raw story prompt |
| Story generation prompt | Werkt al op plain text |
| Regenerate story functionaliteit | Werkt nu vanaf rawStory i.p.v. transcript |
| Progress tracking | Stages wijzigen licht (geen "transcribing" meer, maar "generating-raw-story") |
| Fire-and-forget patroon | Ongewijzigd |

## Files to Modify

### Backend (functions/)

| File | Change |
|------|--------|
| `functions/src/prompts/audio-transcription.prompt.ts` | Vervangen door raw story prompt |
| `functions/src/prompts/raw-story-transcription.prompt.ts` | **NIEUW** — prompt voor audio -> ruw verhaal |
| `functions/src/audio/transcription-prompt.ts` | Aanpassen om nieuwe prompt te gebruiken |
| `functions/src/transcribe-audio-fast.ts` | JSON parsing verwijderen, rawStory opslaan |
| `functions/src/story/story-generator.service.ts` | Input parameter verduidelijken |
| `functions/src/workers/story-generation-worker.ts` | Parameter hernoemen |

### Frontend (src/)

| File | Change |
|------|--------|
| `src/app/audio/audio-session.component.ts` | rawStory tonen, regenerate vanuit rawStory |
| `src/app/audio/services/audio-backend-operations.service.ts` | regenerateStory leest rawStory |
| `src/app/audio/services/audio-session.models.ts` | `rawStory` veld toevoegen aan interface |

## Migration

Geen migratie nodig. Bestaande sessies behouden hun oude `transcription` data. Nieuwe sessies krijgen `rawStory`. De story generation werkt in beide gevallen omdat het enkel plain text nodig heeft.

## Out of Scope

- Verwijderen van oude `transcription` velden uit bestaande sessies
- Batch/retranscription flow (die gebruikt een aparte pipeline)
- Podcast generation (werkt vanaf het gepolijste verhaal, ongewijzigd)
- Splitsen van lange audio in chunks (alternatieve oplossing voor token-limiet)
