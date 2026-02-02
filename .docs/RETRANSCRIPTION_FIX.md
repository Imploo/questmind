# Retranscription Fix - Google AI File API Integration

## Problem

When retranscribing existing audio files from Firebase Storage, the Gemini API would return `NO_AUDIO_DETECTED` errors, even though the same file worked perfectly during the initial upload and transcription.

### Root Cause

The code was using `fileData.fileUri` with a Firebase Storage download URL:

```typescript
contents = {
  parts: [
    { fileData: { fileUri: storageMetadata.downloadUrl, mimeType } },
    { text: this.TRANSCRIPTION_PROMPT },
  ],
};
```

**This doesn't work** because:

- `fileData.fileUri` expects a Google AI File API URI (format: `files/...`)
- Firebase Storage download URLs are standard HTTPS URLs
- The Gemini API cannot directly access Firebase Storage URLs via `fileData.fileUri`

## Solution

Implemented proper Google AI File API integration:

### 1. Upload to Google AI File API

For large files (>18MB) or retranscriptions without the File object:

1. Fetch the audio from Firebase Storage
2. Upload it to Google AI File API using `ai.files.upload()`
3. Use the returned File API URI in the transcription request

### 2. Code Changes

```typescript
// For large files or retranscriptions, upload to Google AI File API first
const fileUri = await this.uploadToFileApi(storageMetadata.downloadUrl, mimeType, file);

contents = {
  parts: [{ fileData: { fileUri, mimeType } }, { text: this.TRANSCRIPTION_PROMPT }],
};
```

### 3. New Helper Method

```typescript
private async uploadToFileApi(downloadUrl: string, mimeType: string, file?: File): Promise<string> {
  if (file) {
    // Direct upload from File object (initial transcription)
    const uploadResult = await this.ai.files.upload({ file, config: { mimeType, displayName: file.name } });
    return uploadResult.uri;
  }

  // Fetch from Firebase Storage and upload (retranscription)
  const audioBlob = await this.fetchAudioFromUrl(downloadUrl);
  const audioFile = new File([audioBlob], fileName, { type: mimeType });
  const uploadResult = await this.ai.files.upload({ file: audioFile, config: { mimeType, displayName: fileName } });
  return uploadResult.uri;
}
```

## Behavior Now

### Initial Upload (with File object)

1. User uploads 300MB audio file
2. File is uploaded to Firebase Storage
3. For transcription: File is uploaded to Google AI File API
4. Gemini receives proper File API URI and transcribes successfully

### Retranscription (without File object)

1. User clicks "Retranscribe" on existing session
2. Audio is fetched from Firebase Storage download URL
3. Audio is uploaded to Google AI File API
4. Gemini receives proper File API URI and transcribes successfully

## Benefits

1. **Works for all file sizes**: Small files (<18MB) still use inline data, large files use File API
2. **Consistent behavior**: Both initial and retranscription follow the same path for large files
3. **Proper API usage**: Uses Google AI File API as intended
4. **Better logging**: Added detailed console logs to track the upload process

## Testing

To verify the fix:

1. Upload a large audio file (>18MB)
2. Wait for initial transcription to complete
3. Click "Retranscribe" button
4. Console should show:
   - "📁 File is large (X bytes). Uploading to Google AI File API..."
   - "📝 Has File object: false"
   - "⬇️ Fetching audio from Firebase Storage..."
   - "✅ Fetched X bytes in Xs"
   - "⬆️ Uploading to Google AI File API..."
   - "✅ Upload complete in Xs. File URI: files/..."
   - Successful transcription

## References

- Google AI File API: https://ai.google.dev/gemini-api/docs/file-api
- Gemini API - Audio: https://ai.google.dev/gemini-api/docs/audio
