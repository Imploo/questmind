# Audio Session Transcription & Story Generation

## Overview
Implement een feature voor het uploaden en transcriberen van D&D sessie-opnames, waarbij de ruwe audio wordt omgezet in een gestructureerd verhalend verslag van de sessie. De transcriptie moet automatisch ruis filteren en zich focussen op belangrijke gebeurtenissen, dialogen en beslissingen.

## Key Requirements

### 1. **Audio Upload & Storage**
- Ondersteuning voor grote audiobestanden (>100MB)
- Accepteer gangbare audio formaten (MP3, WAV, M4A, OGG)
- Upload progress indicator voor gebruikersfeedback
- Chunked upload voor grote bestanden om timeouts te voorkomen
- Client-side file validatie (bestandstype, grootte)
- **Firebase Storage (Google Cloud Storage bucket)**:
  - Upload audiobestanden naar Firebase Storage
  - Gebruik resumable uploads voor grote bestanden
  - Genereer download URLs voor AI processing
  - Opslag structuur: `audio-sessions/{userId}/{sessionId}/{filename}`
  - Automatische cleanup van oude bestanden (optioneel, configureerbaar retention policy)

### 2. **AI Transcriptie & Verwerking**
- Integratie met bestaande AI model (Gemini API)
- Twee-stappen proces:
  1. **Transcriptie**: Audio naar tekst met timestamps
  2. **Story Generation**: Ruwe transcriptie naar narratief verslag
- Gebruik dezelfde API configuratie als huidige chat interface
- Ondersteuning voor lange audio files (mogelijk meerdere API calls)

### 3. **Story Generation Specificaties**
- **Focus op D&D specifieke content**:
  - Karakteracties en beslissingen
  - Combat encounters en belangrijke rolls
  - Roleplaying momenten en dialogen
  - Plot ontwikkelingen en NPC interacties
  - Loot en rewards
  - Belangrijke game mechanics (initiative, skill checks, saves)

- **Filtering**:
  - Verwijder niet-relevante conversaties (meta-discussies, pauzes)
  - Filter achtergrondruis en overlappende spraak
  - Consolideer herhalingen en correcties
  - Verwijder technische onderbrekingen

- **Output formaat**:
  - Narratief in derde persoon of mixed perspectief
  - Chronologische volgorde met secties (bijvoorbeeld per encounter)
  - Behoud karakternamen en belangrijke quotes
  - Optioneel: timestamps voor belangrijke momenten
  - Markdown formatting voor leesbaarheid

### 4. **System Prompt Design**
De AI moet geconfigureerd worden met een system prompt die:
- Context geeft dat het om D&D 5e sessies gaat
- Instructies bevat voor story formatting
- Richtlijnen geeft voor wat wel/niet te includeren
- Tone/style guidance (bijvoorbeeld: engaging narrative vs dry recap)

**Voorbeeld system prompt outline**:
```
Je bent een ervaren D&D Session Recorder. Je taak is om audio transcripties 
van D&D sessies om te zetten in een samenhangend, leesbaar verslag.

INCLUDE:
- Alle combat encounters met belangrijke rolls en outcomes
- Character development en belangrijke dialogen
- Plot progressie en quest updates
- NPC interacties
- Loot en rewards
- Belangrijke skill checks en saves

EXCLUDE:
- Meta-game discussies over regels
- Pauzes en niet-game gerelateerde conversaties
- Technische onderbrekingen
- Herhaalde of gecorrigeerde statements

FORMAT:
- Gebruik narratieve derde persoon waar mogelijk
- Behoud character names en voices in belangrijke momenten
- Organiseer in secties (bijv. "The Tavern Encounter", "Battle with the Goblins")
- Gebruik Markdown voor headers en emphasis
```

### 5. **User Experience**
- Upload interface met drag-and-drop
- Progress indicator tijdens transcriptie (kan minuten duren)
- Preview van transcriptie resultaat
- Optie om story te bewerken of te regenereren
- Download/export opties (Markdown, PDF)
- Geschiedenis van getranscribeerde sessies

