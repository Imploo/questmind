# Vertex AI / Gemini API — Usage Guide

> Last updated: February 2026
> SDK: `@google/genai` (unified, replaces `@google-cloud/vertexai` en `@google/generative-ai`)

---

## SDK Setup

De nieuwe unified SDK ondersteunt alle Gemini- en Imagen-modellen en is de aanbevolen keuze voor alle nieuwe ontwikkeling.

```bash
npm install @google/genai
```

### Initialisatie (Cloud Functions)

In Cloud Functions draait de code met Application Default Credentials (ADC) — geen API key nodig.

```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GCLOUD_PROJECT, // automatisch beschikbaar in Cloud Functions
  location: 'europe-west1',
});
```

### Initialisatie (lokaal / dev)

```typescript
// Via API key (Google AI Studio — goedkoper voor dev)
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

// Of via Vertex AI met service account
const ai = new GoogleGenAI({
  vertexai: true,
  project: 'questmind-beta',
  location: 'europe-west1',
});
```

---

## Modellen Overzicht (2026)

### Gemini 3 (nieuwste generatie — preview)

| Model | Type | Context | Gebruik |
|---|---|---|---|
| `gemini-3-flash-preview` | Text, multimodal | 1M / 65K tokens | Snelste Gemini 3 — standaard keuze voor nieuwe code |
| `gemini-3-pro-preview` | Text, multimodal | 1M / 65K tokens | Hoogste intelligentie, complexe redenering |
| `gemini-3-pro-image-preview` | Text + Image in/out | 65K / 32K tokens | Text én afbeeldingen genereren in één aanroep |

> Gemini 3 modellen gebruiken **dynamic thinking** standaard. Stuurbaar via `thinking_level` parameter.

### Gemini 2.5

| Model | Type | Gebruik |
|---|---|---|
| `gemini-2.5-flash` | Text, multimodal | Stabiele keuze, goede prijs/kwaliteit |
| `gemini-2.5-pro` | Text, multimodal | Complexe redenering, hoge kwaliteit |
| `gemini-2.5-flash-preview-tts` | TTS, multi-speaker | Podcast / dialoog generatie |
| `gemini-2.5-pro-preview-tts` | TTS, hogere kwaliteit | TTS met hogere kwaliteit |

### Imagen 4

| Model | Type | Gebruik |
|---|---|---|
| `imagen-4.0-generate-001` | Afbeelding generatie | Standaard kwaliteit |
| `imagen-4.0-ultra-generate-001` | Afbeelding generatie | Hoogste kwaliteit (1 afbeelding) |
| `imagen-4.0-fast-generate-001` | Afbeelding generatie | Snelst / goedkoopst |

> ⚠️ **Deprecated:** `gemini-2.0-flash` wordt uitgeschakeld op **31 maart 2026**. Migreer naar `gemini-2.5-flash` of `gemini-3-flash-preview`.

---

## 1. Text-to-Text (Chat / Completion)

Gebruik `gemini-3-flash-preview` als standaard voor nieuwe code. Schakel over naar `gemini-3-pro-preview` bij complexe redenering of lange documenten.

```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ vertexai: true, project: process.env.GCLOUD_PROJECT });

// Enkelvoudige aanroep
async function generateText(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      systemInstruction: 'Je bent een behulpzame assistent.',
    },
  });
  return response.text;
}

// Multi-turn chat (geheugen binnen sessie)
async function chatSession() {
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: 'Je bent een D&D dungeon master.',
      temperature: 0.9,
    },
  });

  const r1 = await chat.sendMessage({ message: 'Begin een avontuur in een donker bos.' });
  console.log(r1.text);

  const r2 = await chat.sendMessage({ message: 'Ik loop naar het licht toe.' });
  console.log(r2.text);
}

// Gestructureerde JSON output
async function generateStructured<T>(prompt: string, schema: object): Promise<T> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });
  return JSON.parse(response.text) as T;
}

// Streaming (voor lange responses)
async function streamText(prompt: string): Promise<void> {
  const stream = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  for await (const chunk of stream) {
    process.stdout.write(chunk.text ?? '');
  }
}
```

