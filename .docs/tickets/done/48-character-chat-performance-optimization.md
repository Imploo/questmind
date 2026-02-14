# Ticket #48 – Character Chat Performance Optimization

- **Created:** 2026-02-14
- **Status:** Done
- **Completed:** 2026-02-14
- **Priority:** High
- **Effort:** 3–5 days

---

## Description

Character chat responses via `characterChat` (Claude Haiku) zijn merkbaar traag. De root cause is dat het model bij iedere chat response het volledige karakter als JSON teruggeeft, inclusief uitgebreide spell descriptions. Dit resulteert in 1000–1500+ output tokens per response, terwijl het nuttige gedeelte (de daadwerkelijke wijziging) slechts een fractie is.

LLM-latency wordt primair bepaald door het aantal **output tokens**: die worden sequentieel één voor één gegenereerd. Input tokens worden parallel verwerkt en zijn minder bepalend voor snelheid.

### Huidig knelpunt (gemeten voorbeeld)

```
thought:    ~150 tokens   (interne redenering)
text:       ~200 tokens   (gebruikersantwoord)
character:  ~1500 tokens  (volledig karakter JSON inclusief spell descriptions)
```

Alleen de spell descriptions in de character output zijn al goed voor ~800–1000 tokens per response.

---

## Expected Result

- Significant lagere latency bij character chat responses
- LLM genereert alleen gewijzigde velden (delta), niet het volledige karakter
- Spell descriptions en usage worden nooit door de LLM gegenereerd; ze komen uit een statische SRD-database of een aparte lookup call
- Spell details worden **lazy** geladen: pas wanneer de gebruiker een spell uitklapt
- Nieuwe spells (niet-SRD) krijgen hun beschrijving via `resolveSpell`, dat direct een patch doet op het karakter in Firestore
- Eenmaal opgeslagen worden descriptions nooit opnieuw opgehaald

---

## Technical Details

### Architectuuroverzicht

```
Chat message
  │
  ▼
characterChat (Cloud Function)
  ├── Input: karakter zonder spell descriptions/usage (bespaart input tokens)
  ├── LLM geeft terug: thought + text + characterDelta (alleen gewijzigde velden)
  │
  ▼
Frontend: merge delta op huidig karakter
  │
  ▼
Gebruiker klapt een spell uit
  ├── description + usage al aanwezig op spell? → direct tonen
  ├── In SRD JSON?  → statische lookup, toon direct
  └── Onbekend?    → resolveSpell Cloud Function
                       ├── Haiku genereert description + usage
                       ├── Patch karakter direct in Firestore (geen nieuwe version)
                       ├── Als draftCharacter actief: ook die updaten
                       └── Frontend toont loader tot resultaat binnenkomt
```

---

### Wijziging 1: SpellSchema uitbreiden

**Bestand:** `src/app/shared/schemas/dnd-character.schema.ts`

`description` wordt optioneel en een nieuw optioneel veld `usage` wordt toegevoegd voor VSM-componenten, casting time, range, duration, etc.:

```typescript
export const SpellSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  usage: z.string().optional(), // bijv. "Casting Time: 1 action | Range: 60 ft | Components: V, S | Duration: Instantaneous"
  level: z.number().min(0).max(9).optional(),
  school: z.string().optional(),
});
```

---

### Wijziging 2: Strip spell descriptions/usage uit LLM input

**Bestand:** `src/app/shared/utils/build-character-context.ts`

Bij het opbouwen van de chat context wordt het karakter als JSON in de eerste user message meegestuurd. Strip `description` en `usage` van alle spells voordat het naar de LLM gaat.

Doel: minder input tokens, en het model "ziet" descriptions niet, waardoor het minder geneigd is ze terug te sturen.

---

### Wijziging 3: LLM geeft delta terug in plaats van volledig karakter

**Bestand:** `functions/src/character-chat.ts`

Verander het tool schema van `character` (volledig) naar `characterDelta`:

