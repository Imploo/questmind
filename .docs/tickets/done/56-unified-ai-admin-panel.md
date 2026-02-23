# Ticket #56: Unified AI Admin Panel voor alle AI Features

**Created:** 2026-02-18
**Priority:** High
**Status:** Done
**Effort:** 1-2 weken
**Dependencies:** -

---

## Beschrijving

Momenteel worden AI-instellingen (model, temperature, tokens, etc.) verspreid over verschillende backend-bestanden geconfigureerd, deels hardcoded en deels via de Firestore `settings/ai` document. Er is een bestaande `AiSettingsService` in de frontend die al luistert naar dit document, maar:

1. Er is **geen admin UI** om deze instellingen te beheren
2. Niet alle AI features lezen hun config uit Firestore — veel waarden zijn **hardcoded** in de backend
3. De config-structuur in Firestore dekt niet alle features

Dit ticket maakt een **eenduidig admin panel** waarmee alle AI-aanroepen centraal geconfigureerd kunnen worden.

---

## Compleet overzicht van alle AI-aanroepen

### 1. Character Chat — AI 1: Tekst Responder
| Eigenschap | Waarde |
|---|---|
| **Functie** | Reageert als D&D 5e expert ("The Sidekick") op gebruikersberichten |
| **Provider** | Anthropic (Claude) |
| **Model** | `claude-haiku-4-5-20251001` |
| **Temperature** | Niet geconfigureerd (provider default) |
| **Max Tokens** | 512 (hardcoded) |
| **Bestanden** | `functions/src/character-chat.ts`, `functions/src/prompts/character-responder.prompt.ts` |
| **Configureerbaar via Firestore?** | Nee — model en tokens hardcoded |

### 2. Character Chat — AI 2: JSON Generator
| Eigenschap | Waarde |
|---|---|
| **Functie** | Genereert character JSON object op basis van chatcontext |
| **Provider** | Google Gemini |
| **Model** | `gemini-3-flash-preview` |
| **Temperature** | 0.1 (hardcoded) |
| **Max Output Tokens** | 8192 (hardcoded) |
| **Response MIME** | `application/json` |
| **Bestanden** | `functions/src/generate-character-draft.ts`, `functions/src/prompts/character-json-generator.prompt.ts` |
| **Configureerbaar via Firestore?** | Nee — hardcoded |

### 3. Spell Resolution
| Eigenschap | Waarde |
|---|---|
| **Functie** | Geeft D&D 5e spell beschrijvingen en mechanische details |
| **Provider** | Google Gemini |
| **Model** | `gemini-3-flash-preview` |
| **Temperature** | Niet geconfigureerd |
| **Max Output Tokens** | 4096 (hardcoded) |
| **Response MIME** | `application/json` |
| **Bestanden** | `functions/src/resolve-spell.ts` |
| **Configureerbaar via Firestore?** | Nee — hardcoded |

### 4. Feature/Trait Resolution
| Eigenschap | Waarde |
|---|---|
| **Functie** | Geeft D&D 5e feature/trait beschrijvingen met mechanische effecten |
| **Provider** | Google Gemini |
| **Model** | `gemini-3-flash-preview` |
| **Temperature** | Niet geconfigureerd |
| **Max Output Tokens** | 4096 (hardcoded) |
| **Response MIME** | `application/json` |
| **Bestanden** | `functions/src/resolve-feature.ts` |
| **Configureerbaar via Firestore?** | Nee — hardcoded |

### 5. Image Generation
| Eigenschap | Waarde |
|---|---|
| **Functie** | Genereert fantasy character portraits |
| **Provider** | FAL.ai |
| **Model** | `fal-ai/flux/schnell` |
| **Bestanden** | `functions/src/generate-image.ts`, `src/app/prompts/image-generation.prompt.ts` |
| **Configureerbaar via Firestore?** | Deels — model via `settings/ai` (defaultImageGenerationConfig) |

### 6. Audio Transcriptie
| Eigenschap | Waarde |
|---|---|
| **Functie** | Transcribeert D&D sessie-audio naar raw story narratief |
| **Provider** | Google Gemini |
| **Model** | Via AI Settings (default: `gemini-2.0-flash-exp`) |
| **Temperature** | 0.1 |
| **TopP** | 1 |
| **TopK** | 40 |
| **Max Output Tokens** | 128.000 |
| **Bestanden** | `functions/src/transcribe-audio-fast.ts`, `functions/src/audio/transcription-prompt.ts` |
| **Configureerbaar via Firestore?** | Ja — leest uit `settings/ai` feature config |

