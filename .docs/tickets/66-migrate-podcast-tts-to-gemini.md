# Ticket #66: Migreer Podcast TTS van ElevenLabs naar Gemini TTS

**Created:** 2026-03-31
**Priority:** High
**Status:** Todo
**Effort:** 2-3 dagen
**Dependencies:** Geen

---

## Beschrijving

Vervang ElevenLabs `text-to-dialogue` API door **Gemini 2.5 Pro/Flash Preview TTS** met native multi-speaker ondersteuning. Gemini TTS kan in een enkele API-call een compleet twee-persoons dialoog genereren met natuurlijke overgangen, zonder per-segment stitching.

### Waarom migreren?

1. **Vendor consolidatie** - Al op Google/Gemini stack voor script generatie, transcriptie, en chat. ElevenLabs is de enige externe AI-vendor
2. **Native multi-speaker** - Gemini genereert het volledige dialoog in een keer (net als ElevenLabs text-to-dialogue), met natuurlijke speaker transitions
3. **Kostenreductie** - Geen apart ElevenLabs abonnement meer nodig
4. **Stijlcontrole via natural language** - Accent, toon, tempo, fluisteren etc. aanstuurbaar via prompt (geen SSML nodig)
5. **80+ talen** - Automatische taaldetectie, Nederlands volledig ondersteund

---

## Huidige Implementatie

**Bestand:** `functions/src/generate-podcast-audio.ts`

### Flow
1. Script generatie via Gemini (`GoogleGenAI`) → `HOST1:`/`HOST2:` format
2. Script parsing naar `PodcastSegment[]` (speaker + text)
3. Segments omzetten naar ElevenLabs `dialogueInputs` (text + voiceId)
4. `elevenlabs.textToDialogue.convert()` → audio stream → Buffer
5. Upload naar Firebase Storage als MP3

### Dependencies
- `@elevenlabs/elevenlabs-js` (v2.34.0)
- `ELEVENLABS_API_KEY` secret
- `ELEVENLABS_HOST1_VOICE` / `ELEVENLABS_HOST2_VOICE` env vars
- Admin panel `podcastVoices` config (model, host1VoiceId, host2VoiceId, maxCharacters)

---

## Onderzoek: Gemini TTS Mogelijkheden (maart 2026)

### Beschikbare Modellen

| Model | Type | Kwaliteit | Kosten |
|-------|------|-----------|--------|
| `gemini-2.5-pro-preview-tts` | Premium | Studio-quality, beste voor lange content | ~$0.50/$10.00 per 1M tokens (in/out) |
| `gemini-2.5-flash-preview-tts` | Price-performant | Goed voor dagelijks gebruik | ~$0.30/$2.50 per 1M tokens (in/out) |

**Let op:** Gemini 3.1 Pro heeft (nog) geen dedicated TTS-model. Gemini 3.1 Flash Live heeft native audio output maar is gericht op real-time streaming (Live API), niet op pre-generated batch audio. De Gemini 2.5 TTS-modellen zijn momenteel de juiste keuze voor podcast generatie.

### Multi-Speaker Specificaties

- **Max speakers:** 2 per request (past perfect bij HOST1/HOST2 setup)
- **Configuratie:** `MultiSpeakerVoiceConfig` met `SpeakerVoiceConfig` per speaker
- **30 stemmen beschikbaar:** Kore, Puck, Charon, Zephyr, Fenrir, Leda, Enceladus, etc.
- **Stijlcontrole:** Via natural language in de prompt (toon, accent, tempo, expressie)
- **Taaldetectie:** Automatisch, 80+ talen, Nederlands ondersteund
- **Context window:** 32k tokens

### API Voorbeeld (JavaScript)

```javascript
const response = await googleAi.models.generateContent({
  model: 'gemini-2.5-flash-preview-tts',
  contents: [{ parts: [{ text: dialogScript }] }],
  config: {
    responseModalities: ['AUDIO'],
    speechConfig: {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: [
          { speaker: 'Thomas', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          { speaker: 'Roos', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } } },
        ]
      }
    }
  }
});

// Audio data zit in response.candidates[0].content.parts[0].inlineData
const audioData = response.candidates[0].content.parts[0].inlineData;
const audioBuffer = Buffer.from(audioData.data, 'base64');
```

### Voordelen t.o.v. ElevenLabs

| Feature | ElevenLabs | Gemini TTS |
|---------|-----------|------------|
| Multi-speaker | text-to-dialogue API | Native in generateContent |
| Stemmen | Custom voice IDs | 30 prebuilt voices |
| Stijlcontrole | Beperkt | Natural language prompts |
| Talen | ~29 | 80+ |
| Extra dependency | `@elevenlabs/elevenlabs-js` | Hergebruikt `@google/genai` |
| Extra secret | `ELEVENLABS_API_KEY` | Hergebruikt `GOOGLE_AI_API_KEY` |

