# Ticket #52: Migrate Podcast TTS from Google Chirp 3 HD to Azure Speech Service

**Created:** 2026-02-16
**Priority:** High
**Status:** Done
**Effort:** 1-2 days
**Dependencies:** #51 (Azure Speech Service setup — hergebruikt Azure Speech resource + secrets)

---

## Description

Replace Google Cloud Text-to-Speech (Chirp 3 HD) with Azure Speech Service Neural TTS for podcast audio generation. Dit is onderdeel van de vendor consolidatie naar Azure (samen met ticket #51 voor transcriptie).

**Wat blijft hetzelfde:**
- Script generatie via Claude Haiku 4.5 (Anthropic Vertex AI) — ongewijzigd
- Fire-and-forget pattern met Firestore progress tracking — ongewijzigd
- Upload naar Firebase Storage — ongewijzigd
- SSML-aanpak met `<voice>` tags per host segment — ongewijzigd (Azure ondersteunt SSML)
- Frontend podcast service en UI — ongewijzigd

**Wat verandert:**
- TTS provider: Google Chirp 3 HD → Azure Speech Service Neural TTS
- Voices: `nl-NL-Chirp3-HD-Charon` / `nl-NL-Chirp3-HD-Aoede` → Azure Neural nl-NL stemmen
- TTS client: `@google-cloud/text-to-speech` SDK → Azure Speech REST API (direct `fetch()`)
- Secrets: geen nieuwe nodig als #51 al gedaan is (hergebruikt `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`)

---

## Expected Result

- Podcast audio wordt gegenereerd via Azure Speech Service Neural TTS
- Twee verschillende nl-NL stemmen voor host1 en host2 (mannelijk + vrouwelijk)
- SSML met `<voice>` tags werkt identiek aan huidige Chirp 3 HD aanpak
- Audio output is MP3 formaat
- Script generatie (Claude Haiku) is ongewijzigd
- Progress tracking werkt identiek
- Google Cloud Text-to-Speech dependency kan verwijderd worden
- Geen frontend wijzigingen nodig

---

## Technical Details

### Current Architecture

```
Claude Haiku 4.5 → PodcastScript (HOST1/HOST2 segments)
  → buildSsml() met Chirp 3 HD voice names
  → Google Cloud TTS SDK (eu-texttospeech.googleapis.com)
  → MP3 buffer
  → Firebase Storage upload
```

### Target Architecture

```
Claude Haiku 4.5 → PodcastScript (HOST1/HOST2 segments) [UNCHANGED]
  → buildSsml() met Azure Neural voice names
  → Azure Speech REST API (westeurope.tts.speech.microsoft.com)
  → MP3 buffer
  → Firebase Storage upload [UNCHANGED]
```

---

### Azure Neural Voices voor nl-NL

Beschikbare stemmen:

| Voice Name | Gender | Rol |
|---|---|---|
| `nl-NL-MaartenNeural` | Male | host1 |
| `nl-NL-FennaNeural` | Female | host2 |
| `nl-NL-ColetteNeural` | Female | (alternatief voor host2) |

**Voorstel:**
```typescript
const AZURE_VOICES: Record<'host1' | 'host2', string> = {
  host1: 'nl-NL-MaartenNeural',
  host2: 'nl-NL-FennaNeural',
};
```

---

### Phase 1: SSML Aanpassing

De huidige `buildSsml()` functie hoeft nauwelijks te veranderen — alleen de voice names:

**Huidig SSML (Chirp 3 HD):**
```xml
<speak>
  <voice name="nl-NL-Chirp3-HD-Charon">Welkom bij de podcast!</voice>
  <voice name="nl-NL-Chirp3-HD-Aoede">Vandaag bespreken we...</voice>
</speak>
```

**Nieuw SSML (Azure Neural):**
```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="nl-NL">
  <voice name="nl-NL-MaartenNeural">Welkom bij de podcast!</voice>
  <voice name="nl-NL-FennaNeural">Vandaag bespreken we...</voice>
</speak>
```

**Let op:** Azure SSML vereist `version`, `xmlns` en `xml:lang` attributen op het `<speak>` element. Google's SDK accepteert een kale `<speak>` tag, Azure niet.

---

### Phase 2: Azure Speech REST API Call

Azure Speech TTS gebruikt een simpele REST API — geen SDK nodig:

```typescript
async function synthesizeSpeechAzure(ssml: string): Promise<Buffer> {
  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION;

  const endpoint = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-48khz-192kbitrate-mono-mp3',
      'User-Agent': 'QuestMind-PodcastGenerator',
    },
    body: ssml,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure TTS failed (${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
```

**Output formaten (MP3 opties):**

| Format | Kwaliteit | Gebruik |
|---|---|---|
| `audio-16khz-128kbitrate-mono-mp3` | Standaard | Kleinere bestanden |
| `audio-24khz-160kbitrate-mono-mp3` | Hoog | Goede balans |
| `audio-48khz-192kbitrate-mono-mp3` | Zeer hoog | Beste kwaliteit |

**Aanbeveling:** `audio-48khz-192kbitrate-mono-mp3` voor podcast kwaliteit.

---

### Phase 3: Wijzigingen in `generate-podcast-audio.ts`

**Verwijderen:**
```typescript
// Remove
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

// Remove
const CHIRP_VOICES: Record<'host1' | 'host2', string> = {
  host1: 'nl-NL-Chirp3-HD-Charon',
  host2: 'nl-NL-Chirp3-HD-Aoede',
};
```

**Toevoegen:**
```typescript
const AZURE_VOICES: Record<'host1' | 'host2', string> = {
  host1: 'nl-NL-MaartenNeural',
  host2: 'nl-NL-FennaNeural',
};
```

**`buildSsml()` aanpassen:**
```typescript
function buildSsml(segments: PodcastSegment[]): string {
  const ssmlParts = segments.map(seg =>
    `<voice name="${AZURE_VOICES[seg.speaker]}">${escapeXml(seg.text)}</voice>`
  );
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="nl-NL">${ssmlParts.join('\n')}</speak>`;
}
```

**TTS call vervangen (in `generatePodcastInBackground`):**
```typescript
// BEFORE (Chirp 3 HD):
const ttsClient = new TextToSpeechClient({
  apiEndpoint: 'eu-texttospeech.googleapis.com',
});
const [audioResponse] = await ttsClient.synthesizeSpeech({ ... });
const audioBuffer = Buffer.from(audioResponse.audioContent as Uint8Array);