**Pricing (Gemini Developer API):**
- `gemini-2.5-flash`: $0.30/1M input tokens, $2.50/1M output tokens
- `gemini-2.5-pro`: $1.25/1M input (≤200k ctx), $10.00/1M output
- Context caching: 90% korting op gecachte tokens

---

## 2. Text-to-Dialogue (Podcast — twee stemmen)

De `gemini-2.5-flash-preview-tts` en `gemini-2.5-pro-preview-tts` modellen genereren natively audio met meerdere sprekers. Stijl, emotie en tempo stuur je via de prompt zelf.

De output is raw PCM audio (24.000 Hz, mono, 16-bit) — sla op als WAV.

```typescript
import { GoogleGenAI } from '@google/genai';
import wav from 'wav'; // npm install wav
import * as fs from 'node:fs';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

async function savePcmAsWav(pcmData: Buffer, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const writer = new wav.FileWriter(filename, {
      channels: 1,
      sampleRate: 24000,
      bitDepth: 16,
    });
    writer.on('finish', resolve);
    writer.on('error', reject);
    writer.write(pcmData);
    writer.end();
  });
}

async function generatePodcast(script: string, outputPath: string): Promise<void> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: script }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: 'Host',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } }, // Informatief
            },
            {
              speaker: 'Guest',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }, // Enthousiast
            },
          ],
        },
      },
    },
  });

  const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioData) throw new Error('Geen audio data ontvangen');

  const buffer = Buffer.from(audioData, 'base64');
  await savePcmAsWav(buffer, outputPath);
}

// Gebruik
const script = `
  Spreek dit uit als een podcast gesprek:

  Host: Welkom bij de show! Vandaag bespreken we de toekomst van AI in tabletop games.
  Guest: Dank je wel! Het is een fascinerend onderwerp.
  Host: Welke verandering zie jij als de grootste voor spelers?
  Guest: Ik denk dat AI dungeon masters binnen twee jaar de norm worden.
`;

await generatePodcast(script, 'podcast_output.wav');
```

### Beschikbare stemmen (selectie)

| Stem | Karakter |
|---|---|
| `Charon` | Informatief, rustig |
| `Puck` | Enthousiast, levendig |
| `Kore` | Zelfverzekerd, helder |
| `Fenrir` | Opgewonden, energiek |
| `Aoede` | Luchtig, vriendelijk |
| `Zephyr` | Helder, positief |
| `Leda` | Jeugdig, fris |
| `Orus` | Standvastig, gezaghebbend |

> Er zijn 30 stemmen beschikbaar. Stijl stuur je via de prompt (bijv. "zeg dit op een fluisterende toon").

**Limieten:**
- Input: max 32K tokens
- Output: raw PCM 24 kHz mono 16-bit (converteren naar WAV/MP3)
- Ondersteunt 24 talen (inclusief Nederlands)

**Pricing:**
- `gemini-2.5-flash-preview-tts`: $0.50/1M input, $10.00/1M output (audio tokens)
- `gemini-2.5-pro-preview-tts`: $1.00/1M input, $20.00/1M output

### Alternatief: Cloud Text-to-Speech — Chirp 3 HD

Chirp 3 HD is een aparte Google Cloud TTS service (niet Gemini) die native **MP3 en OGG output** levert — geen PCM-conversie nodig. Goede keuze als output formaat prioriteit heeft boven expressiviteit.

```bash
npm install @google-cloud/text-to-speech
```

