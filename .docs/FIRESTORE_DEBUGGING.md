# Firestore Debugging Guide

> How to query and debug Firestore documents in the QuestMind project

## Quick Start

### Query a Firestore Document

```bash
# Set project (check .firebaserc for project ID)
gcloud config set project questmind-dnd

# Query a specific document
TOKEN=$(gcloud auth print-access-token 2>/dev/null) && \
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://firestore.googleapis.com/v1/projects/questmind-dnd/databases/(default)/documents/campaigns/CAMPAIGN_ID/audioSessions/SESSION_ID" | jq '.'
```

### Extract Specific Fields

```bash
TOKEN=$(gcloud auth print-access-token 2>/dev/null) && \
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://firestore.googleapis.com/v1/projects/questmind-dnd/databases/(default)/documents/campaigns/CAMPAIGN_ID/audioSessions/SESSION_ID" | \
jq '{
  retranscribeStatus: .fields.retranscribeStatus.stringValue,
  retranscribeProgress: .fields.retranscribeProgress.integerValue,
  retranscribeError: .fields.retranscribeError.stringValue,
  retranscribeMessage: .fields.retranscribeMessage.stringValue
}'
```

## Firestore Document Structure

### Audio Sessions
Path: `campaigns/{campaignId}/audioSessions/{sessionId}`

Key fields for debugging:
```typescript
{
  // Overall status
  status: 'uploading' | 'processing' | 'completed' | 'failed',

  // Retranscription tracking
  retranscribeStatus: 'loading_context' | 'transcribing' | 'transcription_complete' | 'generating_story' | 'story_complete' | 'completed' | 'failed',
  retranscribeProgress: number,  // 0-100
  retranscribeMessage: string,
  retranscribeError?: string,
  retranscribeStartedAt?: string,
  retranscribeCompletedAt?: string,

  // Complete processing tracking
  completeProcessingStatus: 'idle' | 'loading_context' | 'transcribing' | 'generating_story' | 'generating_script' | 'generating_audio' | 'uploading' | 'completed' | 'failed',
  completeProcessingProgress: number,
  completeProcessingMessage: string,
  completeProcessingError?: string,

  // Audio file
  storageUrl: string,
  audioFileName: string,
  audioFileSize: number,

  // Results
  transcription?: object,
  content?: string,  // Generated story
  podcasts?: Array<object>
}
```

### AI Settings
Path: `settings/ai`

```typescript
{
  defaultModel: string,
  availableModels: string[],
  features: {
    transcription: {
      model: string,
      temperature: number,
      maxOutputTokens: number
    },
    storyGeneration: { ... },
    podcastScript: { ... }
  }
}
```

## Common Debugging Scenarios

### 1. Check Why Retranscription Failed

```bash
CAMPAIGN_ID="HCnVl9OLSjTIdg38mHQj"
SESSION_ID="a57f1f58-6217-4b11-b12a-5830b55c9469"

TOKEN=$(gcloud auth print-access-token 2>/dev/null) && \
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://firestore.googleapis.com/v1/projects/questmind-dnd/databases/(default)/documents/campaigns/$CAMPAIGN_ID/audioSessions/$SESSION_ID" | \
jq -r '.fields | {
  status: .retranscribeStatus.stringValue,
  progress: .retranscribeProgress.integerValue,
  message: .retranscribeMessage.stringValue,
  error: .retranscribeError.stringValue // .stringValue,
  startedAt: .retranscribeStartedAt.stringValue
}'
```

### 2. Check AI Model Configuration

```bash
TOKEN=$(gcloud auth print-access-token 2>/dev/null) && \
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://firestore.googleapis.com/v1/projects/questmind-dnd/databases/(default)/documents/settings/ai" | \
jq '.fields.features.mapValue.fields.transcription.mapValue.fields.model.stringValue'
```

### 3. Verify Audio File Exists and Size

```bash
# Extract storage URL from session document
STORAGE_URL=$(TOKEN=$(gcloud auth print-access-token 2>/dev/null) && \
  curl -s -H "Authorization: Bearer $TOKEN" \
  "https://firestore.googleapis.com/v1/projects/questmind-dnd/databases/(default)/documents/campaigns/$CAMPAIGN_ID/audioSessions/$SESSION_ID" | \
  jq -r '.fields.storageUrl.stringValue')

# Check file size
curl -sI "$STORAGE_URL" | grep -i content-length
```

## Cloud Function Logs

