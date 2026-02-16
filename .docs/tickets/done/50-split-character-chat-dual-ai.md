# Ticket #50 - Split Character Chat: Dual AI + Draft Versioning

- **Created:** 2026-02-16
- **Status:** Done
- **Completed:** 2026-02-16
- **Priority:** High
- **Effort:** 1-2 weken

---

## Description

De huidige `characterChat` Cloud Function doet alles in een enkele AI-call: creatieve tekstreactie EN volledige character JSON genereren. Dit koppelt twee fundamenteel verschillende taken aan elkaar — een creatieve schrijftaak en een strikt gestructureerde JSON-taak. Door deze te splitsen krijgen we:

1. **Snellere tekstreacties** — AI 1 hoeft geen JSON te genereren
2. **Betrouwbaardere JSON** — AI 2 heeft een dedicated prompt met schema-validatie
3. **Betere separation of concerns** — elke AI doet precies een ding
4. **Draft versioning in Firestore** — character updates worden automatisch opgeslagen als draft

---

## Expected Result

- Gebruiker stuurt bericht → krijgt snel een tekstreactie terug (AI 1)
- Tegelijkertijd genereert AI 2 de bijgewerkte character JSON
- De JSON wordt gevalideerd en als draft version opgeslagen in Firestore
- Frontend toont de draft via een real-time Firestore listener (niet via in-memory signal)
- Er is altijd maximaal 1 draft version aanwezig per character
- Gebruiker klikt "Update Character" → `isDraft` wordt `false` gezet
- Character schema validatie verhuist naar de backend (functions)

---

## Architectuuroverzicht

```
User stuurt bericht
    |
    v
characterChat Cloud Function
    |
    v
AI 1: Tekst-responder
    - Systeem prompt: creatief, behulpzaam, D&D expert
    - Input: huidige character JSON (zonder spell/feature descriptions) + chatHistory + user message
    - Output: alleen tekst (response string)
    |
    ├── Return naar frontend: { text: AI 1's antwoord }
    |
    └── Trigger generateCharacterDraft via Cloud Tasks
            - Payload: characterId, currentCharacter, chatHistory, ai1Response
    |
    v
generateCharacterDraft Cloud Function (async, aparte function)
    |
    v
AI 2: JSON-generator
    - Systeem prompt: strikt JSON schema + regels
    - Input: huidige character JSON (zonder spell/feature descriptions) + chatHistory + user message + AI 1's response
    - Output: puur JSON object (volledig karakter)
    - Validatie via Zod schema (server-side)
    - Opslaan als draft version in Firestore
    |
    v
Frontend ontvangt draft via Firestore real-time listener
```

### Twee Cloud Functions

1. **`characterChat`** — Callable function (onCall). Roept AI 1 aan, retourneert tekst direct aan frontend, en triggert `generateCharacterDraft` via Cloud Tasks.
2. **`generateCharacterDraft`** — Task queue function (onTaskDispatched). Ontvangt de context van characterChat, roept AI 2 aan, valideert de JSON, en slaat de draft version op in Firestore.

De gebruiker krijgt AI 1's antwoord onmiddellijk. De draft version verschijnt asynchroon via de Firestore real-time listener.

---

## Technical Details

### 1. Nieuwe response interface

**Bestand:** `functions/src/character-chat.ts`

```typescript
// Oud
export interface CharacterChatResponse {
  text: string;
}

// Nieuw
export interface CharacterChatResponse {
  text: string;         // AI 1's creatieve antwoord (retourneert direct, wacht niet op AI 2)
}
```

### 2. Nieuwe request interface

```typescript
export interface CharacterChatRequest {
  characterId: string;           // Nodig om draft in Firestore op te slaan
  currentCharacter: DndCharacter; // Huidige character state (zonder spell/feature descriptions)
  chatHistory: ChatHistoryMessage[];
}
```

De frontend stript `description` en `usage` van spells EN `description` van featuresAndTraits voordat het karakter wordt meegestuurd. Dit geldt voor zowel AI 1 als AI 2 — het karakter wordt eenmalig gestript en aan beide doorgegeven.

De `systemPrompt` wordt niet meer door de frontend meegestuurd — beide prompts worden server-side beheerd.

### 3. AI 1 - Tekst-responder

**Nieuw bestand:** `functions/src/prompts/character-responder.prompt.ts`

