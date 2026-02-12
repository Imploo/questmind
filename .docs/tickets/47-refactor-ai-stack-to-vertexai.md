# Ticket #47 — Refactor AI Stack naar Vertex AI + Claude Haiku

- **Created:** 2026-02-12
- **Status:** Todo
- **Priority:** High
- **Effort:** 1–2 weken

---

## Description

Refactor de backend AI-stack om gebruik te maken van:
- **Claude Haiku 4.5** voor text-to-text (characterChat, podcast script)
- **Imagen 4** op Vertex AI voor afbeeldingen (vervangt FAL.ai)
- **Chirp 3 HD** voor podcast audio (vervangt ElevenLabs)
- **GCloud Storage → gs:// URI** voor audio uploads (in plaats van Gemini Files API)
- **Gedeelde context-builder utility** voor characterChat én generateImage

Transcriptie (`transcribeAudioFast`, `storyGenerationWorker`) wordt **niet** aangepast.

---

## Expected Result

- `characterChat` gebruikt Claude Haiku 4.5 server-side
- `generateImage` gebruikt Imagen 4 op Vertex AI (us-central1)
- `generatePodcastAudio` genereert script via Claude Haiku 4.5 en audio via Chirp 3 HD (MP3 output)
- Audio bestanden worden geüpload naar GCloud Storage bucket; downstream functies ontvangen een `gs://` URI
- Een gedeelde `buildContextContents()` util composet system prompt + karakter + chat history voor zowel characterChat als generateImage

---

## Technical Details

### 1. Claude Haiku 4.5 — characterChat

**Huidige situatie:**
- `character-chat.ts` ontvangt `model`, `contents` en `config` van de client
- Roept Google GenAI aan met de client-gespecificeerde model

**Nieuwe situatie:**
- Hardcode model naar `claude-haiku-4-5@20251001`
- SDK: `@anthropic-ai/vertex-sdk` — gebruikt ADC / service account, **geen API key nodig**
- Regio: `europe-west1` (Haiku 4.5 beschikbaar in EU)
- System prompt + character context + messages worden server-side samengesteld via de nieuwe `buildContextContents()` utility
- Client stuurt alleen nog `characterId` en het nieuwste bericht

**Request interface na refactor:**
```typescript
interface CharacterChatRequest {
  characterId: string;
  campaignId: string;
  message: string;           // Alleen het nieuwste user bericht
  chatHistory?: Message[];   // Eerdere berichten voor context
}
```

**Implementatie:**
```typescript
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

// Geen API key — gebruikt Application Default Credentials (service account in Cloud Functions)
const client = new AnthropicVertex({
  projectId: process.env.GCLOUD_PROJECT,
  region: 'europe-west1',
});

const response = await client.messages.create({
  model: 'claude-haiku-4-5@20251001',
  max_tokens: 1024,
  system: builtSystemPrompt,   // via buildContextContents()
  messages: builtMessages,     // via buildContextContents()
});
```

---

### 2. Gedeelde Context-Builder Utility

**Nieuwe file:** `functions/src/utils/build-context-contents.ts`

**Doel:** Composet een consistente AI-context van:
1. Een meegeleverde `systemPrompt` string (verschilt per use case)
2. Het huidige karakter-object (naam, ras, klasse, persoonlijkheid, etc.)
3. De bestaande chat-geschiedenis (berichten)

**Bestaande types gebruiken — geen nieuwe interfaces:**

| Gebruik | Bestaand type | Locatie |
|---|---|---|
| Karakter data | `DndCharacter` | `src/app/shared/schemas/dnd-character.schema.ts` |
| Karakter metadata | `Character` | `src/app/core/models/schemas/character.schema.ts` |
| Visuele data (image gen) | `CharacterVisuals` | `functions/src/generate-image.ts` (al aanwezig, is subset van `DndCharacter.appearance`) |

> De functions zijn een apart TypeScript project (`functions/tsconfig.json`). `DndCharacter` moet worden geïmporteerd vanuit een gedeeld pad of gekopieerd naar `functions/src/types/character.types.ts`. Bekijk bij implementatie of een `../../src/app/shared` import werkt via tsconfig paths, anders type dupliceren in functions.

