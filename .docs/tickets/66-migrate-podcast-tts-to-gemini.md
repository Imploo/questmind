# Ticket #66: Migreer Podcast TTS van ElevenLabs naar Gemini TTS

**Created:** 2026-03-31
**Priority:** High
**Status:** Todo
**Effort:** 2-3 dagen
**Dependencies:** Geen

---

## Beschrijving

Vervang ElevenLabs `text-to-dialogue` API door **Gemini 3.1 Flash TTS** (default; 2.5 Flash/Pro als fallback) met native multi-speaker ondersteuning. Gemini TTS kan in een enkele API-call een compleet twee-persoons dialoog genereren met natuurlijke overgangen, zonder per-segment stitching.

> **⚠️ Belangrijkste inzicht — het echte werk zit in het audioformaat.**
> ElevenLabs levert kant-en-klare **MP3**; Gemini TTS levert **rauwe PCM** (`audio/L16`, 24 kHz, 16-bit, mono). De huidige opslag (`v{version}.mp3` met `contentType: 'audio/mpeg'`) en de hele frontend/download-flow gaan uit van MP3. We moeten de PCM-bytes dus **transcoderen naar MP3** vóór upload, anders krijg je een corrupt bestand. Zie [Audioformaat](#audioformaat--pcm-naar-mp3-het-echte-werk). De rest van de migratie (API-call, stemmen, cleanup) is relatief triviaal.

> **Waarom de twee stappen (script → audio) behouden?**
> Gemini TTS is een render-model: het spreekt aangeleverde tekst uit, het schrijft geen dialoog. "Podcast direct uit het verhaal" bestaat niet als ondersteunde modus en zou drie dingen kosten die we nu hebben: (1) **reviewbaarheid** — het script is zichtbaar en via de corrections-flow bij te sturen vóór audio; (2) **goedkope retries** — audio opnieuw genereren zonder het script te herschrijven en andersom; (3) **lengtecontrole** — `maxCharacters` zit op het script. Natuurlijkheid komt uit scriptkwaliteit + TTS-rendering, niet uit minder pipeline-stappen. We behouden de twee stappen en vervangen **alleen** de TTS-laag.

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

| Model | Type | Context window | Kosten |
|-------|------|----------------|--------|
| `gemini-2.5-pro-preview-tts` | Premium, studio-quality | 32k tokens | ~$0.50/$10.00 per 1M tokens (in/out) |
| `gemini-2.5-flash-preview-tts` | Price-performant | 32k tokens | ~$0.30/$2.50 per 1M tokens (in/out) |
| `gemini-3.1-flash-tts-preview` | Nieuwer Flash TTS | 32k tokens | nog verifiëren |

**Let op:** Alle drie de modellen delen dezelfde 32k-token context window én dezelfde kwaliteitswaarschuwing voor outputs langer dan enkele minuten (zie Chunking). **Default: `gemini-3.1-flash-tts-preview`** — nieuwste model, ondersteunt 200+ audio-tags voor delivery-sturing en 70+ talen, ideaal voor het aansturen van een NL-podcasttoon. Het model is configureerbaar via `geminiModel` in `settings/ai`, zodat terugvallen op `gemini-2.5-flash-preview-tts` (goedkoper/stabieler) of upgraden naar de Pro-variant een instelling is — geen code-wijziging. Verifieer de exacte kosten/rate-limits van het 3.1-model vóór productiegebruik (preview).

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
  model: 'gemini-3.1-flash-tts-preview',
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
// LET OP: dit is RAUWE PCM (audioData.mimeType ≈ "audio/L16;codec=pcm;rate=24000"),
// GEEN MP3. Direct opslaan als .mp3 levert een corrupt bestand op. Zie hieronder.
const pcmBuffer = Buffer.from(audioData.data, 'base64');
```

### Audioformaat — PCM naar MP3 (het echte werk)

Gemini TTS retourneert **rauwe PCM** (signed 16-bit little-endian, mono, 24 kHz), aangegeven via `inlineData.mimeType` (bv. `audio/L16;codec=pcm;rate=24000`). De huidige pipeline verwacht overal MP3:

- Storage-pad: `campaigns/{campaignId}/podcasts/{sessionId}/v{version}.mp3`
- `contentType: 'audio/mpeg'`
- Frontend playback + download-flow gaan uit van `.mp3`

**Aanbevolen: transcoderen naar MP3 in de Cloud Function.** `@ffmpeg-installer/ffmpeg` (v1.1.0) en `fluent-ffmpeg` (v2.1.2) staan **al** in `functions/package.json` — geen nieuwe dependency nodig. Frontend, storage-paden en download-flow blijven dan ongewijzigd.

```javascript
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { PassThrough, Readable } from 'stream';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

function pcmToMp3(pcmBuffer: Buffer, sampleRate = 24000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const out: Buffer[] = [];
    const sink = new PassThrough();
    sink.on('data', (c) => out.push(Buffer.from(c)));
    sink.on('end', () => resolve(Buffer.concat(out)));
    sink.on('error', reject);

    ffmpeg(Readable.from(pcmBuffer))
      .inputFormat('s16le')                 // signed 16-bit little-endian PCM
      .inputOptions([`-ar ${sampleRate}`, '-ac 1'])
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .format('mp3')
      .on('error', reject)
      .pipe(sink, { end: true });
  });
}
```

> Parse de sample rate uit `mimeType` (`rate=...`) i.p.v. hardcoden — preview-modellen kunnen dit wijzigen.

**Alternatief (niet aanbevolen):** een WAV-header om de PCM zetten en als `.wav` opslaan. Simpeler, maar ~10× grotere bestanden én aanpassingen in storage-pad, MIME-type en frontend nodig. Niet doen tenzij ffmpeg in de Cloud Functions-omgeving onverwacht problemen geeft.

### Chunking voor langere podcasts (optioneel, aanbevolen)

De officiële Gemini speech-docs waarschuwen letterlijk:

> *"Speech quality and consistency may begin to drift with generated outputs that are longer than a few minutes."* — [ai.google.dev/gemini-api/docs/speech-generation](https://ai.google.dev/gemini-api/docs/speech-generation)

Google's eigen aanbeveling is om lange transcripts in kleinere secties te knippen. Bij de huidige `maxCharacters: 5000` (±5 min) zit je precies op de grens, dus voor robuustheid: genereer per ~3000 tekens (geknipt op **beurtgrenzen**, niet midden in een zin) en concateneer. PCM-buffers aan elkaar plakken (`Buffer.concat`) is triviaal **vóór** de MP3-encode — één keer transcoderen aan het eind.

Bijkomend voordeel: de Gemini input-limiet is 32k tokens (vs. de strakke ElevenLabs input-limiet), dus `maxCharacters` kan later flink omhoog.

### Voordelen t.o.v. ElevenLabs

| Feature | ElevenLabs | Gemini TTS |
|---------|-----------|------------|
| Multi-speaker | text-to-dialogue API | Native in generateContent |
| Stemmen | Custom voice IDs | 30 prebuilt voices |
| Stijlcontrole | Beperkt | Natural language prompts |
| Talen | ~29 | 80+ |
| **Output formaat** | **MP3 (direct bruikbaar)** | **rauwe PCM (transcode nodig)** |
| Input-limiet | strak (per request) | 32k tokens |
| Extra dependency | `@elevenlabs/elevenlabs-js` | Hergebruikt `@google/genai` (+ reeds aanwezige ffmpeg) |
| Extra secret | `ELEVENLABS_API_KEY` | Hergebruikt `GOOGLE_AI_API_KEY` |

### Beperkingen

- Preview model — kan veranderen voor GA, mogelijk strengere rate limits → daarom een `ttsProvider` fallback in de eerste release (zie Stap 0)
- Output is rauwe PCM, niet MP3 → transcode-stap vereist (zie Audioformaat)
- Kwaliteit kan verlopen bij lange audio → chunking aanbevolen
- Max 2 speakers (geen probleem, we gebruiken er precies 2)
- 32k token context window (ruim voldoende voor podcast scripts)
- Geen custom voice cloning (alleen prebuilt voices)
- **Nederlandse stemkwaliteit moet eerst handmatig getest worden** met een bestaand script vóór ElevenLabs eruit gaat

---

## Verwacht Resultaat

- Podcast audio wordt gegenereerd via Gemini TTS i.p.v. ElevenLabs (achter `ttsProvider`-switch)
- PCM-output van Gemini wordt naar **MP3** getranscodeerd → storage-pad, MIME-type en frontend ongewijzigd
- `@elevenlabs/elevenlabs-js` dependency en `ELEVENLABS_API_KEY` verwijderd (na bewezen kwaliteit)
- Admin panel aangevuld: Gemini voice-name velden naast de ElevenLabs voice-ID velden + `ttsProvider`-selector (beide blijven bewaard bij switchen)
- Geen regressie in audio kwaliteit of functionaliteit; terugval op ElevenLabs mogelijk zonder deploy
- Script format kan vereenvoudigd worden (speaker names direct in prompt i.p.v. HOST1/HOST2 parsing)
- (optioneel) `maxCharacters` kan later omhoog dankzij de 32k-token input-limiet

---

## Technische Details

### Stap 0: `ttsProvider` fallback toevoegen (eerste release)

Omdat de TTS-modellen nog preview zijn én de Nederlandse stemkwaliteit nog onbewezen is, voeg een `ttsProvider: 'gemini' | 'elevenlabs'` veld toe aan `settings/ai → podcastVoices`. Zo kun je per direct terugvallen op ElevenLabs zonder deploy als de kwaliteit tegenvalt. Houd de ElevenLabs-code dus tijdelijk in stand achter deze switch; opruimen (Stap 5) gebeurt pas nadat Gemini in productie bewezen is.

### Stap 1: Script Format + Stijl-instructie

Het huidige script format (`HOST1: tekst` / `HOST2: tekst`) kan behouden blijven of vereenvoudigd worden. Gemini TTS verwacht speaker names die matchen met de `speakerVoiceConfigs`. Optie:

- Gebruik `Thomas:` en `Roos:` in het script (matcht met speaker config)
- Of behoud `HOST1:`/`HOST2:` en map naar speaker names in de config

**Stijl-instructie toevoegen vóór de dialoog.** Gemini TTS accepteert een natuurlijke-taal stijlinstructie bovenaan de input (bv. *"Lees dit voor als een enthousiaste, informele Nederlandse podcast met twee hosts"*). Dit vervangt deels wat `eleven_v3` impliciet deed en is een extra knop voor natuurlijkheid.

### Stap 2: ElevenLabs Vervangen in `generate-podcast-audio.ts`

**Verwijderen:**
- `import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'`
- `DEFAULT_HOST_VOICES` met ElevenLabs voice IDs
- `elevenlabs.textToDialogue.convert()` call
- `ELEVENLABS_API_KEY` uit secrets config

