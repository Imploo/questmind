# QuestMind Bruno API Collection

Deze collectie bevat alle Firebase Functions voor lokaal testen met de Firebase Emulator.

## Setup

### 1. Start Firebase Emulator

```bash
npm run start:backend
```

Of gebruik het volledige commando:

```bash
firebase serve
```

De functions emulator draait standaard op:
- **Port**: 5001
- **URL**: http://127.0.0.1:5001/questmind-nl/europe-west1

### 2. Open Bruno

1. Download Bruno van https://www.usebruno.com/
2. Open Bruno
3. Klik op "Open Collection"
4. Selecteer de `bruno` directory in dit project

### 3. Configureer Environment

1. Selecteer "Local Emulator" environment in Bruno
2. Update de test data variabelen:
   - `testCampaignId`: Een bestaande campaign ID uit je lokale Firestore
   - `testSessionId`: Een bestaande session ID

## Available Requests

### Generate Podcast Audio
Genereert een podcast van een D&D sessie verhaal.

**Test Flow:**
1. Zorg dat je een campagne en sessie hebt in Firestore
2. Pas `story` en `sessionTitle` aan in de request body
3. Verstuur de request
4. Check Firestore voor progress updates

### Transcribe Audio Batch
Transcribeert een audio bestand met Google Gemini batch API.

**Test Flow:**
1. Upload een audio bestand naar Firebase Storage
2. Kopieer de gs:// URL
3. Plak de URL in `storageUrl`
4. Verstuur de request
5. Check Firestore voor batch job status

### Gemini Callback
Webhook voor Gemini batch completion (normaal gesproken door Google aangeroepen).

**Test Flow:**
1. Verkrijg een batch job name van een actieve transcriptie
2. Update `batchJobName` in de request
3. Verstuur de request om completion te simuleren

### Poll Batch Jobs
Pollt alle pending batch jobs (normaal scheduled).

**Test Flow:**
1. Start een transcriptie met "Transcribe Audio Batch"
2. Wacht een paar seconden
3. Roep "Poll Batch Jobs" aan
4. Check de logs en Firestore voor updates

### Story Generation Worker
Genereert een verhaal van getranscribeerde audio.

**Test Flow:**
1. Zorg dat een sessie transcriptie data heeft
2. Update campaignId en sessionId
3. Verstuur de request
4. Check Firestore voor het gegenereerde verhaal

### Gemini Batch Status
Haalt de status op van een Gemini batch job direct van de API.

**Test Flow:**
1. Kopieer de batch job name van een transcriptie (bijv. `batches/wgbfhapzfm6mbcel50u2ac2592r3ypv2jlna`)
2. Update `batchJobName` en `geminiApiKey` in de Local environment
3. Verstuur de request
4. Bekijk de volledige status en response data

## Tips

### Firestore Emulator
Als je ook de Firestore emulator gebruikt, update de environment variabelen om naar de lokale emulator te wijzen.

### Authentication
Voor lokale testing kun je authentication skippen. In productie vereisen de functions een Firebase Auth token.

### Logs bekijken
Check de terminal waar `firebase serve` draait voor function logs.

### Environment Variables
Zorg dat je `.env` bestand in de `functions` directory de volgende secrets bevat:
- `GOOGLE_AI_API_KEY`
- `ELEVENLABS_API_KEY`
- `GEMINI_CALLBACK_SECRET`

## Project Structure

```
bruno/
├── bruno.json                      # Collectie configuratie
├── environments/
│   ├── Local.bru                   # Lokale environment variabelen
│   └── Local Emulator.bru          # Lokale emulator environment
├── Generate Podcast Audio.bru      # Podcast generatie
├── Transcribe Audio Batch.bru      # Audio transcriptie
├── Gemini Callback.bru             # Gemini webhook
├── Gemini Batch Status.bru         # Gemini batch status check
├── Poll Batch Jobs.bru             # Batch job polling
├── Story Generation Worker.bru     # Verhaal generatie
└── README.md                       # Deze file
```