```typescript
import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import * as fs from 'node:fs';

// Gebruik EU regio endpoint om data in Europa te houden
const client = new TextToSpeechClient({
  apiEndpoint: 'eu-texttospeech.googleapis.com',
});

type AudioEncoding = protos.google.cloud.texttospeech.v1.AudioEncoding;

// Enkelvoudige stem — directe MP3 output
async function synthesizeSpeech(text: string, outputPath: string): Promise<void> {
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: 'nl-NL',
      name: 'nl-NL-Chirp3-HD-Charon',
    },
    audioConfig: {
      audioEncoding: 'MP3' as unknown as AudioEncoding,
    },
  });

  fs.writeFileSync(outputPath, response.audioContent as Buffer);
}

// Multi-speaker podcast via SSML markup
async function synthesizePodcast(outputPath: string): Promise<void> {
  const ssml = `
    <speak>
      <voice name="nl-NL-Chirp3-HD-Charon">
        Welkom bij de show! Vandaag bespreken we de toekomst van AI in tabletop games.
      </voice>
      <voice name="nl-NL-Chirp3-HD-Puck">
        Dank je wel! Het is een fascinerend onderwerp.
      </voice>
      <voice name="nl-NL-Chirp3-HD-Charon">
        Welke verandering zie jij als de grootste voor spelers?
      </voice>
      <voice name="nl-NL-Chirp3-HD-Puck">
        Ik denk dat AI dungeon masters binnen twee jaar de norm worden.
      </voice>
    </speak>
  `;

  const [response] = await client.synthesizeSpeech({
    input: { ssml },
    voice: { languageCode: 'nl-NL' },
    audioConfig: {
      audioEncoding: 'MP3' as unknown as AudioEncoding,
    },
  });

  fs.writeFileSync(outputPath, response.audioContent as Buffer);
}

// OGG_OPUS (kleinste bestandsgrootte, geschikt voor streaming)
async function synthesizeOgg(text: string, outputPath: string): Promise<void> {
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: 'nl-NL',
      name: 'nl-NL-Chirp3-HD-Aoede',
    },
    audioConfig: {
      audioEncoding: 'OGG_OPUS' as unknown as AudioEncoding,
    },
  });

  fs.writeFileSync(outputPath, response.audioContent as Buffer);
}
```

### Beschikbare Chirp 3 HD stemmen

Voice naam formaat: `<locale>-Chirp3-HD-<Naam>` (bijv. `nl-NL-Chirp3-HD-Charon`)

| Stem | Geslacht | Karakter |
|---|---|---|
| `Charon` | Man | Informatief, rustig |
| `Puck` | Man | Enthousiast, levendig |
| `Fenrir` | Man | Opgewonden, energiek |
| `Orus` | Man | Standvastig, gezaghebbend |
| `Enceladus` | Man | Helder |
| `Iapetus` | Man | Expressief |
| `Algenib` | Man | Neutraal |
| `Aoede` | Vrouw | Luchtig, vriendelijk |
| `Kore` | Vrouw | Zelfverzekerd, helder |
| `Leda` | Vrouw | Jeugdig, fris |
| `Zephyr` | Vrouw | Helder, positief |
| `Sulafat` | Vrouw | Warm |
| `Gacrux` | Vrouw | Expressief |
| `Achernar` | Vrouw | Neutraal |

> 28 stemmen beschikbaar in totaal, verdeeld over 31 locales. Niet alle stemmen zijn beschikbaar voor elke taal — check de [ondersteunde stemmen](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types) voor jouw locale.

**Output formaten:**
- `MP3` — voor batch (opslaan naar bestand, uploaden naar Storage)
- `OGG_OPUS` — kleinste formaat, goed voor streaming
- `LINEAR16` — raw PCM, hoogste kwaliteit
- `MULAW` / `ALAW` — voor telefonie

**Limieten:**
- Input: tekst of SSML
- Regio's: `global`, `us`, `eu`, `europe-west2`, `asia-southeast1`, `asia-northeast1`
- Multi-speaker via SSML `<voice>` tags (geen aparte config zoals Gemini TTS)

**Vergelijking Gemini TTS vs Chirp 3 HD:**

| | Gemini 2.5 TTS | Chirp 3 HD |
|---|---|---|
| Output formaat | PCM → zelf converteren | **MP3, OGG direct** |
| Multi-speaker | Via config object | Via SSML markup |
| Stemkeuze | 30 stemmen | 28 stemmen |
| Expressiviteit | Hoog (prompt-gestuurd) | Goed (vast per stem) |
| Talen | 80+ | 31 locales |
| Aanbeveling | Meer expressie nodig | Directe MP3/OGG output |

---

## 3. PDF-to-Text (character sheet inlezen)

Gemini verwerkt PDFs als native multimodal input — het begrijpt tekst, tabellen, afbeeldingen, grafieken en gescande documenten (OCR) in één aanroep.

