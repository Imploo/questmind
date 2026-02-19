# Kanka Journals Ophalen en Meesturen als Context

## Metadata

- **Ticket**: #58
- **Created**: 2026-02-19
- **Status**: Todo
- **Priority**: Medium
- **Component**: Kanka Integration / Transcription / Story Generation
- **Type**: Feature Enhancement
- **Depends On**: #42 (Kanka Transcription Integration - Done)

## Description

De Kanka.io API biedt naast characters, locations, quests en organisations ook **journals** aan. Journals bevatten typisch sessie-recaps, in-world dagboekfragmenten, DM-notities en lore-beschrijvingen die de DM in Kanka bijhoudt.

Deze journals moeten opgehaald worden via de Kanka API en meegegeven worden aan zowel `transcribeAudioFast` (raw story generatie) als `generateStoryFromTranscription` (story polishing). Net zoals bij de bestaande Kanka-entiteiten zijn journals **geen bron** van het verhaal, maar puur **context**. Als de AI een verhaal in de audio hoort dat overeenkomt met een journal-entry in Kanka, kan het dit gebruiken om een beter kloppend verhaal te schrijven met correcte namen, details en verhaallijn.

**Verschil met bestaande entiteiten:** Bij characters, locations, quests en organisations worden alleen de **namen** meegestuurd voor spelling-nauwkeurigheid. Bij journals wordt ook de **inhoud** (`entry_parsed`) en **datum** meegestuurd, omdat de verhaaltekst zelf waardevolle context biedt.

**Datum-filtering:** Alleen journals die vallen binnen het tijdsvenster `sessionDate - 2 maanden` t/m `sessionDate + 1 maand` worden meegestuurd. Dit voorkomt dat irrelevante oude of toekomstige journals worden meegegeven.

## Expected Result

1. **Kanka journals worden opgehaald** via `GET /campaigns/{id}/journals`
2. **`KankaSearchResult` bevat een nieuw `journals` veld** met naam, datum en inhoud
3. **Transcriptie-prompt** bevat journal-context zodat de AI gesproken verhalen kan matchen met bekende lore
4. **Story generation prompt** bevat journal-context voor een nauwkeuriger gepolijst verhaal
5. **Journals worden opgeslagen** in `session.kankaSearchResult` voor hergebruik
6. **Geen regressie** wanneer er geen journals bestaan in de campaign

## Technical Details

### Kanka Journals API

**Endpoint:** `GET https://api.kanka.io/1.0/campaigns/{campaign_id}/journals`

**Response fields per journal:**
- `id`: number
- `name`: string (journal titel)
- `entry`: string (raw HTML)
- `entry_parsed`: string (parsed content, geschikt voor prompt)
- `date`: string (in-world datum)
- `type`: string (optioneel, bijv. "Session Recap", "Lore")
- `character_id`: number (optioneel, gekoppeld karakter)

### Bestanden te wijzigen

#### 1. Types: `functions/src/types/audio-session.types.ts`

Voeg `KankaJournal` interface toe en breid `KankaSearchResult` uit:

```typescript
export interface KankaJournal {
  id: number;
  name: string;
  entry_parsed?: string;
  date?: string;
  type?: string;
}

export interface KankaSearchResult {
  characters?: KankaCharacter[];
  locations?: KankaLocation[];
  quests?: KankaQuest[];
  organisations?: KankaOrganisation[];
  journals?: KankaJournal[];  // NIEUW
}
```

#### 2. Kanka Service: `functions/src/services/kanka.service.ts`

- Voeg `'journals'` toe aan `KankaEntityType`
- Voeg `'journals'` toe aan `DEFAULT_TYPES` array
- Initialiseer `journals: []` in `getAllEntities()` en `searchEntities()`
- Pas `fetchKankaContextForTranscription()` aan om `sessionDate` te accepteren en journals te filteren op datum-range (`sessionDate - 2 maanden` t/m `sessionDate + 1 maand`)

```typescript
export type KankaEntityType = 'characters' | 'locations' | 'quests' | 'organisations' | 'journals';

const DEFAULT_TYPES: KankaEntityType[] = ['characters', 'locations', 'quests', 'organisations', 'journals'];
```

#### 3. Transcription Prompt: `functions/src/audio/transcription-prompt.ts`

Breid `buildKankaContextPrompt()` uit met journals sectie. Journals krijgen een uitgebreidere sectie dan andere entiteiten omdat de inhoud meegestuurd wordt:

