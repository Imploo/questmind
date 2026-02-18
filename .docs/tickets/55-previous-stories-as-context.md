# #55 - Vorige Stories Meesturen als Context bij Story Generatie

## Title
Vorige sessie-stories meesturen als context bij `generateStory` voor flashbacks en herinneringen

## Created
2026-02-18

## Status
Todo

## Priority
Medium

## Description
Bij het genereren van een nieuwe story (`generateStoryFromTranscription`) moeten alle eerdere stories van dezelfde campaign meegestuurd worden als context. De AI mag dan verwijzen naar gebeurtenissen uit eerdere sessies als flashback of herinnering (bijv. "Weet je nog toen...", "Net als die keer dat...").

Stories worden gesorteerd op `sessionDate` (indien ingevuld). Alleen sessies met een ingevulde `sessionDate` die **vóór** de huidige sessiedatum liggen worden meegestuurd.

## Expected Result
- Bij het genereren van een story worden alle oudere stories (op basis van `sessionDate`) opgehaald uit Firestore
- De stories worden chronologisch gesorteerd en als context meegegeven aan de AI prompt
- De AI kan verwijzen naar eerdere gebeurtenissen als flashback, herinnering of terugverwijzing
- Als er geen oudere stories zijn, of geen sessies met `sessionDate`, werkt de generatie zoals voorheen (geen regressie)
- De prompt instrueert de AI expliciet dat verwijzingen subtiel moeten zijn (flashbacks, herinneringen) en niet de hele eerdere story moeten herhalen

## Technical Details

### Bestanden die gewijzigd moeten worden

#### 1. `functions/src/workers/story-generation-worker.ts`
- **Huidige situatie**: Worker ontvangt `campaignId`, `sessionId`, `transcriptionText`, en genereert story zonder kennis van eerdere sessies
- **Wijziging**: Vóór het aanroepen van `generateStoryFromTranscription`, alle eerdere `audioSessions` ophalen uit dezelfde campaign
- Ophalen uit Firestore: `campaigns/{campaignId}/audioSessions` waar:
  - `sessionDate` is ingevuld (niet leeg/null)
  - `sessionDate` < huidige sessie `sessionDate`
  - `status` === `'completed'`
  - `content` is ingevuld (er is daadwerkelijk een story)
- Sorteren op `sessionDate` ascending (oudste eerst)
- Alleen `content` (de gepolijste story), `sessionDate` en `title` ophalen (niet het hele document)
- De opgehaalde stories doorgeven aan `generateStoryFromTranscription`

#### 2. `functions/src/story/story-generator.service.ts`
- **Huidige signature**:
  ```typescript
  generateStoryFromTranscription(
    rawStory: string,
    config: AIFeatureConfig,
    kankaContext?: KankaSearchResult,
    userCorrections?: string
  )
  ```
- **Nieuwe signature**: Voeg een parameter toe voor eerdere stories:
  ```typescript
  interface PreviousStory {
    title: string;
    sessionDate: string;
    content: string;
  }

  generateStoryFromTranscription(
    rawStory: string,
    config: AIFeatureConfig,
    kankaContext?: KankaSearchResult,
    userCorrections?: string,
    previousStories?: PreviousStory[]
  )
  ```
- **`buildStoryPrompt()`**: Voeg een sectie toe die de eerdere stories injecteert in de prompt

#### 3. `functions/src/prompts/session-story-generator.prompt.ts`
- Voeg instructie toe aan de system prompt over het gebruik van eerdere stories:
  ```
  WHEN PREVIOUS SESSION STORIES ARE PROVIDED:
  - You may reference events from earlier sessions as flashbacks or memories
  - Use phrases like "Weet je nog toen...", "Net als die keer dat...", "Eerder had de groep..."
  - Keep references brief and natural - don't retell the entire previous session
  - Only reference events that are relevant to the current session's narrative
  - Use previous stories to maintain character development continuity
  - Reference earlier combat encounters, NPC meetings, or plot points when they connect to current events
  ```