```typescript
import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs';

const ai = new GoogleGenAI({ vertexai: true, project: process.env.GCLOUD_PROJECT });

// Methode 1: Inline base64 (aanbevolen voor bestanden < 20MB)
async function extractPdfInline(pdfPath: string): Promise<string> {
  const base64Pdf = fs.readFileSync(pdfPath).toString('base64');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
          { text: 'Extraheer alle tekst uit dit PDF document. Behoud koppen, tabellen (als markdown) en lijsten.' },
        ],
      },
    ],
  });
  return response.text;
}

// Methode 2: Via Cloud Storage URI (aanbevolen voor grote bestanden)
async function extractPdfFromGcs(gcsUri: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { fileData: { fileUri: gcsUri, mimeType: 'application/pdf' } },
          { text: 'Extraheer alle tekst en structuur uit dit document.' },
        ],
      },
    ],
  });
  return response.text;
}

// Methode 3: Files API upload (bestanden 20MB–2GB)
async function extractPdfViaUpload(pdfPath: string): Promise<string> {
  const uploadedFile = await ai.files.upload({
    file: pdfPath,
    config: { mimeType: 'application/pdf' },
  });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { fileData: { fileUri: uploadedFile.uri, mimeType: 'application/pdf' } },
          { text: 'Lees dit character sheet en geef de gegevens terug als JSON.' },
        ],
      },
    ],
    config: { responseMimeType: 'application/json' },
  });
  return response.text;
}

// Character sheet specifiek: gestructureerde extractie
interface CharacterSheet {
  name: string;
  race: string;
  class: string;
  level: number;
  stats: Record<string, number>;
  skills: string[];
  equipment: string[];
  backstory: string;
}

async function extractCharacterSheet(pdfBase64: string): Promise<CharacterSheet> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          {
            text: `Lees dit D&D character sheet en extraheer alle gegevens.
                   Geef terug als JSON met: name, race, class, level, stats (STR/DEX/CON/INT/WIS/CHA),
                   skills (array), equipment (array), backstory (string).`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          race: { type: 'STRING' },
          class: { type: 'STRING' },
          level: { type: 'INTEGER' },
          stats: { type: 'OBJECT' },
          skills: { type: 'ARRAY', items: { type: 'STRING' } },
          equipment: { type: 'ARRAY', items: { type: 'STRING' } },
          backstory: { type: 'STRING' },
        },
      },
    },
  });
  return JSON.parse(response.text) as CharacterSheet;
}
```

**Limieten:**
- Max **1.000 pagina's** per PDF
- Max PDF grootte: **2 GB** (via Files API of GCS)
- Inline data: max **20 MB** totale request grootte
- Begrijpt gescande PDFs (OCR ingebouwd)

---

## 4. Text-to-Image (Imagen)

Imagen vereist **Vertex AI mode** — werkt niet met een gewone API key. `imagen-4.0-generate-001` is de standaard keuze.

```typescript
import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs';

// Imagen vereist Vertex AI
const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GCLOUD_PROJECT!,
  location: 'us-central1', // Imagen is alleen beschikbaar in us-central1
});

interface ImageGenerationOptions {
  prompt: string;
  numberOfImages?: number;      // 1–4 (ultra: altijd 1)
  aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
  negativePrompt?: string;
}

async function generateImage(options: ImageGenerationOptions): Promise<Buffer[]> {
  const { prompt, numberOfImages = 1, aspectRatio = '1:1', negativePrompt } = options;

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt,
    config: {
      numberOfImages,
      aspectRatio,
      negativePrompt,
      includeRaiReason: true,
    },
  });

  if (!response.generatedImages?.length) {
    throw new Error('Geen afbeeldingen gegenereerd');
  }

  return response.generatedImages.map((img) =>
    Buffer.from(img.image!.imageBytes as string, 'base64')
  );
}

// Opslaan naar schijf
async function generateAndSave(prompt: string, outputDir: string): Promise<void> {
  const images = await generateImage({
    prompt,
    numberOfImages: 4,
    aspectRatio: '1:1',
    negativePrompt: 'blurry, low quality, cartoon',
  });

  images.forEach((buffer, i) => {
    fs.writeFileSync(`${outputDir}/image_${i}.png`, buffer);
  });
}

// Ultra model (hoogste kwaliteit, 1 afbeelding per aanroep)
async function generateUltraImage(prompt: string): Promise<Buffer> {
  const response = await ai.models.generateImages({
    model: 'imagen-4.0-ultra-generate-001',
    prompt,
    config: { numberOfImages: 1 },
  });

  const bytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!bytes) throw new Error('Geen afbeelding gegenereerd');
  return Buffer.from(bytes as string, 'base64');
}
```