**Signatuur:**
```typescript
import { DndCharacter } from '../../src/app/shared/schemas/dnd-character.schema';  // of lokale copy

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface BuiltContext {
  systemPrompt: string;
  messages: Message[];
}

function buildContextContents(
  systemPrompt: string,
  character: DndCharacter,
  messages: Message[]
): BuiltContext
```

**Logica:**
```typescript
export function buildContextContents(
  systemPrompt: string,
  character: DndCharacter,
  messages: Message[]
): BuiltContext {
  const characterContext = `
Je speelt de rol van ${character.name}, een ${character.race} ${character.class}.
${character.personalityTraits ? `Persoonlijkheid: ${character.personalityTraits}` : ''}
${character.backstory ? `Achtergrond: ${character.backstory}` : ''}
${character.appearance?.description ? `Uiterlijk: ${character.appearance.description}` : ''}
`.trim();

  return {
    systemPrompt: `${systemPrompt}\n\n${characterContext}`,
    messages,
  };
}
```

**Gebruik in characterChat:** system prompt = karakter roleplay prompt
**Gebruik in generateImage:** zelfde `buildContextContents()` utility met een image-specifieke system prompt — FAL.ai model en storage flow blijven ongewijzigd.

---

### 3. generateImage — alleen system prompt aanpassen

**FAL.ai blijft** — model, storage flow en `CharacterVisuals` worden niet gewijzigd.

**Enige aanpassing:** de huidige `buildImagePrompt()` functie wordt vervangen door `buildContextContents()` zodat de afbeelding gegenereerd wordt met de volledige karakter-context én chat-geschiedenis in mind.

**Nieuwe system prompt** (`prompts/image-generation.prompt.ts`):
- Instructies voor FAL.ai om D&D karakters realistisch en consistent te genereren
- Stijlrichtlijnen (fantasy, realistisch, gedetailleerd)
- Karakter-context wordt automatisch toegevoegd via `buildContextContents()`

**Implementatie:**
```typescript
import { buildContextContents } from '../utils/build-context-contents';
import { IMAGE_GENERATION_SYSTEM_PROMPT } from '../prompts/image-generation.prompt';

// Vervangt de huidige buildImagePrompt() aanroep
const { systemPrompt } = buildContextContents(
  IMAGE_GENERATION_SYSTEM_PROMPT,
  character,      // DndCharacter — bevat name, race, class, appearance, backstory
  chatHistory     // Recente chat-berichten voor extra context
);

// Stuur opgebouwde prompt naar FAL.ai (ongewijzigd)
const result = await fal.subscribe(request.data.model, {
  input: {
    prompt: `${systemPrompt}\n\n${request.data.prompt}`,
    // ... overige FAL.ai opties ongewijzigd
  },
});
```

---

### 4. Chirp 3 HD — generatePodcastAudio

**Huidige situatie:**
- Script: Google GenAI met `aiSettings.defaultModel` uit Firestore
- Audio: ElevenLabs `textToDialogue.convert()`
- Output: MP3 via stream → temp file → Firebase Storage

**Nieuwe situatie:**

#### 4a. Script generatie → Claude Haiku 4.5 via Vertex AI
```typescript
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

// ADC — service account in Cloud Functions, geen API key nodig
const client = new AnthropicVertex({
  projectId: process.env.GCLOUD_PROJECT,
  region: 'europe-west1',
});

const scriptResponse = await client.messages.create({
  model: 'claude-haiku-4-5@20251001',
  max_tokens: 2048,
  system: PODCAST_SCRIPT_GENERATOR_PROMPT,
  messages: [
    {
      role: 'user',
      content: `SESSION TITLE: ${sessionTitle}\nSESSION DATE: ${sessionDate}\n\nSESSION STORY:\n${story}`,
    },
  ],
});
```

**Voordeel:** Sneller en goedkoper dan grotere Gemini modellen voor script generatie. Geen extra secrets — draait op hetzelfde GCloud service account als de overige functies.