### Token Management
- Harde limiet van **100.000 karakters** totaal aan eerdere stories
- **Niet halverwege een story afkappen** — altijd complete stories meesturen
- Algoritme:
  1. Haal alle eerdere stories op, gesorteerd op `sessionDate` ascending
  2. Loop **van nieuwste naar oudste** (reversed) en tel karakters op
  3. Voeg een story alleen toe als het totaal inclusief deze story ≤ 100.000 karakters blijft
  4. Zodra een story niet meer past: stop met toevoegen (oudere stories worden overgeslagen)
  5. Draai de geselecteerde stories weer om naar chronologische volgorde (oudste eerst) voor de prompt
- Resultaat: de meest recente stories worden altijd meegenomen, oudere stories vallen af als de limiet bereikt is
- De limiet van 100.000 karakters als constante definiëren zodat deze makkelijk aanpasbaar is

### Edge Cases
- **Geen `sessionDate` op huidige sessie**: Geen eerdere stories ophalen (we weten niet wat "eerder" is)
- **Geen eerdere stories**: Gewoon genereren zonder extra context (huidige flow)
- **Eerste sessie van campaign**: Geen eerdere stories beschikbaar, geen wijziging in gedrag
- **Sessie zonder `content`**: Overslaan (story nog niet gegenereerd)
- **Regeneratie**: Bij regeneratie van een story moeten de eerdere stories opnieuw opgehaald worden (ze kunnen inmiddels bijgewerkt zijn)

### Firestore Query
```typescript
const previousSessionsSnap = await db
  .collection('campaigns')
  .doc(campaignId)
  .collection('audioSessions')
  .where('sessionDate', '<', currentSessionDate)
  .where('status', '==', 'completed')
  .orderBy('sessionDate', 'asc')
  .select('title', 'sessionDate', 'content')
  .get();

const allStories = previousSessionsSnap.docs
  .filter(doc => doc.data().content && doc.data().sessionDate)
  .map(doc => ({
    title: doc.data().title || 'Untitled Session',
    sessionDate: doc.data().sessionDate,
    content: doc.data().content,
  }));

// Selecteer meest recente stories die binnen de 100k karakterlimiet passen
const MAX_PREVIOUS_STORIES_CHARS = 100_000;
const selected: PreviousStory[] = [];
let totalChars = 0;

// Loop van nieuwste naar oudste
for (let i = allStories.length - 1; i >= 0; i--) {
  const storyChars = allStories[i].content.length;
  if (totalChars + storyChars > MAX_PREVIOUS_STORIES_CHARS) {
    break; // Stop — oudere stories passen niet meer
  }
  selected.unshift(allStories[i]); // Voeg toe aan begin (chronologische volgorde)
  totalChars += storyChars;
}
```

**Let op**: Firestore vereist een composite index voor deze query (`sessionDate` + `status`). Deze moet aangemaakt worden in `firestore.indexes.json` of automatisch via de Firebase console.

### Prompt Injectie Voorbeeld
In `buildStoryPrompt()`:
```typescript
if (previousStories && previousStories.length > 0) {
  const storySummaries = previousStories
    .map(s => `### ${s.title} (${s.sessionDate})\n${s.content}`)
    .join('\n\n---\n\n');

  prompt += `\n\nPREVIOUS SESSION STORIES (for reference and flashbacks):
The following are recaps of earlier sessions in chronological order.
You may subtly reference these events as flashbacks, memories, or callbacks when relevant to the current session.

${storySummaries}`;
}
```

## Dependencies
- Geen harde dependencies op andere tickets
- Werkt met huidige Firestore structuur (`campaigns/{campaignId}/audioSessions/{sessionId}`)

## Testing
- [ ] Genereer een story voor een campaign met 0 eerdere sessies → gedrag ongewijzigd
- [ ] Genereer een story voor een campaign met 3+ eerdere sessies → eerdere stories verschijnen in prompt
- [ ] Controleer dat de AI daadwerkelijk verwijst naar eerdere gebeurtenissen
- [ ] Controleer dat sessies zonder `sessionDate` worden overgeslagen
- [ ] Controleer dat sessies zonder `content` (nog in verwerking) worden overgeslagen
- [ ] Test regeneratie: eerdere stories worden opnieuw opgehaald
- [ ] Test karakterlimiet: bij >100.000 karakters aan stories worden oudste overgeslagen, meest recente behouden
- [ ] Controleer dat stories nooit halverwege worden afgekapt (altijd complete stories)
- [ ] Controleer dat Firestore composite index correct is aangemaakt