> **Let op:** Imagen is alleen beschikbaar in `us-central1`. Gebruik dit in een aparte function of client die naar die regio deployt.

**Limieten:**
- `imagen-4.0-generate-001`: max 4 afbeeldingen per aanroep
- `imagen-4.0-ultra-generate-001`: altijd 1 afbeelding per aanroep
- SynthID watermark is standaard ingeschakeld
- Beschikbare aspect ratios: `1:1`, `9:16`, `16:9`, `4:3`, `3:4`

**Pricing:**
- `imagen-4.0-fast-generate-001`: $0.02 per afbeelding
- `imagen-4.0-generate-001`: $0.04 per afbeelding
- `imagen-4.0-ultra-generate-001`: $0.06 per afbeelding

---

## 5. Speech-to-Text (transcriberen)

Gemini multimodale modellen verwerken audio natively — met sprekerherkenning, tijdstempels, emotiedetectie en vertaling in één aanroep.

```typescript
import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
import * as fs from 'node:fs';

const ai = new GoogleGenAI({ vertexai: true, project: process.env.GCLOUD_PROJECT });

// Methode 1: Files API upload (aanbevolen voor > 20MB)
async function transcribeAudio(audioPath: string): Promise<string> {
  const uploadedFile = await ai.files.upload({
    file: audioPath,
    config: { mimeType: 'audio/mp3' },
  });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: createUserContent([
      createPartFromUri(uploadedFile.uri, uploadedFile.mimeType!),
      'Transcribeer dit audio fragment. Formaat: [MM:SS] Spreker: tekst',
    ]),
  });
  return response.text;
}

// Methode 2: Inline base64 (bestanden < 20MB)
async function transcribeInline(audioPath: string): Promise<string> {
  const audioBase64 = fs.readFileSync(audioPath, { encoding: 'base64' });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } },
          { text: 'Transcribeer dit audio fragment nauwkeurig.' },
        ],
      },
    ],
  });
  return response.text;
}

// Methode 3: Via Cloud Storage (grote sessie-opnames)
async function transcribeFromGcs(gcsUri: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-001',
    contents: [{
      role: 'user',
      parts: [
        { file_data: { file_uri: gcsUri, mime_type: 'audio/mpeg' } },
        { text: 'Transcribeer dit interview. Formaat: tijdcode, spreker, tekst. Gebruik Spreker A, Spreker B.' },
      ],
    }],
  });
  return response.text;
}

// Gestructureerde transcriptie met JSON output
interface TranscriptSegment {
  speaker: string;
  timestamp: string;
  text: string;
  language: string;
}

interface TranscriptResult {
  summary: string;
  segments: TranscriptSegment[];
}

async function transcribeStructured(audioPath: string): Promise<TranscriptResult> {
  const uploadedFile = await ai.files.upload({
    file: audioPath,
    config: { mimeType: 'audio/mp3' },
  });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { fileData: { fileUri: uploadedFile.uri } },
        {
          text: `Verwerk dit audio fragment:
            1. Identificeer afzonderlijke sprekers
            2. Tijdstempels in MM:SS formaat
            3. Detecteer de taal
            4. Geef een beknopte samenvatting`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          summary: { type: 'STRING' },
          segments: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                speaker: { type: 'STRING' },
                timestamp: { type: 'STRING' },
                text: { type: 'STRING' },
                language: { type: 'STRING' },
              },
              required: ['speaker', 'timestamp', 'text', 'language'],
            },
          },
        },
        required: ['summary', 'segments'],
      },
    },
  });

  return JSON.parse(response.text) as TranscriptResult;
}
```

**Ondersteunde audio formats:** `audio/wav`, `audio/mp3`, `audio/aiff`, `audio/aac`, `audio/ogg`, `audio/flac`