Systeem prompt gericht op:
- Creatief en behulpzaam D&D expert
- Ontvangt het huidige karakter (zonder spell/feature descriptions) als context
- Beantwoord de gebruiker in het Nederlands
- Geen JSON output, alleen tekst
- Geen emoticons
- Korte, beknopte antwoorden

### 4. AI 2 - JSON-generator

**Nieuw bestand:** `functions/src/prompts/character-json-generator.prompt.ts`

Kopie/variant van huidige `character-builder.prompt.ts` maar:
- Verhuisd naar functions directory
- Strikter: output MOET puur JSON zijn, geen begeleidende tekst
- Bevat het volledige DndCharacter JSON schema
- Ontvangt AI 1's tekstreactie als context — zodat de JSON het verhaal van AI 1 nauwkeurig weerspiegelt
- Ontvangt het huidige karakter zonder spell/feature descriptions (zelfde gestripte versie als AI 1)
- Retourneert altijd het **volledige karakter** (geen delta) — eenvoudiger te valideren en direct op te slaan
- Spells: alleen name, level, school — nooit description of usage
- Features: alleen name en source — nooit description

### 5. Character schema naar functions

**Verplaats:** `src/app/shared/schemas/dnd-character.schema.ts` → `functions/src/schemas/dnd-character.schema.ts`

- De Zod schema definities verhuizen naar functions voor server-side validatie
- Frontend behoudt losse TypeScript interfaces (geen Zod dependency meer)
- Types worden gedupliceerd: backend heeft Zod schemas + inferred types, frontend heeft plain interfaces
- Frontend interfaces worden handmatig in sync gehouden met backend schema

### 6. Draft version systeem in Firestore

**Bestand:** `functions/src/character-chat.ts` (of aparte utility)

Na succesvolle AI 2 response:

```typescript
async function saveDraftVersion(characterId: string, character: DndCharacter) {
  const versionsRef = admin.firestore()
    .collection('characters').doc(characterId)
    .collection('versions');

  // Haal nieuwste versie op (1 query)
  const lastVersionSnap = await versionsRef
    .orderBy('versionNumber', 'desc')
    .limit(1)
    .get();

  if (!lastVersionSnap.empty && lastVersionSnap.docs[0].data().isDraft) {
    // Nieuwste versie is al een draft → overschrijven
    await lastVersionSnap.docs[0].ref.update({
      character,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    // Nieuwe draft version aanmaken
    const nextNumber = lastVersionSnap.empty ? 1 : lastVersionSnap.docs[0].data().versionNumber + 1;

    await versionsRef.add({
      id: generateId(),
      versionNumber: nextNumber,
      character,
      commitMessage: 'Draft via AI chat',
      source: 'ai',
      isDraft: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}
```

### 7. "Update Character" actie

**Bestand:** Frontend service (character-version.service.ts of chat.service.ts)

De frontend kent de draft version al via de onSnapshot listener — geen extra query nodig. Bij klik op "Update Character":

```typescript
async commitDraft(characterId: string, draftVersionId: string): Promise<void> {
  const draftRef = doc(this.firestore, `characters/${characterId}/versions/${draftVersionId}`);
  await updateDoc(draftRef, { isDraft: false });
  await updateDoc(doc(this.firestore, `characters/${characterId}`), {
    activeVersionId: draftVersionId,
    updatedAt: serverTimestamp(),
  });
}
```

### 8. Frontend: Firestore listener toont altijd nieuwste versie

**Bestand:** `src/app/chat/chat.service.ts` / character builder component

Verwijder de `draftCharacter` signal. In plaats daarvan:
- Real-time Firestore onSnapshot listener op de versions subcollection (orderBy versionNumber desc, limit 1)
- Toont altijd de nieuwste versie, ongeacht `isDraft`
- Als `isDraft === true`: toon ook de draft banner met "Update Character" / "Dismiss" knoppen
- "Update Character" → patch `isDraft: false` + update `activeVersionId`
- "Dismiss" → verwijder de draft version uit Firestore (vorige versie wordt weer de nieuwste)

### 9. Firestore security rules update

**Bestand:** `firestore.rules`

De versions subcollection moet nu updates toestaan voor:
- `isDraft` field toggle (false → committed)
- Draft overschrijven (character field update op drafts)