```typescript
{
  name: "submit_response",
  input_schema: {
    type: "object",
    properties: {
      thought: { type: "string" },
      message: { type: "string" },
      characterDelta: {
        type: "object",
        description: "Alleen de gewijzigde velden van het karakter als partial JSON object. Gebruik null om een veld te verwijderen. Laat velden weg die niet zijn gewijzigd.",
        additionalProperties: true
      }
    },
    required: ["thought", "message"]
  }
}
```

**Bestand:** `src/app/prompts/character-builder.prompt.ts`

Voeg instructie toe:
- Stuur in `characterDelta` alleen de velden die daadwerkelijk zijn gewijzigd
- Spells: alleen `name`, `level`, `school` – nooit `description` of `usage`
- Bij geen wijzigingen: laat `characterDelta` weg

---

### Wijziging 4: Frontend delta-merge

**Bestand:** `src/app/chat/chat.service.ts`

Vervang de huidige logica die een volledig `character` JSON parset door een deep-merge van `characterDelta` op het huidige karakter:

```typescript
function mergeCharacterDelta(current: DndCharacter, delta: Partial<DndCharacter>): DndCharacter {
  // Deep merge: geneste objecten worden gemerged, arrays vervangen
  // Null-waarden verwijderen het betreffende veld
}
```

**Let op array-semantiek:**
- `spellcasting.spells`: bij vervanging van de array, behoud `description` en `usage` van spells die al in het huidige karakter stonden (op basis van `name`)
- `featuresAndTraits`: vervang de volledige array als deze in de delta zit
- `abilities`, `savingThrows`, etc.: deep merge

---

### Wijziging 5: Lazy spell detail lookup

Spell descriptions en usage worden **alleen opgehaald wanneer de gebruiker een spell uitklapt** in de UI. Niet proactief na een chat response.

**Bestand:** `src/app/features/character-builder/components/character-sheet/character-sheet.component.ts`

Bij het uitklappen van een spell:
1. Heeft de spell al `description` en `usage`? → direct tonen
2. Zo niet: toon een loader en start lookup

**Stap A – Statische lookup via `data/Spell.json`:**

Er is een statisch spell-databestand aanwezig op `data/Spell.json`. Dit bestand wordt gebruikt als primaire lookup bron — geen network call, geen cold start.

```typescript
// src/app/shared/utils/spell-lookup.ts
export function lookupSpellFromJson(name: string): SpellSchema | null
```

Importeer of laad `data/Spell.json` en zoek op naam (case-insensitive). Map de velden naar `description` en `usage` zoals hieronder beschreven.

**Veld-mapping van `Spell.json` naar `SpellSchema`:**

`description` = samenvoegen van `desc` en `higher_level`:
```
{desc}

At Higher Levels. {higher_level}   ← alleen toevoegen als higher_level aanwezig is
```

`usage` = samenvoegen van casting-gerelateerde velden in een leesbare string:
```
Casting Time: {casting_time} | Range: {range_text} | Components: {components} | Duration: {duration}
```

Waarbij `components` wordt opgebouwd uit de losse boolean-velden:
- `verbal` → `"V"`
- `somatic` → `"S"`
- `material` → `"M"` (voeg toe: `({material_specified})` als aanwezig en `material_specified` niet null is)

Voorbeeld voor Acid Arrow:
```
description: "A shimmering green arrow... (desc)\n\nAt Higher Levels. When you cast this spell..."
usage:       "Casting Time: action | Range: 90 feet | Components: V, S, M (Powdered rhubarb leaf and an adder's stomach.) | Duration: instantaneous"
```

**Stap B – Fallback: `resolveSpell` Cloud Function:**

Als de spell niet in `Spell.json` staat, roep `resolveSpell` aan. Toon een loader in de UI totdat het resultaat binnenkomt.

---

### Wijziging 6: `resolveSpell` Cloud Function

**Bestand:** `functions/src/resolve-spell.ts`