## Technical Implementation

### Frontend Components
- **Audio Upload Component** (`audio-upload.component.ts`):
  - File picker met drag-and-drop
  - Upload progress tracking
  - File validation
  - Error handling
  - Firebase Storage upload integratie

- **Transcription Status Component** (`transcription-status.component.ts`):
  - Real-time progress updates
  - Status messages (uploading, transcribing, generating story)
  - Cancel/retry functionaliteit

- **Story Viewer Component** (`session-story.component.ts`):
  - Display gegenereerde story
  - Edit/regenerate opties
  - Export functionaliteit
  - Markdown rendering

### Services
- **Audio Service** (`audio.service.ts`):
  ```ts
  interface AudioUpload {
    file: File;
    sessionName?: string;
    sessionDate?: Date;
    userId: string;
  }

  interface StorageMetadata {
    sessionId: string;
    storagePath: string;
    downloadUrl: string;
    fileSize: number;
    contentType: string;
    uploadedAt: Date;
  }

  interface TranscriptionResult {
    id: string;
    rawTranscript: string;
    timestamps: Array<{time: number, text: string}>;
    status: 'processing' | 'completed' | 'failed';
    storageMetadata: StorageMetadata;
  }

  interface SessionStory {
    id: string;
    title: string;
    content: string; // Markdown formatted
    sessionDate: Date;
    audioFileName: string;
    storageUrl: string; // Firebase Storage URL
    createdAt: Date;
  }
  ```

- **Firebase Storage Service** (`firebase-storage.service.ts`):
  ```ts
  // Upload met progress tracking
  uploadAudioFile(file: File, userId: string, sessionId: string): Observable<UploadProgress>
  
  // Download URL genereren voor AI processing
  getDownloadUrl(storagePath: string): Promise<string>
  
  // Verwijderen van audio bestanden
  deleteAudioFile(storagePath: string): Promise<void>
  
  // List user's audio files
  listUserAudioFiles(userId: string): Promise<StorageMetadata[]>
  ```

- **Integration met bestaande ChatService**:
  - Hergebruik AI API configuratie
  - Deel error handling en retry logic
  - Consistente API key management

### AI Integration
1. **Audio Transcriptie**:
   - Gebruik Gemini API met audio input via URL reference
   - Audio file URL uit Firebase Storage doorgeven aan Gemini API
   - Alternatief: gebruik Google Speech-to-Text API met Cloud Storage URI
   - Chunk lange audio files voor processing (indien nodig)

2. **Story Generation**:
   - Send transcriptie naar Gemini API met D&D system prompt
   - Voor zeer lange transcripts: opdelen in chunks en samenvoegen
   - Streaming response voor real-time feedback

### Firebase Storage Configuration
- **Storage Rules**:
  ```
  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      match /audio-sessions/{userId}/{sessionId}/{fileName} {
        // Alleen de eigenaar kan uploaden/lezen/verwijderen
        allow read, write, delete: if request.auth != null && request.auth.uid == userId;
        
        // Validatie: max 500MB, alleen audio files
        allow write: if request.resource.size < 500 * 1024 * 1024
                     && request.resource.contentType.matches('audio/.*');
      }
    }
  }
  ```

- **Bucket Configuratie**:
  - CORS instellingen voor uploads vanuit frontend
  - Lifecycle policy voor automatische cleanup (bijv. na 90 dagen)
  - Regio selectie (bij voorkeur zelfde als Firestore/Functions)

- **Integration Flow**:
  1. User selecteert audio file
  2. Frontend uploadt naar Firebase Storage met resumable upload
  3. Storage URL wordt opgeslagen in Firestore (session metadata)
  4. Gemini API krijgt storage URL voor transcriptie
  5. Transcriptie en story worden opgeslagen in Firestore
  6. Optioneel: audio file verwijderen na succesvolle transcriptie (cost optimization)

