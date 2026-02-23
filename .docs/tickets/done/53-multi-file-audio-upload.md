# Ticket #53: Multi-File Audio Upload (Concatenate & Upload)

**Created:** 2026-02-17
**Priority:** Medium
**Status:** Done
**Effort:** 2-3 days
**Dependencies:** -

---

## Description

Ondersteuning toevoegen voor het uploaden van meerdere audiobestanden tegelijk. Meerdere bestanden zijn altijd opnames van **dezelfde sessie/avond** (bijv. opname gestopt en opnieuw gestart). De bestanden worden individueel gecomprimeerd, daarna samengevoegd tot een MP3, en dat ene bestand gaat door de bestaande upload flow.

## Expected Result

- Gebruiker kan meerdere audiobestanden selecteren via file picker of drag-and-drop
- Bestanden worden in de juiste volgorde getoond (sorteerbaar met pijltjes)
- Elk bestand wordt individueel gecomprimeerd (bestaande `AudioCompressionService`)
- Gecomprimeerde MP3-blobs worden geconcateneerd tot een bestand
- Het samengevoegde bestand gaat door de bestaande upload pipeline (upload, transcriptie)
- Een sessie wordt aangemaakt, alsof het een opname was

## Technical Details

### Kernidee: Compress each, concatenate, upload once

```
[File A] -> compress -> MP3 blob A -+
[File B] -> compress -> MP3 blob B -+-> concatenate -> [single MP3 blob] -> existing upload flow
[File C] -> compress -> MP3 blob C -+
```

MP3 is een frame-based formaat. Zolang alle blobs met dezelfde parameters gecomprimeerd zijn (16 kbps, 16 kHz, mono), kunnen ze simpelweg achter elkaar geplakt worden met `new Blob([blobA, blobB, blobC], { type: 'audio/mpeg' })`.

### Frontend wijzigingen

#### 1. `AudioUploadComponent` (dumb component)
- `<input type="file" multiple>` toevoegen
- `selectedFiles = signal<File[]>([])` i.p.v. `selectedFile`
- `onFileSelected()` en `onDrop()`: alle bestanden accepteren
- Bestandenlijst met per-bestand verwijderknop en volgorde-pijltjes
- Bestanden sorteren op naam bij toevoegen
- `UploadRequestEvent` gebruikt `files: File[]`

#### 2. `AudioUploadPageComponent` (smart component)
- Bij meerdere bestanden: compress elk bestand sequentieel
- Progress: "Compressing file 2 of 3..."
- Na compressie: concateneer blobs
- Geconcateneerde blob door bestaande upload flow
- Bij 1 bestand: identiek gedrag aan huidige flow (geen regressie)

#### 3. `AudioCompleteProcessingService`
- Nieuwe publieke `uploadAndTranscribe()` methode (upload + transcriptie zonder compressie)
- Bestaande `startCompleteProcessing()` delegeert na compressie naar `uploadAndTranscribe()`

### Backend wijzigingen

Geen. De backend ontvangt gewoon een MP3-bestand.

## Files to Modify

| File | Change |
|------|--------|
| `src/app/audio/audio-upload.component.ts` | Multi-file selectie, bestandenlijst, volgorde-beheer |
| `src/app/audio/audio-upload-page.component.ts` | Sequentiele compressie, concatenatie, progress |
| `src/app/audio/services/audio-complete-processing.service.ts` | `uploadAndTranscribe()` extractie |

## Status

Code is geimplementeerd maar nog niet gecommit.