#### 4b. Audio generatie → Chirp 3 HD
```typescript
import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';

const ttsClient = new TextToSpeechClient({
  apiEndpoint: 'eu-texttospeech.googleapis.com',
});

// Bouw SSML uit script segmenten
function buildSsml(segments: PodcastSegment[]): string {
  const voices = {
    host1: 'nl-NL-Chirp3-HD-Charon',
    host2: 'nl-NL-Chirp3-HD-Aoede',
  };

  const ssmlParts = segments.map((seg) =>
    `<voice name="${voices[seg.speaker]}">${escapeXml(seg.text)}</voice>`
  );

  return `<speak>${ssmlParts.join('\n')}</speak>`;
}

const [audioResponse] = await ttsClient.synthesizeSpeech({
  input: { ssml: buildSsml(script.segments) },
  voice: { languageCode: 'nl-NL' },
  audioConfig: {
    audioEncoding: 'MP3' as unknown as protos.google.cloud.texttospeech.v1.AudioEncoding,
  },
});

// audioResponse.audioContent is direct een MP3 Buffer — geen conversie nodig
```

**Voordelen vs ElevenLabs:**
- Geen aparte API key / extern account nodig (binnen GCloud ecosysteem)
- Direct MP3 output — geen temp file + stream conversie
- Goedkoper bij schaal
- EU-regio beschikbaar

**Secrets verwijderen:** `ELEVENLABS_API_KEY` kan uit Secret Manager en `.env` nadat de refactor live is.

---

### 5. GCloud Storage voor audio uploads

**Huidige situatie:**
- `uploadAudioToGemini` uploadt audio rechtstreeks naar de Gemini Files API via een resumable upload
- `initiateGeminiUpload` genereert een pre-authenticated Gemini upload URL voor directe browser-upload
- Downstream functies (`transcribeAudioFast`) ontvangen een `fileUri` van de Gemini Files API

**Nieuwe situatie:**
- Audio wordt geüpload naar de **GCloud Storage bucket** (bijv. `questmind-beta.appspot.com`)
- Downstream functies ontvangen een `gs://` URI
- Vertex AI / Gemini op Vertex AI kan rechtstreeks bij GCS — geen re-upload nodig
- Files API van Gemini Developer API wordt niet meer gebruikt

**Nieuwe upload flow:**

```
Browser → uploadAudioToGemini (Cloud Function)
       → schrijft naar gs://bucket/campaigns/{campaignId}/audio/{sessionId}/{filename}
       → return: { gsUri: 'gs://bucket/campaigns/.../file.mp3' }

transcribeAudioFast ontvang gsUri
       → Gemini Vertex AI: fileData.fileUri = gsUri, mimeType = 'audio/mpeg'
```

**Aanpassen:**

`upload-audio-to-gemini.ts`:
```typescript
import { getStorage } from 'firebase-admin/storage';

const bucket = getStorage().bucket();
const filePath = `campaigns/${campaignId}/audio/${sessionId}/${fileName}`;
const file = bucket.file(filePath);

await file.save(audioBuffer, {
  metadata: { contentType: mimeType },
});

return { gsUri: `gs://${bucket.name}/${filePath}` };
```

`transcribe-audio-fast.ts` (minimale aanpassing):
```typescript
// Oud:
// parts: [{ fileData: { fileUri: geminiFileUri, mimeType } }]