```typescript
// Na de bestaande addSection() calls:
if (context.journals?.length) {
  const journalEntries = context.journals
    .filter(j => j.name && j.entry_parsed)
    .map(j => {
      const date = j.date ? ` (${j.date})` : '';
      return `- ${j.name}${date}: ${j.entry_parsed}`;
    })
    .join('\n');
  if (journalEntries) {
    sections.push(`Journals:\n${journalEntries}`);
  }
}
```

#### 4. Story Generator: `functions/src/story/story-generator.service.ts`

Breid `buildKankaContextPrompt()` uit met dezelfde journals-logica als in de transcription prompt.

### Prompt formaat (voorbeeld)

```
CAMPAIGN REFERENCE (for name/place accuracy only):
Characters: Aragorn, Gandalf, Frodo
Locations: Rivendell, Mordor, The Shire
Quests: Destroy the Ring, Find the Heir
Organisations: Fellowship of the Ring
Journals:
- Session 12 Recap (15 Mirtul 1492): De groep reisde naar de Sword Mountains waar ze een ontmoeting hadden met een groep orcs...
- Lore: De Drakenoorlog (jaar 1200): Eeuwen geleden vochten de draken om heerschappij over het noorden...

Remember: Use this context ONLY to spell names and places correctly when you hear them. Do not add information that wasn't spoken.
```

### Datum-filtering

**Alleen journals binnen een relevant tijdsvenster worden meegestuurd**, gebaseerd op de `sessionDate` van de audio-sessie:

- **Van:** `sessionDate - 2 maanden`
- **Tot:** `sessionDate + 1 maand`

Dit voorkomt dat irrelevante oude lore of toekomstige journals worden meegestuurd. De filtering gebeurt server-side na het ophalen van de journals, op basis van het `date` veld van de journal en de `sessionDate` van de audio-sessie.

**Implementatie:**
- `fetchKankaContextForTranscription()` moet de `sessionDate` meekrijgen als parameter
- Na het ophalen van alle journals, filter op datum-range
- Journals zonder `date` veld worden **uitgesloten** (geen datum = niet te filteren)
- Als de sessie geen `sessionDate` heeft, worden **geen journals** meegestuurd (fallback: skip journals)

```typescript
import { subMonths, addMonths, parseISO, isWithinInterval, isValid } from 'date-fns';

function filterJournalsBySessionDate(
  journals: KankaJournal[],
  sessionDate: string // ISO date string
): KankaJournal[] {
  const session = parseISO(sessionDate);
  const from = subMonths(session, 2);
  const to = addMonths(session, 1);

  return journals.filter(j => {
    const dateStr = j.date ?? j.created_at;
    if (!dateStr) return false;
    const journalDate = parseISO(dateStr);
    if (!isValid(journalDate)) return false;
    return isWithinInterval(journalDate, { start: from, end: to });
  });
}
```

**Let op:** Kanka journals kunnen in-world datums gebruiken (bijv. "15 Mirtul 1492") die niet parseerbaar zijn als echte datums. Als `parseISO(j.date)` geen geldige datum oplevert (`isValid` = false), gebruik dan het `created_at` veld van de Kanka API als fallback (zie code hierboven).

### Token management

Journals bevatten volledige tekst en kunnen veel tokens consumeren. Overweeg:
- **Truncate** individuele journal entries als ze te lang zijn (bijv. max 1.000 tekens per entry)
- **Limiet op totaal aantal characters** van journal content (bijv. max 10.000 tekens totaal)
- **Sorteer op datum** (dichtstbij sessionDate eerst) zodat de meest relevante journals prioriteit krijgen bij truncatie

### Architectuur

