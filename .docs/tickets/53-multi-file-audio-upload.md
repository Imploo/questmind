# Ticket #53: Multi-File Audio Upload (Concatenate & Upload)

**Created:** 2026-02-17
**Priority:** Medium
**Status:** Todo
**Effort:** 2-3 days
**Dependencies:** -

---

## Description

Ondersteuning toevoegen voor het uploaden van meerdere audiobestanden tegelijk. Meerdere bestanden zijn altijd opnames van **dezelfde sessie/avond** (bijv. opname gestopt en opnieuw gestart). De bestanden worden individueel gecomprimeerd, daarna samengevoegd tot één MP3, en dat ene bestand gaat door de bestaande upload flow.

## Expected Result

- Gebruiker kan meerdere audiobestanden selecteren via file picker of drag-and-drop
- Bestanden worden in de juiste volgorde getoond (sorteerbaar/versleepbaar)
- Elk bestand wordt individueel gecomprimeerd (bestaande `AudioCompressionService`)
- Gecomprimeerde MP3-blobs worden geconcateneerd tot één bestand
- Het samengevoegde bestand gaat door de bestaande upload pipeline (upload → transcriptie)
- Eén sessie wordt aangemaakt, alsof het één opname was

## Current Situation

### Upload Component (`audio-upload.component.ts`)
- `<input type="file">` heeft geen `multiple` attribuut
- `onFileSelected()` en `onDrop()` pakken alleen `files[0]`
- State: `selectedFile = signal<File | null>(null)` — één bestand

### Compression Service (`audio-compression.service.ts`)
- `compress(file: File)` verwerkt één bestand
- Output: `CompressionResult` met `blob: Blob` (MP3, 16 kbps, 16 kHz, mono)
- Alle bestanden worden naar identieke MP3-parameters gecomprimeerd

### Processing Service (`audio-complete-processing.service.ts`)
- `startCompleteProcessing()` accepteert één `audioFile: File`
- Pipeline: compress → upload → transcribe

### Page Component (`audio-upload-page.component.ts`)
- Roept `startCompleteProcessing()` aan met één bestand
- Trackt stage/progress voor één operatie

## Technical Details

### Kernidee: Compress each, concatenate, upload once

```
[File A] → compress → MP3 blob A ─┐
[File B] → compress → MP3 blob B ─┼─→ concatenate → [single MP3 blob] → existing upload flow
[File C] → compress → MP3 blob C ─┘
```

MP3 is een frame-based formaat. Zolang alle blobs met dezelfde parameters gecomprimeerd zijn (16 kbps, 16 kHz, mono — dat doet `AudioCompressionService` al), kunnen ze simpelweg achter elkaar geplakt worden met `new Blob([blobA, blobB, blobC], { type: 'audio/mpeg' })`. Er is geen re-encoding of parsing nodig.

### Frontend wijzigingen

#### 1. `AudioUploadComponent` (dumb component)

**File selectie:**
- `<input type="file" multiple>` toevoegen
- `selectedFiles = signal<File[]>([])` i.p.v. `selectedFile`
- `onFileSelected()`: alle bestanden accepteren, niet alleen `files[0]`
- `onDrop()`: alle bestanden accepteren
- Validatie per bestand (type, grootte)

**UI:**
- Lijst van geselecteerde bestanden tonen met naam + grootte
- Mogelijkheid om individuele bestanden te verwijderen
- Volgorde aanpasbaar (drag-to-reorder of pijltjes omhoog/omlaag) — de volgorde bepaalt de afspeelvolgorde in de geconcateneerde audio
- Totale grootte tonen
- Sessienaam en datum blijven single fields (het is één sessie)

**Output:**
- `uploadRequested` emit met `files: File[]` i.p.v. `file: File`

#### 2. `AudioUploadPageComponent` (smart component)

**Processing flow aanpassen:**
- Bij meerdere bestanden: compress elk bestand sequentieel
- Progress tonen: "Compressing file 1 of 3...", "Compressing file 2 of 3...", etc.
- Na compressie: `new Blob([...compressedBlobs], { type: 'audio/mpeg' })` → één blob
- Die ene blob gaat als `File` door de bestaande upload flow
- `startCompleteProcessing()` hoeft niet aangepast te worden als we de concatenated blob als File wrappen

**Progress verdeling (voorbeeld met 3 bestanden):**
- 0-60%: Compressie (20% per bestand)
- 60-100%: Upload (bestaande flow)

#### 3. Interface aanpassingen

**`AudioUpload` interface** — optioneel uitbreiden:
```typescript
export interface AudioUpload {
  file: File;              // blijft: het geconcateneerde bestand
  sourceFiles?: number;    // nieuw: aantal bronbestanden (voor metadata)
  sessionName?: string;
  sessionDate?: string;
  userId: string;
  campaignId: string;
}
```

**`UploadRequestEvent`** aanpassen:
```typescript
export interface UploadRequestEvent {
  files: File[];           // was: file: File
  sessionName?: string;
  sessionDate?: string;
  userId: string;
  campaignId: string;
  keepAwake?: boolean;
}
```

### Concatenatie-stap (detail)

```typescript
async concatenateCompressedBlobs(blobs: Blob[]): Blob {
  // MP3 is frame-based — blobs met identieke encoding params
  // kunnen simpelweg achter elkaar geplakt worden
  return new Blob(blobs, { type: 'audio/mpeg' });
}
```

Als er maar 1 bestand is geselecteerd, wordt de concatenatie-stap overgeslagen en gaat het bestand direct door de bestaande flow (geen regressie).

### Backend wijzigingen

**Geen.** De backend ontvangt gewoon één MP3-bestand, net als nu. Het maakt niet uit dat het intern uit meerdere bestanden is samengesteld.

## Files to Modify

| File | Change |
|------|--------|
| `src/app/audio/audio-upload.component.ts` | Multi-file selectie, bestandenlijst, volgorde-beheer, output aanpassen |
| `src/app/audio/audio-upload-page.component.ts` | Sequentiële compressie, concatenatie, progress per bestand |
| `src/app/audio/services/audio-session.models.ts` | `UploadRequestEvent` aanpassen (`file` → `files`) |

## UX overwegingen

- Bij selectie van 1 bestand: gedrag identiek aan huidige flow (geen regressie)
- Bij selectie van meerdere bestanden: duidelijke lijst met volgorde en verwijderopties
- Bestanden sorteren op naam als default (vaak `recording_001.mp3`, `recording_002.mp3`)
- Progress toont welk bestand momenteel gecomprimeerd wordt
- Totale geschatte grootte na compressie eventueel tonen

## Out of Scope

- Parallelle compressie van meerdere bestanden (te geheugenintensief — Web Audio API decodering laadt het volledige bestand in memory)
- Drag-to-reorder (kan later toegevoegd worden, pijltjes volstaan voor nu)
- Backend-side concatenatie
- Splitsing van te lange geconcateneerde audio