// AFTER (Azure Speech):
const audioBuffer = await synthesizeSpeechAzure(ssml);
```

**Secrets toevoegen aan onCall config:**
```typescript
export const generatePodcastAudio = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'],  // Was: []
    timeoutSeconds: 900,
    memory: '1GiB'
  },
  // ...
);
```

**Progress messages bijwerken:**
```
'Generating audio with Chirp 3 HD TTS...'  → 'Generating audio with Azure Speech...'
'Calling Chirp 3 HD TTS API...'            → 'Calling Azure Speech TTS API...'
```

---

### Phase 4: Cleanup

**Verwijder npm package (als niet meer gebruikt):**
```bash
cd functions && npm uninstall @google-cloud/text-to-speech
```

**Check eerst:** `@google-cloud/text-to-speech` wordt momenteel alleen gebruikt in `generate-podcast-audio.ts`. Kan veilig verwijderd worden.

**Verwijder Google TTS gerelateerde imports en code:**
- `TextToSpeechClient` import
- `eu-texttospeech.googleapis.com` endpoint referenties
- Chirp voice names

---

### Azure Speech Limieten

| Limiet | Waarde | Impact |
|---|---|---|
| SSML max lengte | 12.000 karakters (inclusief tags) | Ruim voldoende — scripts zijn max ~5000 chars |
| Request timeout | 2 minuten | Ruim voor podcast lengte (~10 min audio) |
| Concurrent requests | 200/s (S0 tier) | Geen probleem |
| Audio output max | ~10 minuten per request | Past bij huidige podcast duur |

**Let op:** Als podcasts langer worden dan ~10 minuten, moet de SSML in chunks gesplit worden en de audio samengevoegd. Voorlopig niet nodig gezien het 5000 karakter script limiet.

---

## Secrets / Environment

**Hergebruikt van ticket #51 (als die eerst gedaan wordt):**
```
AZURE_SPEECH_KEY          # Azure Speech Service subscription key
AZURE_SPEECH_REGION       # e.g. "westeurope"
```

**Als ticket #51 nog niet gedaan is, moeten deze secrets eerst aangemaakt worden:**
```bash
firebase functions:secrets:set AZURE_SPEECH_KEY
firebase functions:secrets:set AZURE_SPEECH_REGION
```

Azure Speech Service resource (S0 Standard tier) moet bestaan — zie ticket #51 voor setup instructies.

---

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| Modify | `functions/src/generate-podcast-audio.ts` | Vervang Google TTS door Azure Speech REST API |
| Modify | `functions/package.json` | Verwijder `@google-cloud/text-to-speech` dependency |

**Geen nieuwe bestanden nodig.** De Azure Speech TTS call is simpel genoeg om direct in `generate-podcast-audio.ts` te plaatsen (één `fetch()` call). Een aparte service is overkill voor deze use case.

---

## Risks & Considerations

1. **SSML compatibiliteit:** Azure SSML is strenger dan Google's — vereist `version`, `xmlns` en `xml:lang` attributen. Falen als deze ontbreken.

2. **Voice switching in SSML:** Azure ondersteunt meerdere `<voice>` tags in één `<speak>` block. Dit is de kern van de podcast functionaliteit en werkt identiek aan Google's aanpak.

3. **Audio kwaliteit:** Azure Neural voices klinken anders dan Chirp 3 HD. Test de stemkwaliteit handmatig voor go-live. `nl-NL-FennaNeural` en `nl-NL-MaartenNeural` zijn de twee meest gebruikte nl-NL stemmen.

4. **Kosten:** Azure Neural TTS kost ~$16/miljoen karakters (S0 tier). Bij ~5000 chars per podcast is dat ~$0.08 per podcast. Vergelijkbaar met Google Chirp 3 HD.

5. **Geen SDK nodig:** Azure Speech TTS is een simpele REST call (POST met SSML body, krijg audio bytes terug). Geen extra npm package nodig — alleen `fetch()`.

6. **Dependency op ticket #51:** Als #51 eerst wordt gedaan, zijn de Azure secrets al geconfigureerd. Anders moeten ze apart opgezet worden. De Azure Speech resource (S0) is dezelfde voor zowel TTS als batch transcription.

7. **Rollback:** Eenvoudig — voice names en TTS call terugzetten naar Google. Geen data migratie nodig.

---

## Testing

1. **Handmatig testen:**
   - Genereer een podcast met de nieuwe Azure stemmen
   - Vergelijk geluidskwaliteit met een eerder gegenereerde Chirp 3 HD podcast
   - Controleer dat voice switching (host1/host2) correct werkt
   - Test met een lang script (nabij 5000 karakter limiet)

2. **Edge cases:**
   - Script met speciale tekens (XML entities: `&`, `<`, `>`, quotes)
   - Script met alleen host1 segments (geen voice switching)
   - Azure Speech Service niet beschikbaar (error handling)
   - Ongeldige SSML (malformed XML)