```
┌─────────────────────────────────────────────────────────────┐
│ Huidige flow (ongewijzigd):                                 │
│                                                             │
│ transcribeAudioFast                                         │
│   └─→ fetchKankaContextForTranscription()                   │
│       └─→ KankaService.getAllEntities()                     │
│           ├─→ GET /campaigns/{id}/characters                │
│           ├─→ GET /campaigns/{id}/locations                 │
│           ├─→ GET /campaigns/{id}/quests                    │
│           ├─→ GET /campaigns/{id}/organisations             │
│           └─→ GET /campaigns/{id}/journals  ← NIEUW         │
│       └─→ Store in session.kankaSearchResult                │
│                                                             │
│ storyGenerationWorker                                       │
│   └─→ Read session.kankaSearchResult (bevat nu journals)    │
│   └─→ generateStoryFromTranscription(kankaContext)          │
│       └─→ buildKankaContextPrompt() ← journals sectie      │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### 1. Types uitbreiden
- [ ] Voeg `KankaJournal` interface toe aan `audio-session.types.ts`
- [ ] Voeg `journals?: KankaJournal[]` toe aan `KankaSearchResult`

### 2. KankaService uitbreiden
- [ ] Voeg `'journals'` toe aan `KankaEntityType` union type
- [ ] Voeg `'journals'` toe aan `DEFAULT_TYPES` array
- [ ] Initialiseer `journals: []` in `getAllEntities()` result object
- [ ] Initialiseer `journals: []` in `searchEntities()` result object
- [ ] Pas `fetchKankaContextForTranscription()` aan: accepteer `sessionDate` parameter
- [ ] Implementeer `filterJournalsBySessionDate()`: filter journals op range `sessionDate - 2 maanden` t/m `sessionDate + 1 maand`
- [ ] Fallback: als `date` niet parseerbaar is (in-world datum), gebruik `created_at`/`updated_at`
- [ ] Als sessie geen `sessionDate` heeft: skip journals (overige entiteiten blijven werken)

### 3. Transcription prompt uitbreiden
- [ ] Voeg journals sectie toe aan `buildKankaContextPrompt()` in `transcription-prompt.ts`
- [ ] Journals tonen naam, datum en inhoud (niet alleen naam)
- [ ] Voeg token-limiet logica toe (truncate lange entries)

### 4. Story generator prompt uitbreiden
- [ ] Voeg journals sectie toe aan `buildKankaContextPrompt()` in `story-generator.service.ts`
- [ ] Zelfde formaat als bij transcription prompt

### 5. Testen
- [ ] Verify journals worden opgehaald uit Kanka API
- [ ] Verify `kankaSearchResult` in Firestore bevat journals
- [ ] Verify transcription prompt bevat journal context
- [ ] Verify story generation prompt bevat journal context
- [ ] Test met campaign zonder journals (geen regressie)
- [ ] Test met lege journal entries (graceful handling)
- [ ] Test token-limiet bij veel/grote journals

## DRY Opmerking

Er zijn nu **twee** `buildKankaContextPrompt()` functies met bijna identieke logica:
- `functions/src/audio/transcription-prompt.ts:19`
- `functions/src/story/story-generator.service.ts:96`

Bij deze wijziging zou het logisch zijn om deze te consolideren naar een **gedeelde utility**, maar dat valt buiten scope van dit ticket. Houd hier rekening mee en documenteer de duplicatie. Een apart ticket kan deze consolidatie oppakken.

## Risico's & Overwegingen

### Token consumptie
- Journals bevatten volledige tekst, wat significant meer tokens kost dan alleen namen
- Mitigatie: Limiet op totaal aantal tekens, truncate per entry
- Monitor token usage na implementatie

### Kanka API rate limiting
- Extra API call per transcriptie (journals endpoint)
- Mitigatie: Journals worden al parallel opgehaald met andere entiteiten
- Verwaarloosbare impact (1 extra parallel request)

### Grote campaigns
- Campaigns met tientallen journals kunnen veel data opleveren
- Mitigatie: Token limiet en truncatie
- Overweeg paginatie als het aantal journals > 100

## Benefits

1. **Betere verhaalconsistentie** - AI kan gesproken verhalen matchen met bekende lore uit journals
2. **Correcte namen en details** - Journal entries bevatten vaak de "officiële" versie van namen en events
3. **Rijkere context** - Journal content geeft de AI meer houvast dan alleen entity-namen
4. **DM workflow** - DMs die al journals bijhouden in Kanka krijgen automatisch betere output

## Estimated Effort

- Types uitbreiden: 15 min
- KankaService uitbreiden: 30 min
- Transcription prompt: 45 min (incl. token limiet logica)
- Story generator prompt: 30 min
- Testen: 1-2 uur

**Totaal: 3-4 uur**

## Related Files

**Te wijzigen:**
- [audio-session.types.ts](functions/src/types/audio-session.types.ts) - KankaJournal type + KankaSearchResult
- [kanka.service.ts](functions/src/services/kanka.service.ts) - journals toevoegen aan entity types
- [transcription-prompt.ts](functions/src/audio/transcription-prompt.ts) - journals in prompt
- [story-generator.service.ts](functions/src/story/story-generator.service.ts) - journals in prompt

**Referentie:**
- [transcribe-audio-fast.ts](functions/src/transcribe-audio-fast.ts) - Geen wijziging nodig (leest al kankaContext)
- [story-generation-worker.ts](functions/src/workers/story-generation-worker.ts) - Geen wijziging nodig (leest al kankaSearchResult)