**Toevoegen:**
- Gemini TTS call via bestaande `@google/genai` package (hergebruik de al-aanwezige `GoogleGenAI`-client en `GOOGLE_AI_API_KEY`)
- `responseModalities: ['AUDIO']` + `speechConfig.multiSpeakerVoiceConfig` met 2 speaker configs
- Base64 decode van `inlineData.data` → **PCM**-Buffer
- **PCM → MP3 transcode** via `fluent-ffmpeg` (`s16le`, mono, rate uit `mimeType`) vóór upload — zie [Audioformaat](#audioformaat--pcm-naar-mp3-het-echte-werk)
- (optioneel) **chunking** op beurtgrenzen, PCM-buffers concateneren vóór de encode
- Voortgangsmeldingen aanpassen: `"Calling ElevenLabs…"` → Gemini-equivalent

> De upload-stap (Stap 3 in de code, regel ~333–356) blijft ongewijzigd zodra de buffer MP3 is.

### Stap 3: Admin Panel Aanpassen

**Bestand:** `src/app/admin/admin.component.ts`

- `podcastVoices` config aanpassen:
  - **Aparte velden per provider** (zo blijven beide stemkeuzes bewaard en hoef je bij het omschakelen van `ttsProvider` níét opnieuw stemmen in te stellen):
    - ElevenLabs (bestaand, ongewijzigd): `host1VoiceId` / `host2VoiceId` (voice IDs) + `model` (`eleven_v3`)
    - Gemini (nieuw): `host1VoiceName` / `host2VoiceName` (prebuilt voice names: Kore, Puck, Leda, …) + `geminiModel` (default `gemini-3.1-flash-tts-preview`)
  - De Gemini-stemvelden worden dropdowns met de 30 prebuilt voice-names.
  - `ttsProvider`-dropdown toevoegen (`gemini` / `elevenlabs`) — zie Stap 0. De backend kiest op basis hiervan de juiste set velden.

### Stap 4: Types + AI Settings Aanpassen

**Bestand:** `functions/src/types/audio-session.types.ts` — `PodcastVoiceSettings` uitbreiden met provider-switch en aparte Gemini-velden (ElevenLabs-velden blijven staan):

```typescript
export interface PodcastVoiceSettings {
  ttsProvider: 'gemini' | 'elevenlabs';   // nieuw — bepaalt welke set gebruikt wordt
  maxCharacters: number;

  // ElevenLabs (bestaand)
  model: string;            // bv. 'eleven_v3'
  host1VoiceId: string;     // ElevenLabs voice ID
  host2VoiceId: string;

  // Gemini (nieuw)
  geminiModel: string;      // default 'gemini-3.1-flash-tts-preview'
  host1VoiceName: string;   // Gemini prebuilt voice (bv. 'Puck')
  host2VoiceName: string;   // Gemini prebuilt voice (bv. 'Leda')
}
```

**Bestand:** `functions/src/utils/ai-settings.ts` — `DEFAULT_PODCAST_VOICES` uitbreiden zodat beide providers een werkende default hebben:

```typescript
const DEFAULT_PODCAST_VOICES: PodcastVoiceSettings = {
  ttsProvider: 'elevenlabs',           // eerste release: standaard nog ElevenLabs (Stap 0)
  maxCharacters: 5000,
  model: 'eleven_v3',
  host1VoiceId: '',
  host2VoiceId: '',
  geminiModel: 'gemini-3.1-flash-tts-preview',   // fallback: 'gemini-2.5-flash-preview-tts'
  host1VoiceName: 'Puck',              // mannelijk — test op NL
  host2VoiceName: 'Leda',              // vrouwelijk — test op NL
};
```

> Beide veld-sets bestaan naast elkaar in het `settings/ai`-document → switchen van `ttsProvider` raakt de opgeslagen stemmen van de andere provider niet. Geen migratie nodig (de nieuwe velden vallen terug op de defaults voor bestaande documenten).

### Stap 5: Cleanup (pas ná bewezen Gemini-kwaliteit in productie)

> Voer dit pas uit als de `ttsProvider`-switch (Stap 0) op `gemini` staat en de Nederlandse kwaliteit in productie akkoord is. Tot die tijd blijft de ElevenLabs-code achter de switch staan.

- `npm uninstall @elevenlabs/elevenlabs-js`
- `ELEVENLABS_API_KEY` verwijderen uit secrets-array van `generatePodcastAudio` en uit `.env.example`
- `ELEVENLABS_HOST1_VOICE` / `ELEVENLABS_HOST2_VOICE` env vars + `DEFAULT_HOST_VOICES` verwijderen
- `ttsProvider`-fallback en de ElevenLabs-codepad verwijderen (of `ttsProvider` behouden zonder ElevenLabs-optie)

### Stap 6: Stemmen Selecteren

Nederlandse stemmen testen en beste combinatie kiezen. Kandidaten:
- Mannelijk (Thomas/host1): Puck, Charon, Fenrir, Enceladus
- Vrouwelijk (Roos/host2): Kore, Zephyr, Leda

Stijl-instructie in de prompt toevoegen voor Nederlandse podcast toon.

---

## Bestanden die Wijzigen

| Bestand | Wijziging |
|---------|-----------|
| `functions/src/generate-podcast-audio.ts` | ElevenLabs → Gemini TTS-call + PCM→MP3 transcode (+ optioneel chunking) achter `ttsProvider`-switch |
| `functions/src/utils/ai-settings.ts` | `DEFAULT_PODCAST_VOICES` uitbreiden met `ttsProvider`, `geminiModel`, `host1VoiceName`, `host2VoiceName` |
| `functions/src/types/audio-session.types.ts` | `PodcastVoiceSettings`: `ttsProvider` + aparte Gemini-velden toevoegen (ElevenLabs-velden blijven) |
| `src/app/admin/admin.component.ts` | Gemini voice-name dropdowns + `ttsProvider`-selector (ElevenLabs-velden blijven zichtbaar) |
| `functions/package.json` | `@elevenlabs/elevenlabs-js` verwijderen (Stap 5) — ffmpeg-deps zijn al aanwezig, **geen** nieuwe dependency |
| `functions/.env.example` | ElevenLabs vars verwijderen (Stap 5) |

---

## Test Strategie

1. **Unit test**: Script parsing blijft werken met nieuw format
2. **Audioformaat test**: PCM→MP3 transcode levert een geldig, afspeelbaar MP3-bestand (juiste sample rate, geen ruis/corruptie) — dit is het grootste regressierisico
3. **Integratie test**: Gemini TTS API call met multi-speaker config; verifieer dat `inlineData.mimeType` PCM is en de rate correct geparsed wordt
4. **E2E test**: Volledige flow: story → script → audio → storage → playback
5. **Fallback test**: `ttsProvider: 'elevenlabs'` werkt nog steeds (geen regressie op de oude codepad)
6. **Kwaliteitscheck**: Audio vergelijken met ElevenLabs output (naturalness, transitions, Nederlandse uitspraak)
7. **Stemmen test**: Verschillende Gemini voice combinaties uitproberen voor beste resultaat

---

## Bronnen

- [Gemini TTS Documentatie](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Gemini 2.5 Pro TTS Model](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro-preview-tts)
- [Gemini Native Audio Blog](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/gemini-2-5-native-audio/)
- [Gemini Audio Model Updates](https://blog.google/products/gemini/gemini-audio-model-updates/)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