### View Recent Logs

```bash
# Retranscribe function
gcloud functions logs read retranscribeAudio --region=europe-west4 --limit=50

# Process audio function
gcloud functions logs read processAudioSession --region=europe-west4 --limit=50

# Errors only
gcloud functions logs read retranscribeAudio --region=europe-west4 --limit=50 --min-log-level=error
```

### Cloud Run Detailed Logs

```bash
# All logs for specific time range
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="retranscribeaudio" AND timestamp>="2026-02-05T09:00:00Z"' --limit=50

# Format as readable table
gcloud logging read 'resource.type="cloud_run_revision" AND httpRequest.requestMethod="POST"' --limit=20 --format='table(timestamp,httpRequest.status,httpRequest.latency)'
```

## Understanding Firestore REST API Response

Firestore REST API wraps values in type objects:

**Response Format:**
```json
{
  "fields": {
    "retranscribeStatus": {
      "stringValue": "transcribing"
    },
    "retranscribeProgress": {
      "integerValue": "5"
    },
    "retranscribeError": {
      "nullValue": null
    },
    "modelsUsed": {
      "mapValue": {
        "fields": { ... }
      }
    }
  }
}
```

**Type Wrappers:**
- `stringValue`: String
- `integerValue`: Integer (as string)
- `doubleValue`: Float
- `booleanValue`: Boolean
- `nullValue`: null
- `mapValue`: Object/Map
- `arrayValue`: Array
- `timestampValue`: ISO timestamp

## Troubleshooting

### Permission Denied Errors

```bash
# Check current project
gcloud config get-value project

# Should return: questmind-dnd (from .firebaserc)

# If wrong, set it:
gcloud config set project questmind-dnd

# Verify authentication
gcloud auth list
```

### No Gcloud Authentication

```bash
# Login to gcloud
gcloud auth login

# Or for application default credentials (for scripts)
gcloud auth application-default login
```

### Firebase CLI Limitations

The Firebase CLI does **not** support document queries. Available commands:
- `firebase firestore:delete` - Delete documents/collections
- `firebase firestore:indexes` - Manage indexes
- `firebase firestore:databases:get` - Database info

For queries, use gcloud REST API or Firebase Admin SDK.

## Alternative: Node.js Script

Create `functions/debug-query.cjs`:

```javascript
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
  projectId: 'questmind-dnd'
});

const db = getFirestore();

async function querySession(campaignId, sessionId) {
  const doc = await db.doc(`campaigns/${campaignId}/audioSessions/${sessionId}`).get();

  if (!doc.exists) {
    console.log('Document not found');
    return;
  }

  const data = doc.data();

  console.log('=== RETRANSCRIPTION STATUS ===');
  console.log('Status:', data.retranscribeStatus);
  console.log('Progress:', data.retranscribeProgress);
  console.log('Message:', data.retranscribeMessage);
  console.log('Error:', data.retranscribeError);

  console.log('\n=== FULL DOCUMENT ===');
  console.log(JSON.stringify(data, null, 2));
}

// Usage: node debug-query.cjs CAMPAIGN_ID SESSION_ID
querySession(process.argv[2], process.argv[3])
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
```

Run:
```bash
cd functions
node debug-query.cjs HCnVl9OLSjTIdg38mHQj a57f1f58-6217-4b11-b12a-5830b55c9469
```

## Project-Specific Notes

### Fire-and-Forget Pattern
Cloud Functions `retranscribeAudio` and `processAudioSession` use fire-and-forget:
1. Client calls function
2. Function returns 200 immediately
3. Background processing continues
4. Progress updates written to Firestore
5. Client listens via `onSnapshot()`

**Implication:** If background processing crashes, HTTP status is still 200. Check Firestore document for actual status.

### Temporary Storage
- Cloud Functions use `/tmp` for audio files
- `/tmp` is in-memory (tmpfs), part of function's memory allocation
- Files auto-deleted when instance terminates
- No Cloud Storage billing for temp files

### Common Failure Patterns

1. **Stuck at "Downloading audio file..."**
   - Large file (>100MB) causing memory issues
   - Fixed: Use streaming downloads instead of `arrayBuffer()`

2. **Model name errors**
   - `gemini-3-flash` vs `gemini-3-flash-preview`
   - Check `settings/ai` document for valid model names

3. **No error logged but status = "failed"**
   - Container killed (OOM) before catch block runs
   - Check Cloud Run logs for termination events