### 7. Story Generation
| Eigenschap | Waarde |
|---|---|
| **Functie** | Transformeert raw transcriptie naar leesbaar sessie-verhaal |
| **Provider** | Google Gemini |
| **Model** | Via AI Settings |
| **Temperature** | 0.8 |
| **TopP** | 0.95 |
| **TopK** | 40 |
| **Max Output Tokens** | 32.000 |
| **Bestanden** | `functions/src/story/story-generator.service.ts`, `functions/src/workers/story-generation-worker.ts`, `functions/src/prompts/session-story-generator.prompt.ts` |
| **Configureerbaar via Firestore?** | Ja — leest uit `settings/ai` feature config |

### 8. Podcast Script Generation
| Eigenschap | Waarde |
|---|---|
| **Functie** | Converteert sessie-verhaal naar twee-host podcast dialoog |
| **Provider** | Azure Foundry (OpenAI-compatible endpoint) |
| **Model** | `Mistral-Large-3` |
| **Max Tokens** | 4096 (hardcoded) |
| **Temperature** | Niet geconfigureerd |
| **Bestanden** | `functions/src/prompts/podcast-script-generator.prompt.ts`, `functions/src/generate-podcast-audio.ts` |
| **Configureerbaar via Firestore?** | Nee — hardcoded |

### 9. Podcast Audio Generation (TTS)
| Eigenschap | Waarde |
|---|---|
| **Functie** | Converteert podcast script naar dual-voice audio |
| **Provider** | ElevenLabs |
| **Voice Host 1** | `tvFp0BgJPrEXGoDhDIA4` (Thomas) |
| **Voice Host 2** | `7qdUFMklKPaaAVMsBTBt` (Roos) |
| **Bestanden** | `functions/src/generate-podcast-audio.ts` |
| **Configureerbaar via Firestore?** | Deels — voice IDs via `settings/ai` podcastVoices, maar ook env var fallbacks |

---

## Overzichtstabel

| # | Feature | Provider | Model | Temp | Max Tokens | Firestore Config? |
|---|---------|----------|-------|------|------------|-------------------|
| 1 | Character Chat (tekst) | Anthropic | claude-haiku-4-5 | — | 512 | Nee |
| 2 | Character Draft (JSON) | Gemini | gemini-3-flash-preview | 0.1 | 8192 | Nee |
| 3 | Spell Resolution | Gemini | gemini-3-flash-preview | — | 4096 | Nee |
| 4 | Feature Resolution | Gemini | gemini-3-flash-preview | — | 4096 | Nee |
| 5 | Image Generation | FAL.ai | flux/schnell | — | — | Deels |
| 6 | Audio Transcriptie | Gemini | gemini-2.0-flash-exp | 0.1 | 128.000 | Ja |
| 7 | Story Generation | Gemini | (via settings) | 0.8 | 32.000 | Ja |
| 8 | Podcast Script | Azure/Mistral | Mistral-Large-3 | — | 4096 | Nee |
| 9 | Podcast Audio (TTS) | ElevenLabs | text-to-dialogue | — | — | Deels |

---

## Verwacht resultaat

Een admin panel pagina (`/admin/ai-settings`) met:

1. **Per AI feature een configureerbare kaart** met:
   - Model selectie (dropdown met beschikbare modellen per provider)
   - Temperature slider (0.0 – 2.0)
   - Top P slider (0.0 – 1.0)
   - Top K input (0 – 100)
   - Max Output Tokens input
   - Provider-specifieke opties (bijv. voice IDs voor TTS, response MIME type)

2. **Alle features lezen hun config uit Firestore** — geen hardcoded waarden meer in backend code

3. **Real-time opslaan** — wijzigingen worden direct opgeslagen naar `settings/ai` en backend pikt ze automatisch op

4. **Fallback defaults** — als een setting ontbreekt in Firestore, gebruikt de backend sensible defaults

5. **Validatie** — ongeldige waarden worden geblokkeerd (bijv. temperature buiten bereik)

---

## Technische details

### Frontend

#### Nieuw Admin Panel component
- Route: `/admin/ai-settings`
- Standalone Angular component met OnPush change detection
- Leest huidige config via bestaande `AiSettingsService`
- Schrijft wijzigingen terug naar Firestore `settings/ai` document
- Reactive forms per feature met validatie
- Groepering per feature met collapsible secties

#### Uitbreiding AiSettings interface
De huidige `AiSettings` interface moet uitgebreid worden om alle 9 features te dekken:

```typescript
export interface AiSettings {
  features: {
    // Bestaand
    transcription: AiModelConfig;
    storyGeneration: AiModelConfig;
    podcastScript: AiModelConfig;
    characterChat: AiModelConfig;
    imageGeneration: AiImageConfig;
    podcastVoices: { host1VoiceId: string; host2VoiceId: string };

    // Nieuw toe te voegen
    characterDraft: AiModelConfig;       // Character JSON generator
    spellResolution: AiModelConfig;      // Spell lookup
    featureResolution: AiModelConfig;    // Feature/trait lookup
    characterChatText: AiModelConfig;    // Character chat tekst (Claude)
  };
}
```

#### UI Layout per feature

Elke feature kaart bevat:
- **Header:** Feature naam + korte beschrijving + provider badge
- **Model:** Text input of dropdown (afhankelijk van provider)
- **Temperature:** Slider met numeriek veld (stap 0.05)
- **Top P:** Slider met numeriek veld
- **Top K:** Numeriek veld
- **Max Output Tokens:** Numeriek veld
- **Extra opties:** Provider-specifiek (bijv. response MIME type, voice IDs)
- **Reset to defaults:** Button per feature

### Backend

#### Alle Cloud Functions updaten om config uit Firestore te lezen

Per functie moet de Firestore `settings/ai` document gelezen worden bij elke aanroep (of gecached met korte TTL):

1. **`character-chat.ts`** → lees `features.characterChatText` voor model + max_tokens
2. **`generate-character-draft.ts`** → lees `features.characterDraft` voor model + temperature + maxOutputTokens
3. **`resolve-spell.ts`** → lees `features.spellResolution` voor model + maxOutputTokens
4. **`resolve-feature.ts`** → lees `features.featureResolution` voor model + maxOutputTokens
5. **`generate-image.ts`** → lees `features.imageGeneration` (al deels geimplementeerd)
6. **`transcribe-audio-fast.ts`** → reeds via AI Settings (verifiëren)
7. **`story-generator.service.ts`** → reeds via AI Settings (verifiëren)
8. **`generate-podcast-audio.ts`** (script) → lees `features.podcastScript` voor model + max_tokens
9. **`generate-podcast-audio.ts`** (TTS) → lees `features.podcastVoices` (al deels geimplementeerd)

#### Gedeelde config-helper

Maak een `getAiFeatureConfig()` utility in de backend:

```typescript
async function getAiFeatureConfig(
  featureKey: string,
  defaults: AiModelConfig
): Promise<AiModelConfig> {
  const settingsDoc = await admin.firestore().doc('settings/ai').get();
  const settings = settingsDoc.data() as AiSettings | undefined;
  return settings?.features?.[featureKey] ?? defaults;
}
```

### API Keys

API keys blijven in environment variables (NIET in Firestore):
- `CLAUDE_API_KEY` — Anthropic
- `GOOGLE_AI_API_KEY` — Google Gemini
- `FAL_API_KEY` — FAL.ai
- `AZURE_FOUNDRY_API_KEY` + `AZURE_FOUNDRY_ENDPOINT` — Azure/Mistral
- `ELEVENLABS_API_KEY` — ElevenLabs

---

## Implementatiestappen

1. **Uitbreiden `AiSettings` interface** (frontend + backend) met alle feature keys
2. **Backend: gedeelde config-helper** maken die Firestore leest met fallback defaults
3. **Backend: alle 9 Cloud Functions updaten** om config uit Firestore te lezen
4. **Frontend: Admin panel component** bouwen met reactive forms
5. **Frontend: routing** toevoegen voor `/admin/ai-settings`
6. **Firestore: seed document** aanmaken met alle defaults
7. **Testen:** elke feature handmatig testen met gewijzigde config
8. **Firestore rules:** schrijfrechten beperken tot admin users

---

## Risico's en overwegingen

- **Performance:** Elke Cloud Function doet een extra Firestore read. Overweeg caching met korte TTL (bijv. 60s) om kosten te beperken.
- **Provider-specifieke modellen:** Niet elk model ondersteunt dezelfde parameters (bijv. Claude heeft geen topK). Het admin panel moet per provider alleen relevante velden tonen.
- **Validatie:** Backend moet config valideren voordat het gebruikt wordt — ongeldige waarden moeten fallbacken naar defaults.
- **Toegangsbeheer:** Admin panel moet alleen toegankelijk zijn voor admin users (Firestore rules + frontend route guard).