```
match /versions/{versionId} {
  allow read: if true;
  allow create: if isCharacterOwner(characterId);
  allow update: if isCharacterOwner(characterId)
    && resource.data.isDraft == true;
  allow delete: if isCharacterOwner(characterId)
    && resource.data.isDraft == true;
}
```

### 10. Wat als AI 2 faalt?

- AI 1's tekstreactie is al geretourneerd — gebruiker merkt niets
- `generateCharacterDraft` logt de error naar Sentry
- Geen draft version in Firestore → geen draft preview card in de frontend
- Cloud Tasks heeft ingebouwde retry logica als de function crasht

---

## Bestanden die worden gewijzigd

| Bestand | Wijziging |
|---------|-----------|
| `functions/src/character-chat.ts` | AI 1 call + Cloud Tasks trigger naar generateCharacterDraft |
| `functions/src/generate-character-draft.ts` | **Nieuw**: AI 2 call + Zod validatie + draft opslag in Firestore |
| `functions/src/prompts/character-responder.prompt.ts` | **Nieuw**: AI 1 systeem prompt |
| `functions/src/prompts/character-json-generator.prompt.ts` | **Nieuw**: AI 2 systeem prompt (schema + regels) |
| `functions/src/schemas/dnd-character.schema.ts` | **Nieuw**: Verplaatst Zod schema naar backend |
| `src/app/chat/chat.service.ts` | Verwijder in-memory draft, Firestore listener, nieuwe response handling |
| `src/app/core/services/character-version.service.ts` | `commitDraft()` methode, draft queries |
| `src/app/prompts/character-builder.prompt.ts` | Verwijderen of leegtrekken (prompt is nu server-side) |
| `firestore.rules` | Update rules voor draft versions |
| `src/app/features/character-builder/` | Draft preview via Firestore data i.p.v. signal |

---

## Beslissingen

| Vraag | Beslissing |
|-------|-----------|
| Type sharing | **Dupliceren** — Frontend: plain interfaces. Backend: Zod schema + inferred types. |
| Delta vs volledig karakter | **Volledig karakter** — AI 2 stuurt altijd het complete character JSON terug. Eenvoudiger te valideren en direct op te slaan. |
| Model keuze | **Beide gpt-5-mini** — Zelfde model via Azure Foundry voor AI 1 en AI 2. |
| Dismiss draft | **Verwijderen uit Firestore** — Draft version wordt verwijderd bij dismiss. |
| AI 2 trigger | **Aparte Cloud Function** — `generateCharacterDraft` via Cloud Tasks. Betrouwbaar, onafhankelijk van `characterChat` lifecycle. |
| Character context | **Beide AI's** ontvangen het huidige karakter (zonder spell/feature descriptions). |

---

## Acceptatiecriteria

- [ ] `characterChat` roept AI 1 aan en retourneert tekst direct aan de frontend
- [ ] `characterChat` triggert `generateCharacterDraft` via Cloud Tasks na AI 1
- [ ] `generateCharacterDraft` roept AI 2 aan met AI 1's response als context
- [ ] AI 1 ontvangt het huidige karakter (zonder spell/feature descriptions)
- [ ] AI 1 retourneert alleen tekst, geen JSON
- [ ] AI 2 ontvangt AI 1's response als input en retourneert alleen valid JSON, gevalideerd via Zod schema
- [ ] AI 2's output wordt als draft version opgeslagen in Firestore
- [ ] Maximaal 1 draft version per character
- [ ] Bestaande draft wordt overschreven bij nieuwe chat message
- [ ] "Update Character" zet `isDraft` op `false` en update `activeVersionId`
- [ ] Frontend toont draft via Firestore real-time listener
- [ ] "Dismiss" verwijdert draft version
- [ ] Character schema validatie draait server-side (functions)
- [ ] System prompts worden server-side beheerd (niet meegestuurd door frontend)
- [ ] Als AI 2 faalt, heeft gebruiker AI 1's tekstreactie al ontvangen (geen impact)
- [ ] Firestore rules staan draft updates/deletes toe
- [ ] Geen regressies in bestaande chat functionaliteit

---

## Dependencies

- Ticket #48 (Character Chat Performance) — reeds Done
- Gerelateerd: Ticket #49 (Performance Optimization) — delta-merge logica kan hergebruikt worden
