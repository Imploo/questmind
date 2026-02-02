# Audio Transcription Validation & Error Handling

## Problem

The LLM (Gemini 2.5 Flash) was hallucinating transcriptions when it couldn't access audio files properly, returning completely made-up content instead of reporting that no audio was detected.

## Root Causes

1. **No explicit instructions** to handle missing/inaccessible audio
2. **No validation** of transcription responses
3. **No error reporting** when audio can't be accessed
4. **Generic error messages** that didn't help diagnose the issue

## Solution

### 1. Updated Transcription Prompt

Added explicit instructions to the LLM to handle edge cases:

```typescript
CRITICAL: You MUST actually listen to and process the provided audio file.
DO NOT generate fictional content if you cannot access or hear the audio.

REQUIREMENTS:
- If you cannot access the audio file or detect any speech, return:
  { "error": "NO_AUDIO_DETECTED", "message": "No speech detected in audio file" }
- If the audio is corrupted or unreadable, return:
  { "error": "AUDIO_CORRUPTED", "message": "Audio file is corrupted or unreadable" }
- If you successfully hear audio, transcribe ONLY what you actually hear
```

### 2. Enhanced Response Schema

Updated the JSON schema to support error responses:

```typescript
private readonly TRANSCRIPTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    error: { type: Type.STRING },        // NEW: Error code
    message: { type: Type.STRING },      // NEW: Error message
    summary: { type: Type.STRING },
    segments: { /* ... */ }
  }
  // Note: No required fields, allowing flexible error responses
};
```

### 3. Response Validation

Added comprehensive validation in `requestTranscription()`:

```typescript
// 1. Check for LLM-reported errors
if (result.error) {
  throw new Error(result.message || 'Audio processing failed');
}

// 2. Validate segments exist and are an array
if (!result.segments || !Array.isArray(result.segments)) {
  throw new Error(
    'No valid transcription segments returned. The audio may be empty or inaccessible.'
  );
}

// 3. Check for empty segments
if (result.segments.length === 0) {
  throw new Error('No speech detected in the audio file.');
}

// 4. Validate segments have actual content
const hasContent = result.segments.some(
  (seg) => seg.text && typeof seg.text === 'string' && seg.text.trim().length > 0
);

if (!hasContent) {
  throw new Error('No valid speech content found in the audio file.');
}
```

### 4. Pre-flight Validation

Added validation before sending request:

```typescript
// Validate that we have either a file or a valid storage URL
if (!file && !storageMetadata.downloadUrl) {
  return throwError(() => ({
    status: 400,
    message: 'No audio source available. Missing both file and storage URL.',
  }));
}

// In requestTranscription, check URL exists
if (!storageMetadata.downloadUrl) {
  throw new Error('No download URL available in storage metadata. Cannot transcribe audio.');
}
```

### 5. Enhanced Error Messages

Updated `handleTranscriptionError()` to provide specific, actionable messages:

```typescript
if (msg.includes('no speech detected') || msg.includes('no audio detected')) {
  errorMessage =
    'No speech detected in the audio file. Please verify the file contains audio content.';
  status = 400;
} else if (msg.includes('corrupted') || msg.includes('unreadable')) {
  errorMessage =
    'The audio file appears to be corrupted or unreadable. Please try uploading it again.';
  status = 400;
} else if (msg.includes('inaccessible') || msg.includes('empty')) {
  errorMessage = 'Unable to access the audio file. It may be empty or the download link expired.';
  status = 400;
} else if (msg.includes('no valid speech content')) {
  errorMessage = 'No valid speech content found. The audio may contain only silence or noise.';
  status = 400;
}
```

### 6. Debug Logging

Added console logging to help diagnose issues:

```typescript
console.log('Using Firebase Storage URL:', storageMetadata.downloadUrl?.substring(0, 100) + '...');
console.log('File size:', storageMetadata.fileSize, 'bytes, MIME type:', mimeType);
console.log('Sending transcription request to Gemini API...');
console.log(
  'Transcription response received. Has error:',
  !!result.error,
  'Segments:',
  result.segments?.length || 0
);
```

## Error Flow

### Before:

```
User uploads file → File inaccessible → LLM hallucinates → User sees fake transcription 😱
```

### After:

```
User uploads file → File inaccessible → LLM reports error OR validation catches it → User sees clear error message 👍
```

## Possible Error Scenarios

| Scenario           | Detection                     | Error Message                                          |
| ------------------ | ----------------------------- | ------------------------------------------------------ |
| No audio in file   | LLM detects + validation      | "No speech detected in the audio file"                 |
| Corrupted file     | LLM detects                   | "The audio file appears to be corrupted or unreadable" |
| URL inaccessible   | LLM can't access + validation | "Unable to access the audio file"                      |
| Empty segments     | Validation                    | "No valid speech content found"                        |
| Missing URL        | Pre-flight check              | "No audio source available"                            |
| Only silence/noise | LLM + validation              | "No valid speech content found"                        |

## Testing Recommendations

### 1. Test with No Audio

Upload a file with no audio/silence:

- **Expected**: "No speech detected in the audio file"
- **Actual before fix**: Hallucinated transcription
- **Actual after fix**: Clear error message

### 2. Test with Corrupted File

Upload a corrupted audio file:

- **Expected**: "The audio file appears to be corrupted or unreadable"

### 3. Test with Expired URL

Force URL expiration or use invalid URL:

- **Expected**: "Unable to access the audio file"

### 4. Test with Valid Audio

Upload normal D&D session audio:

- **Expected**: Valid transcription with segments

### 5. Check Console Logs

Monitor browser console for debug information:

```
Using Firebase Storage URL: https://firebasestorage.googleapis.com/v0/b/...
File size: 45678901 bytes, MIME type: audio/mpeg
Sending transcription request to Gemini API...
Transcription response received. Has error: false Segments: 127
Transcription validation passed. Total segments: 127
```

## User-Facing Error Messages

All error messages are now user-friendly and actionable:

✅ **Good**: "No speech detected in the audio file. Please verify the file contains audio content."

❌ **Bad (old)**: "Failed to transcribe the audio."

## Additional Improvements

### Retry Logic

The existing retry logic (with exponential backoff) will NOT retry when:

- Audio is truly inaccessible (400 errors)
- No speech is detected
- File is corrupted

It WILL retry when:

- Model is overloaded (503 errors)
- Network issues (transient failures)

### Status Codes

- `400`: Client error (bad audio, no content, etc.)
- `401`: API key issues
- `503`: Service overloaded (retryable)
- `500`: Generic server error

## Future Enhancements

1. **URL Pre-validation**: Test URL accessibility before sending to Gemini
2. **Audio Duration Check**: Warn if audio is suspiciously short
3. **File Format Validation**: Verify MIME type matches actual file format
4. **Signed URLs**: Use time-limited signed URLs for security
5. **Better Logging**: Structured logging with error tracking