// Nieuw:
parts: [{ fileData: { fileUri: gsUri, mimeType } }]
// Vertex AI accepteert gs:// URIs direct
```

`initiate-gemini-upload.ts`:
- Kan worden verwijderd of omgebouwd naar `generateSignedUploadUrl` (al aanwezig via ticket #46)
- Evalueer of ticket #46 (Background Fetch) al voldoet — zo ja, verwijder `initiateGeminiUpload`

---

## Implementation Steps

1. **Secrets — geen nieuwe API keys nodig**
   - Claude Haiku via Vertex AI gebruikt ADC — geen `ANTHROPIC_API_KEY`
   - `ELEVENLABS_API_KEY` deprecation plannen (na go-live nieuwe stack)

2. **`@anthropic-ai/vertex-sdk` installeren** in `functions/`
   ```bash
   cd functions && npm install @anthropic-ai/vertex-sdk
   ```

3. **`@google-cloud/text-to-speech` controleren** — al aanwezig of installeren
   ```bash
   cd functions && npm install @google-cloud/text-to-speech
   ```

4. **Shared utility aanmaken**
   - `functions/src/utils/build-context-contents.ts`
   - Unit tests voor context builder

5. **`character-chat.ts` refactoren**
   - Switch naar `@anthropic-ai/vertex-sdk` + Haiku 4.5
   - Gebruik `buildContextContents()` utility
   - Pas request interface aan
   - Update `secrets` array: verwijder `GOOGLE_AI_API_KEY` (ADC — geen secret nodig)

6. **Image generation system prompt aanmaken**
   - `functions/src/prompts/image-generation.prompt.ts`

7. **`generate-image.ts` — alleen prompt aanpassen**
   - FAL.ai client, model en storage flow blijven ongewijzigd
   - Vervang `buildImagePrompt()` door `buildContextContents()` met nieuwe image prompt
   - Pas request interface aan: voeg `chatHistory` toe naast bestaande `CharacterVisuals`
   - `FAL_API_KEY` secret blijft

8. **`generate-podcast-audio.ts` refactoren**
   - Script generatie: vervang Google GenAI door `@anthropic-ai/vertex-sdk` Haiku 4.5
   - Audio generatie: vervang ElevenLabs door Chirp 3 HD TTS client
   - `buildSsml()` helper voor SSML constructie
   - Verwijder ElevenLabs import en secret
   - Update `secrets`: verwijder `ELEVENLABS_API_KEY` (ADC voor Chirp, geen nieuw secret)

9. **`upload-audio-to-gemini.ts` refactoren**
   - Vervang Gemini Files API upload door GCloud Storage upload
   - Return `gsUri` in plaats van `fileUri`

10. **`transcribe-audio-fast.ts` aanpassen**
    - Vervang `fileUri` (Gemini Files API) door `gsUri` (gs://)
    - Minimale aanpassing — alleen de fileData URI wijzigt

11. **`initiate-gemini-upload.ts` evalueren**
    - Verwijder als ticket #46 (Background Fetch / Signed URL) de use case afdekt
    - Anders omzetten naar GCS signed URL generator

12. **Frontend aanpassen** (minimal)
    - `characterChat` service: pas request payload aan (geen `model`/`config` meer)
    - Upload service: verwerk `gsUri` response in plaats van `fileUri`

13. **Build & deploy**
    ```bash
    npm run deploy:beta
    ```

14. **Testen op beta**
    - Character chat werkt met Haiku 4.5
    - Afbeelding generatie werkt nog steeds via FAL.ai met rijkere prompt context
    - Podcast generatie: script via Haiku, audio via Chirp 3 HD (MP3 check)
    - Audio upload + transcriptie flow met gs:// URI

15. **Opruimen na go-live**
    - Verwijder `@elevenlabs/elevenlabs-js` dependency (check of elders gebruikt)
    - Verwijder `ELEVENLABS_API_KEY` uit Secret Manager (na verificatie geen andere afhankelijkheden)
    - `@fal-ai/client` en `FAL_API_KEY` blijven — FAL.ai is nog in gebruik

---

## Dependencies

- Ticket #46 (Background Fetch) — evalueer overlap met `initiateGeminiUpload` refactor
- Geen blokkerende afhankelijkheden voor de overige wijzigingen

## Risks

- **Imagen 4 regio:** Vertex AI Imagen is alleen beschikbaar in `us-central1`. De Cloud Function voor `generateImage` moet in die regio draaien (of een aparte functie aanroepen). Overige functies blijven in `europe-west1`.
- **Chirp 3 HD taalondersteuning:** Controleer of `nl-NL` beschikbaar is voor de gewenste stemmen — niet alle stemmen zijn in alle locales beschikbaar.
- **SSML escaping:** Speciale tekens in podcast scripts moeten worden ge-escaped voor SSML.
- **Anthropic API latency:** Haiku 4.5 heeft lagere latency dan Gemini 2.5 Flash, maar houd rekening met cold start verschillen.
- **Context window:** Haiku 4.5 heeft een context window van 200K tokens — voldoende voor chat history + character context.