**Limieten:**
- Max audio lengte: **9,5 uur** per aanroep
- Inline data: max **20 MB**
- Elke seconde audio = ~32 tokens
- Audio wordt intern gedownsampled naar 16 kbps

---

## 6. Text-to-PDF

PDF generatie is geen native Gemini feature. De aanbevolen aanpak is: **Gemini genereert de content, een PDF library rendert het document**.

### Vergelijking libraries

| Library | Best voor | CSS | Complexiteit |
|---|---|---|---|
| **PDFKit** | Simpele rapporten, facturen | Nee (programmatisch) | Laag |
| **Puppeteer** | Gestileerde HTML → PDF | Volledige CSS/JS | Hoog |
| **PDFMake** | Gestructureerde documenten, tabellen | Nee (JSON definitie) | Medium |
| **pdf-lib** | Bestaande PDFs aanpassen | Nee | Laag |

### Aanpak A: PDFKit (aanbevolen voor simpele docs)

```typescript
import { GoogleGenAI } from '@google/genai';
import PDFDocument from 'pdfkit'; // npm install pdfkit @types/pdfkit
import * as fs from 'node:fs';

const ai = new GoogleGenAI({ vertexai: true, project: process.env.GCLOUD_PROJECT });

interface PdfContent {
  title: string;
  subtitle: string;
  sections: Array<{ heading: string; content: string }>;
}

async function generatePdfContent(topic: string): Promise<PdfContent> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Maak een professioneel rapport over: ${topic}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          subtitle: { type: 'STRING' },
          sections: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                heading: { type: 'STRING' },
                content: { type: 'STRING' },
              },
            },
          },
        },
      },
    },
  });
  return JSON.parse(response.text);
}

async function generatePdf(topic: string, outputPath: string): Promise<void> {
  const content = await generatePdfContent(topic);
  const doc = new PDFDocument({ margin: 50 });

  doc.pipe(fs.createWriteStream(outputPath));

  doc.fontSize(24).font('Helvetica-Bold').text(content.title, { align: 'center' });
  doc.fontSize(14).font('Helvetica').text(content.subtitle, { align: 'center' });
  doc.moveDown(2);

  for (const section of content.sections) {
    doc.fontSize(16).font('Helvetica-Bold').text(section.heading);
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').text(section.content, { align: 'justify' });
    doc.moveDown(1.5);
  }

  doc.end();
}
```

### Aanpak B: Puppeteer (aanbevolen voor gestileerde HTML docs)

```typescript
import puppeteer from 'puppeteer'; // npm install puppeteer
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ vertexai: true, project: process.env.GCLOUD_PROJECT });

async function generateStyledPdf(topic: string, outputPath: string): Promise<void> {
  // Stap 1: Gemini genereert volledige HTML met embedded CSS
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Genereer een compleet, gestileerd HTML document (met embedded CSS)
               voor een professioneel rapport over: ${topic}.
               Gebruik een schoon, modern design. Alleen geldige HTML, geen markdown.`,
  });

  const htmlContent = response.text;

  // Stap 2: Puppeteer rendert HTML naar PDF
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  await page.pdf({
    path: outputPath,
    format: 'A4',
    margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    printBackground: true,
  });

  await browser.close();
}
```

> **Aanbeveling:** Gebruik **PDFKit** voor simpele, gestructureerde documenten (character sheets, rapporten). Gebruik **Puppeteer** wanneer je volledige CSS-controle nodig hebt (gestileerde exports, branded documenten).

> **Cloud Functions:** Puppeteer heeft extra configuratie nodig in Cloud Functions (headless Chrome). PDFKit werkt out-of-the-box.

---

## Cloud Functions — Integratiepatroon

In Cloud Functions gebruik je `@google/genai` direct met ADC. **Gebruik geen Firebase AI Logic** (dat is voor client-side mobile/web apps).

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GCLOUD_PROJECT,
  location: 'europe-west1',
});

export const generateContent = onCall(
  {
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: ['GOOGLE_AI_API_KEY'], // Alleen nodig als je AI Studio key gebruikt
  },
  async (request) => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: request.data.prompt,
    });
    return { text: response.text };
  }
);
```

### Secrets in Cloud Functions

API keys worden beheerd via Google Cloud Secret Manager en gedeclareerd in de function definitie:

```typescript
export const myFunction = onCall(
  {
    secrets: ['GOOGLE_AI_API_KEY', 'ELEVENLABS_API_KEY'],
  },
  async (request) => {
    const apiKey = process.env.GOOGLE_AI_API_KEY; // automatisch geïnjecteerd
  }
);
```

> **Let op:** Keys die als `secrets` zijn gedeclareerd mogen **niet** ook in `.env` staan — dat geeft een conflict bij deployment.

---

## Claude Haiku 4.5 via Vertex AI

Claude modellen van Anthropic zijn beschikbaar via het Vertex AI Model Garden. Gebruik de `@anthropic-ai/vertex-sdk` — authenticeert via ADC / service account, **geen Anthropic API key nodig**.

```bash
npm install @anthropic-ai/vertex-sdk
```

### Initialisatie

```typescript
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

// Gebruikt Application Default Credentials (service account in Cloud Functions)
const client = new AnthropicVertex({
  projectId: process.env.GCLOUD_PROJECT,
  region: 'europe-west1',  // of 'global' voor automatische routing
});
```

### Text-to-text (chat)

```typescript
const response = await client.messages.create({
  model: 'claude-haiku-4-5@20251001',
  max_tokens: 1024,
  system: 'Je bent een behulpzame assistent.',
  messages: [
    { role: 'user', content: 'Hallo!' },
  ],
});

console.log(response.content[0].text);
```

### Multi-turn chat

```typescript
const messages: { role: 'user' | 'assistant'; content: string }[] = [];

// Voeg berichten toe en stuur volledige history mee
messages.push({ role: 'user', content: 'Begin een avontuur.' });

const r1 = await client.messages.create({
  model: 'claude-haiku-4-5@20251001',
  max_tokens: 1024,
  system: 'Je bent een D&D dungeon master.',
  messages,
});

messages.push({ role: 'assistant', content: r1.content[0].text });
messages.push({ role: 'user', content: 'Ik loop naar het licht toe.' });

const r2 = await client.messages.create({
  model: 'claude-haiku-4-5@20251001',
  max_tokens: 1024,
  system: 'Je bent een D&D dungeon master.',
  messages,
});
```

### Model IDs op Vertex AI

| Model | Vertex AI model ID |
|---|---|
| Claude Haiku 4.5 | `claude-haiku-4-5@20251001` |
| Claude Sonnet 4.5 | `claude-sonnet-4-5@20250929` |
| Claude Opus 4.6 | `claude-opus-4-6` |

### Regio's voor Claude Haiku 4.5

| Regio | Endpoint |
|---|---|
| Europa | `europe-west1` |
| VS | `us-east5` |
| Azië | `asia-east1` |
| Globaal | `global` (aanbevolen voor max beschikbaarheid) |

> **Let op:** Gebruik `region: 'global'` voor maximale beschikbaarheid zonder pricing premium. Gebruik een specifieke regio alleen als data residency vereist is (10% toeslag).

### Gebruik in Cloud Functions (zonder secret)

```typescript
export const characterChat = onCall(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    // Geen secrets nodig — ADC via service account
  },
  async (request) => {
    const client = new AnthropicVertex({
      projectId: process.env.GCLOUD_PROJECT,
      region: 'europe-west1',
    });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5@20251001',
      max_tokens: 1024,
      system: request.data.systemPrompt,
      messages: request.data.messages,
    });

    return { text: response.content[0].text };
  }
);
```

---

## Migratie van `@google-cloud/vertexai`

De oude `@google-cloud/vertexai` package werkt nog maar krijgt geen nieuwe features (zoals Gemini 2.5, Imagen 4, TTS). Migreer nieuwe code naar `@google/genai`.

| Oud (`@google-cloud/vertexai`) | Nieuw (`@google/genai`) |
|---|---|
| `new VertexAI({ project, location })` | `new GoogleGenAI({ vertexai: true, project, location })` |
| `vertexai.getGenerativeModel({ model })` | `ai.models.generateContent({ model, ... })` |
| `model.generateContent(request)` | `ai.models.generateContent({ model, contents, config })` |
| `model.startChat()` | `ai.chats.create({ model, config })` |