```typescript
export const resolveSpell = onCall(async (request) => {
  const { characterId, spellName, spellLevel, spellSchool } = request.data;

  // 1. Haiku call: genereer description + usage voor deze spell
  // 2. Patch karakter direct in Firestore — geen nieuwe version aanmaken
  //    Schrijf alleen het specifieke spell-object in het huidige active version
  // 3. Return: { description, usage }
})
```

**Patch-strategie (geen nieuwe version):**
- Lees het huidige active version document op
- Update alleen het betreffende spell-object binnen `character.spellcasting.spells`
- Schrijf terug naar hetzelfde version document (geen nieuw versienummer)
- Dit triggert geen "karakter gewijzigd" melding in de frontend

**Frontend synchronisatie na resolve (zowel SRD-hit als `resolveSpell`):**
- De frontend patcht het `description` en `usage` veld van de spell in het **huidige active version document** in Firestore (geen nieuw versienummer)
- Als een `draftCharacter` actief is, wordt ook die in-memory bijgewerkt
- Zo blijft zowel de persistente opslag als de draft in sync, zonder een "karakter gewijzigd" melding te triggeren

---

### Wijziging 7: max_tokens verlagen

**Bestand:** `functions/src/character-chat.ts`

Verlaag van `4096` naar `1024`. Met delta-output + geen spell descriptions past een volledige response ruimschoots binnen 1024 tokens.

---

## Bestanden die worden gewijzigd

| Bestand | Wijziging |
|---------|-----------|
| `src/app/shared/schemas/dnd-character.schema.ts` | `description` optioneel, `usage` veld toevoegen aan SpellSchema |
| `functions/src/character-chat.ts` | Tool schema → `characterDelta`, `max_tokens` → 1024 |
| `functions/src/resolve-spell.ts` | Nieuw: Cloud Function, patch Firestore direct, return description + usage |
| `functions/src/index.ts` | Export `resolveSpell` |
| `src/app/prompts/character-builder.prompt.ts` | Instructie: alleen delta, nooit description/usage in spells |
| `src/app/shared/utils/build-character-context.ts` | Strip description + usage uit spell input |
| `src/app/chat/chat.service.ts` | Delta-merge logica, behoud bestaande spell descriptions bij array-merge |
| `src/app/shared/utils/spell-lookup.ts` | Nieuw: statische lookup utility op basis van `data/Spell.json` |
| `data/Spell.json` | Bestaand: primaire spell database (al aanwezig) |
| `src/app/features/character-builder/components/character-sheet/character-sheet.component.ts` | Lazy load spell details on expand, toon loader |

---

## Verwachte token reductie

| Scenario | Huidig | Na optimalisatie |
|----------|--------|-----------------|
| Output tokens per response | ~1500–1800 | ~300–600 |
| Input tokens per request | ~2000–3000 | ~1000–1500 |
| Spell description tokens | ~800–1000 | 0 |

Verwachte snelheidswinst: **50–70% reductie in latency** voor gemiddelde chat response.

---

## Acceptatiecriteria

- [ ] SpellSchema heeft `description` en `usage` als optionele velden
- [ ] Character chat responses bevatten nooit meer `description` of `usage` in spells
- [ ] Delta-merge behoudt `description`/`usage` van bestaande spells
- [ ] Spell details worden pas geladen wanneer de gebruiker een spell uitklapt
- [ ] Loader zichtbaar totdat `description` + `usage` geladen zijn
- [ ] Spells worden eerst opgezocht in `data/Spell.json` (geen network call, geen cold start)
- [ ] Onbekende spells (niet in `Spell.json`) worden via `resolveSpell` opgehaald
- [ ] Na resolve patcht de frontend het active version document in Firestore (geen nieuwe version)
- [ ] Als een draftCharacter actief is, wordt ook die in-memory bijgewerkt
- [ ] Geen "karakter gewijzigd" melding als alleen een spell description wordt opgehaald
- [ ] `max_tokens` verlaagd naar 1024
- [ ] Geen regressies in bestaande character chat functionaliteit

---

## Dependencies

- Geen blokkerende dependencies
- Gerelateerd aan: #47 (AI Stack refactor naar Haiku)