### Beperkingen

- Preview model — kan veranderen voor GA, mogelijk strengere rate limits
- Max 2 speakers (geen probleem, we gebruiken er precies 2)
- 32k token context window (ruim voldoende voor podcast scripts)
- Geen custom voice cloning (alleen prebuilt voices)

---

## Verwacht Resultaat

- Podcast audio wordt gegenereerd via Gemini TTS i.p.v. ElevenLabs
- `@elevenlabs/elevenlabs-js` dependency verwijderd
- `ELEVENLABS_API_KEY` secret niet meer nodig
- Admin panel aangepast: voice IDs vervangen door Gemini voice names
- Geen regressie in audio kwaliteit of functionaliteit
- Script format kan vereenvoudigd worden (speaker names direct in prompt i.p.v. HOST1/HOST2 parsing)

---

## Technische Details

### Stap 1: Script Format Aanpassen

Het huidige script format (`HOST1: tekst` / `HOST2: tekst`) kan behouden blijven of vereenvoudigd worden. Gemini TTS verwacht speaker names die matchen met de `speakerVoiceConfigs`. Optie:

- Gebruik `Thomas:` en `Roos:` in het script (matcht met speaker config)
- Of behoud `HOST1:`/`HOST2:` en map naar speaker names in de config

### Stap 2: ElevenLabs Vervangen in `generate-podcast-audio.ts`

**Verwijderen:**
- `import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'`
- `DEFAULT_HOST_VOICES` met ElevenLabs voice IDs
- `elevenlabs.textToDialogue.convert()` call
- `ELEVENLABS_API_KEY` uit secrets config

**Toevoegen:**
- Gemini TTS call via bestaande `@google/genai` package
- `responseModalities: ['AUDIO']` config
- `multiSpeakerVoiceConfig` met 2 speaker configs
- Base64 decode van audio response → Buffer

### Stap 3: Admin Panel Aanpassen

**Bestand:** `src/app/admin/admin.component.ts`

- `podcastVoices` config aanpassen:
  - `host1VoiceId` / `host2VoiceId` (ElevenLabs IDs) → `host1VoiceName` / `host2VoiceName` (Gemini voice names)
  - `model` default wijzigen van `eleven_v3` → `gemini-2.5-flash-preview-tts`
  - Dropdown/select toevoegen met beschikbare Gemini voice names

### Stap 4: AI Settings Aanpassen

**Bestand:** `functions/src/utils/ai-settings.ts`

- Default voice config updaten met Gemini voice names
- ElevenLabs-specifieke defaults verwijderen

### Stap 5: Cleanup

- `npm uninstall @elevenlabs/elevenlabs-js`
- `ELEVENLABS_API_KEY` verwijderen uit secrets en `.env.example`
- `ELEVENLABS_HOST1_VOICE` / `ELEVENLABS_HOST2_VOICE` env vars verwijderen

### Stap 6: Stemmen Selecteren

Nederlandse stemmen testen en beste combinatie kiezen. Kandidaten:
- Mannelijk (Thomas/host1): Puck, Charon, Fenrir, Enceladus
- Vrouwelijk (Roos/host2): Kore, Zephyr, Leda

Stijl-instructie in de prompt toevoegen voor Nederlandse podcast toon.

---

## Bestanden die Wijzigen

| Bestand | Wijziging |
|---------|-----------|
| `functions/src/generate-podcast-audio.ts` | ElevenLabs → Gemini TTS |
| `functions/src/utils/ai-settings.ts` | Default voice config updaten |
| `functions/src/types/audio-session.types.ts` | Voice config types updaten |
| `src/app/admin/admin.component.ts` | Voice selector aanpassen |
| `functions/package.json` | `@elevenlabs/elevenlabs-js` verwijderen |
| `functions/.env.example` | ElevenLabs vars verwijderen |

---

## Test Strategie

1. **Unit test**: Script parsing blijft werken met nieuw format
2. **Integratie test**: Gemini TTS API call met multi-speaker config
3. **E2E test**: Volledige flow: story → script → audio → storage → playback
4. **Kwaliteitscheck**: Audio vergelijken met ElevenLabs output (naturalness, transitions)
5. **Stemmen test**: Verschillende Gemini voice combinaties uitproberen voor beste resultaat

---

## Bronnen

- [Gemini TTS Documentatie](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Gemini 2.5 Pro TTS Model](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro-preview-tts)
- [Gemini Native Audio Blog](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/gemini-2-5-native-audio/)
- [Gemini Audio Model Updates](https://blog.google/products/gemini/gemini-audio-model-updates/)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