### Storage & State Management
- **Firestore** voor:
  - Session metadata (title, date, status, userId)
  - Storage references (paths, URLs)
  - Transcriptie resultaten
  - Gegenereerde stories
  - Processing status tracking

- **Firebase Storage** voor:
  - Ruwe audio bestanden
  - Georganiseerd per user en session

- **Local Storage** voor:
  - User preferences (export format, etc.)
  - Tijdelijke upload state (voor resume bij disconnect)

- **Signal-based state management**:
  - Upload progress
  - Transcription status
  - Story generation state
  - Firebase auth state

### API Rate Limiting & Cost Management
- Waarschuwing voor gebruiker over processing tijd voor grote files
- Optionele background processing indicator
- Cost estimation voor zeer lange audio files (indien relevant voor API billing)
- **Storage cost awareness**:
  - Toon geschatte storage kosten voor grote files
  - Optie om audio automatisch te verwijderen na transcriptie
  - Configureerbare retention policy per user

## Mock Development
- Mock audio transcriptie responses voor development
- Placeholder story generation met static content
- Simulated processing delays voor realistic UX testing
- Sample audio files voor testing (verschillende lengtes/kwaliteiten)

## Future Enhancements (out of scope voor MVP)
- Speaker identification (wie zegt wat)
- Multi-language support
- Integration met character sheets (automatic XP tracking, etc.)
- Automatic tagging en searchable archive
- Collaborative editing van stories
- Audio playback met synchronized transcript

## Success Criteria
- [ ] Gebruiker kan audio file uploaden van >100MB naar Firebase Storage
- [ ] Upload progress wordt real-time getoond
- [ ] Audio file wordt veilig opgeslagen in user-specifieke bucket path
- [ ] Gemini API kan audio file bereiken via storage URL
- [ ] Transcriptie completeert succesvol
- [ ] Gegenereerde story bevat belangrijke game events
- [ ] Irrelevante content is gefilterd
- [ ] Story is leesbaar en well-formatted in Markdown
- [ ] Processing status is duidelijk gecommuniceerd
- [ ] User kan story downloaden/exporteren
- [ ] Session metadata wordt opgeslagen in Firestore
- [ ] User kan geschiedenis van sessies bekijken
- [ ] Consistent met bestaande AI chat interface patterns
- [ ] Firebase Storage security rules zijn correct geconfigureerd

## Dependencies
- Existing chat service en AI API integration
- **Firebase Storage** voor audio file opslag
- **Firestore** voor session metadata en transcripties
- **Firebase Authentication** voor user-specifieke storage access
- AngularFire library voor Firebase integratie
- Markdown renderer library
- Progress tracking utilities

## Firebase Setup Requirements
1. **Storage Bucket**:
   - Maak/configureer Firebase Storage bucket
   - Set CORS policy voor frontend uploads
   - Configureer lifecycle rules voor cost optimization

2. **Security Rules**:
   - Implementeer user-scoped access rules
   - Validatie op file types en sizes
   
3. **Firestore Collections**:
   ```
   /audio-sessions/{sessionId}
     - userId: string
     - title: string
     - sessionDate: timestamp
     - storagePath: string
     - storageUrl: string
     - status: 'uploading' | 'processing' | 'completed' | 'failed'
     - transcription: string (optioneel, kan groot zijn)
     - story: string (markdown)
     - createdAt: timestamp
     - updatedAt: timestamp
   ```

## Estimated Complexity
**High** - vereist:
- Large file handling met Firebase Storage resumable uploads
- Firebase Storage bucket configuratie en security rules
- Firestore schema design voor session tracking
- Complex AI prompt engineering
- Multi-step processing pipeline (upload → transcribe → generate story)
- Integration tussen Firebase Storage URLs en Gemini API
- Extensive error handling (network, storage, API failures)
- Time-consuming processing UX
- User authentication en authorization voor storage access
