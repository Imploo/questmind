# Ticket #46: Background Fetch API for Persistent File Uploads (PWA)

- **Title:** Use Background Fetch API to Enable Persistent File Uploads in PWA
- **Created:** 2026-02-08
- **Status:** Done
- **Priority:** High
- **Effort:** 1-2 weeks
- **Dependencies:** None

---

## Description

Implement the [Background Fetch API](https://developer.chrome.com/docs/apis/background-fetch) so that audio file uploads continue running in the background on mobile devices, even when the user locks the screen, switches to another app, or closes the browser tab. This requires setting up the app as a PWA with a service worker, generating signed upload URLs on the backend, and having the service worker manage the upload lifecycle via Background Fetch.

Currently, uploads use `uploadBytesResumable` from the Firebase JS SDK directly in the browser tab. If the user navigates away or the screen turns off, the upload is interrupted and lost. For mobile users uploading large audio files (up to 500MB), this is a significant usability issue — sessions can take several minutes to upload over mobile networks.

---

## Expected Result

- Audio file uploads continue in the background when the user locks the screen, switches apps, or closes the tab
- The browser shows a native progress notification for the ongoing upload
- When the upload completes (in the background), the transcription pipeline is triggered automatically
- When the user returns to the app, the UI reflects the current upload/processing state
- Graceful fallback to the existing `uploadBytesResumable` flow on browsers that don't support Background Fetch (Safari, Firefox)
- The app is installable as a PWA on mobile devices

---

## Current Architecture

### Upload Flow (Today)

1. User selects audio file in `AudioUploadComponent`
2. `AudioCompleteProcessingService.startCompleteProcessing()` calls `AudioStorageService.uploadAudio()`
3. `uploadBytesResumable` uploads directly to Firebase Storage at `campaigns/{campaignId}/audio/{sessionId}/{fileName}`
4. Upload progress (0-90%) is tracked and emitted to the UI via callback
5. On completion, the storage URL is saved to Firestore and a Cloud Function (`transcribeAudioFast` or `transcribeAudioBatch`) is called
6. Real-time progress updates via Firestore `onSnapshot` in the `SessionProgressCardComponent`

### Key Files

| File | Role |
|------|------|
| `src/app/audio/audio-upload.component.ts` | Presentational upload UI (drag-drop, file selection) |
| `src/app/audio/audio-upload-page.component.ts` | Smart container orchestrating upload flow |
| `src/app/audio/services/audio-storage.service.ts` | Firebase Storage interaction (`uploadBytesResumable`) |
| `src/app/audio/services/audio-complete-processing.service.ts` | End-to-end processing orchestration |
| `src/app/audio/session-progress-card.component.ts` | Unified progress display |
| `src/app/audio/services/audio-session.models.ts` | `SessionProgress` interface |
| `functions/src/services/progress-tracker.service.ts` | Backend progress updates to Firestore |
| `functions/src/transcribe-audio-fast.ts` | Fast transcription Cloud Function |
| `functions/src/transcribe-audio-batch.ts` | Batch transcription Cloud Function |

### PWA Status (Today)

**Not configured.** The app currently has:
- No `ngsw-config.json`
- No `manifest.webmanifest`
- No `@angular/service-worker` dependency
- No service worker registration

---

## Technical Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Mobile Browser / PWA                                       │
│                                                             │
│  ┌─────────────────┐    ┌──────────────────────────────┐   │
│  │  Angular App     │    │  Service Worker               │   │
│  │                  │    │                                │   │
│  │  1. Select file  │───>│  2. backgroundFetch.fetch()   │   │
│  │                  │    │     PUT to signed URL          │   │
│  │  (can close tab) │    │     (continues in background)  │   │
│  │                  │    │                                │   │
│  │  5. UI updates   │<──│  4. Listen for completion      │   │
│  │     via Firestore│    │     Call finalize endpoint     │   │
│  └─────────────────┘    └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                               │ PUT file
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend (Cloud Functions + Cloud Storage)                    │
│                                                              │
│  3a. generateSignedUploadUrl  ──> Returns signed PUT URL     │
│  3b. File uploaded to GCS via signed URL                     │
│  4.  finalizeUpload           ──> Saves to Firestore,        │
│                                   triggers transcription     │
└──────────────────────────────────────────────────────────────┘
```

### Upload Approach: Signed URL + Service Worker

The Background Fetch API works with standard HTTP requests, not Firebase SDK calls. The approach:

1. **Client** calls a new Cloud Function `generateSignedUploadUrl` with the campaign ID, session ID, file name, and content type
2. **Cloud Function** uses the Cloud Storage Admin SDK to generate a **signed resumable upload URL** (v4 signed URL with `PUT` method) scoped to the exact storage path
3. **Client** hands the signed URL and file to the service worker, which initiates a `backgroundFetch.fetch()` with a PUT request
4. **Browser** manages the upload natively — survives screen lock, app switch, and tab close
5. On completion, the service worker calls a new Cloud Function `finalizeUpload` to:
   - Verify the file exists in Cloud Storage
   - Update the Firestore session document with the storage URL
   - Trigger the transcription pipeline
6. **Frontend** picks up the state change via existing Firestore `onSnapshot` listeners

### Fallback Strategy

Not all browsers support Background Fetch (notably Safari and Firefox). The implementation must detect support and fall back gracefully:

```typescript
if ('BackgroundFetchManager' in self) {
  // Use Background Fetch via service worker
} else {
  // Fall back to existing uploadBytesResumable flow
}
```

---

## Implementation Steps

### Phase 1: PWA Setup

#### 1.1 Add Angular Service Worker

```bash
ng add @angular/service-worker
```

This will:
- Add `@angular/service-worker` to `package.json`
- Create `ngsw-config.json`
- Update `angular.json` to include the service worker in production builds
- Register `ServiceWorkerModule` in the app

#### 1.2 Create Web App Manifest

Create `src/manifest.webmanifest` with:
- App name, short name, description
- Theme color, background color
- Display mode: `standalone`
- Icons (multiple sizes for homescreen/splash)
- Start URL
- Scope

Update `index.html` with:
- `<link rel="manifest" href="manifest.webmanifest">`
- `<meta name="theme-color">`
- Apple-specific meta tags for iOS

#### 1.3 Configure `ngsw-config.json`

Configure caching strategies for:
- App shell (index.html, JS/CSS bundles) — `installMode: prefetch`
- Assets (images, fonts) — `installMode: lazy`
- API calls — do NOT cache Firebase/Firestore calls
- Exclude audio files from caching (too large)

#### 1.4 Verify PWA Installation

- Test on Android Chrome that the "Add to Home Screen" prompt appears
- Verify the service worker registers correctly
- Confirm the app loads offline (at minimum, the shell)

---

### Phase 2: Backend — Signed URL Generation

#### 2.1 Create `generateSignedUploadUrl` Cloud Function

**Endpoint:** `POST /generateSignedUploadUrl`

**Request:**
```typescript
interface GenerateSignedUploadUrlRequest {
  campaignId: string;
  sessionId: string;
  fileName: string;
  contentType: string; // e.g., 'audio/mpeg'
  fileSizeBytes: number;
}
```

**Response:**
```typescript
interface GenerateSignedUploadUrlResponse {
  signedUrl: string;
  storagePath: string; // campaigns/{campaignId}/audio/{sessionId}/{fileName}
  expiresAt: string;   // ISO 8601 timestamp
}
```

**Implementation details:**
- Use `@google-cloud/storage` Admin SDK `file.getSignedUrl()` with:
  - `action: 'resumable'` for resumable uploads (required for large files)
  - `expires`: 2 hours (generous for slow connections)
  - `contentType` must match the file being uploaded
- Validate the user has access to the campaign (Firebase Auth + Firestore check)
- Validate file size (reject > 500MB)
- Validate content type (only allow audio MIME types)
- Create the Firestore session document with `progress.stage = 'uploading'` so the UI can track it immediately

#### 2.2 Create `finalizeUpload` Cloud Function

**Endpoint:** `POST /finalizeUpload`

**Request:**
```typescript
interface FinalizeUploadRequest {
  campaignId: string;
  sessionId: string;
  storagePath: string;
}
```

**Implementation details:**
- Verify the file exists at `storagePath` in Cloud Storage
- Verify file size matches what was declared
- Update Firestore session document:
  - Set `storageUrl` (`gs://` path)
  - Set `originalFileUrl` (download URL)
  - Update `progress.stage` to `'transcribing'`
- Trigger the transcription pipeline (call `transcribeAudioFast` or `transcribeAudioBatch` based on campaign settings)
- This function is called by the service worker after Background Fetch completes

---

### Phase 3: Service Worker — Background Fetch Integration

#### 3.1 Create Custom Service Worker Extension

Angular's `ngsw-worker.js` can be extended with a custom service worker. Create `src/custom-sw.js` (or TypeScript equivalent) that:

- Imports and delegates to `ngsw-worker.js` for standard PWA functionality
- Adds Background Fetch event handlers

**Key events to handle:**

```javascript
// Upload completed successfully
self.addEventListener('backgroundfetchsuccess', (event) => {
  // 1. Extract upload metadata from the fetch registration
  // 2. Call finalizeUpload Cloud Function
  // 3. Show notification: "Upload complete, transcription starting..."
});

// Upload failed
self.addEventListener('backgroundfetchfail', (event) => {
  // 1. Update Firestore progress to 'failed'
  // 2. Show notification: "Upload failed. Tap to retry."
});

// User aborted the upload
self.addEventListener('backgroundfetchabort', (event) => {
  // 1. Clean up Firestore session document
  // 2. Delete partial upload from Storage if applicable
});

// User tapped the browser's progress notification
self.addEventListener('backgroundfetchclick', (event) => {
  // Open the app to the session details page
  event.waitUntil(clients.openWindow(`/audio/sessions/${sessionId}`));
});
```

#### 3.2 Background Fetch Registration from Angular

Create a new service: `BackgroundUploadService`

```typescript
@Injectable({ providedIn: 'root' })
export class BackgroundUploadService {

  async startBackgroundUpload(
    file: File,
    signedUrl: string,
    sessionId: string,
    metadata: UploadMetadata
  ): Promise<BackgroundFetchRegistration | null> {
    const swReg = await navigator.serviceWorker.ready;

    if (!('backgroundFetch' in swReg)) {
      return null; // Fallback to regular upload
    }

    const request = new Request(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });

    return swReg.backgroundFetch.fetch(
      `upload-${sessionId}`,  // Unique ID for this fetch
      [request],
      {
        title: `Uploading ${file.name}`,
        icons: [{ src: '/assets/icons/upload-icon.png', sizes: '192x192' }],
        downloadTotal: file.size,
      }
    );
  }

  isSupported(): boolean {
    return 'serviceWorker' in navigator && 'BackgroundFetchManager' in self;
  }
}
```

#### 3.3 Progress Tracking for Background Uploads

The Background Fetch API provides a `progress` event on the registration:

```typescript
const registration = await this.startBackgroundUpload(file, signedUrl, sessionId, metadata);

if (registration) {
  registration.addEventListener('progress', () => {
    const progress = registration.downloaded / registration.downloadTotal * 100;
    // Update local UI if the app is still open
  });
}
```

When the app is in the background, the existing Firestore `onSnapshot` listeners will pick up the state when the user returns, since `finalizeUpload` updates the progress in Firestore.

---

### Phase 4: Frontend Integration

#### 4.1 Modify Upload Flow in `AudioCompleteProcessingService`

Update `startCompleteProcessing()` to:

1. Check if Background Fetch is supported (`BackgroundUploadService.isSupported()`)
2. **If supported:**
   - Call `generateSignedUploadUrl` Cloud Function
   - Pass the signed URL and file to `BackgroundUploadService.startBackgroundUpload()`
   - Show a toast/notification: "Upload will continue in the background"
   - Navigate to session details page (user doesn't need to stay on upload page)
3. **If not supported:**
   - Use existing `uploadBytesResumable` flow (no change)

#### 4.2 Update `SessionProgressCardComponent`

- Handle the `'uploading'` stage for background uploads (progress comes from Firestore, not local callback)
- Show informational message: "Upload continues in the background. You can close the app."
- Show a cancel button that calls `BackgroundFetchRegistration.abort()` if the registration is still active

#### 4.3 Update `AudioUploadPageComponent`

- After initiating a background upload, navigate away from the upload page
- Show a brief confirmation toast before navigation
- No need to keep the upload page open

---

### Phase 5: Testing & Edge Cases

#### 5.1 Test Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| Upload with screen on, app in foreground | Upload via Background Fetch, progress visible in-app |
| Screen turns off during upload | Upload continues, transcription triggers on completion |
| User switches to another app | Upload continues in background |
| User closes browser tab | Upload continues via service worker |
| User returns to app after upload completes | Session shows transcription in progress or completed |
| User returns to app during upload | Progress card shows current upload progress |
| Upload fails (network error) | `backgroundfetchfail` event fires, error shown when user returns |
| User cancels upload from browser notification | `backgroundfetchabort` event fires, session cleaned up |
| User taps browser progress notification | App opens to the session details page |
| Safari / Firefox user | Falls back to `uploadBytesResumable`, no change in behavior |
| Signed URL expires before upload finishes | Upload fails, user prompted to retry (URL valid for 2 hours) |
| Multiple concurrent uploads | Each gets its own Background Fetch registration with unique ID |

#### 5.2 Browser Compatibility

| Browser | Background Fetch | Fallback |
|---------|-----------------|----------|
| Chrome Android 74+ | Supported | - |
| Edge Android 79+ | Supported | - |
| Samsung Internet 11+ | Supported | - |
| Chrome Desktop 74+ | Supported | - |
| Safari (iOS/macOS) | Not supported | `uploadBytesResumable` |
| Firefox | Not supported | `uploadBytesResumable` |

> **Note:** Safari on iOS is the biggest gap. iOS PWA support is limited, and Background Fetch is not available. The fallback to `uploadBytesResumable` means iOS users must keep the app open during upload. This is an inherent platform limitation.

#### 5.3 Security Considerations

- Signed URLs are time-limited (2 hours) and scoped to a specific storage path
- `generateSignedUploadUrl` validates Firebase Auth token and campaign membership
- `finalizeUpload` verifies the file actually exists before triggering transcription
- Content-type validation prevents non-audio files from being uploaded
- File size validation on both client and server side

---

## Technical Details

### Background Fetch API Key Constraints

- **One active fetch per ID**: Use `upload-${sessionId}` as the ID so each session has its own fetch
- **Browser controls lifecycle**: The browser decides when to pause/resume based on network conditions
- **No access to response body in event handlers**: The `backgroundfetchsuccess` handler can read the response, but for uploads, we primarily care about the completion signal
- **Quota**: Browsers may limit the number of concurrent background fetches — handle quota errors gracefully
- **HTTPS required**: Already the case for Firebase Hosting

### Signed URL Details

- Use **V4 signing** for compatibility
- Method: `resumable` upload (required for files > 5MB)
- The signed URL is for Google Cloud Storage, which underlies Firebase Storage
- The storage bucket is the same one used by `uploadBytesResumable`
- Content-Type must be set in the signed URL AND in the PUT request headers

### Service Worker Strategy

Angular's `@angular/service-worker` generates `ngsw-worker.js`. To add Background Fetch handlers, use one of:

1. **Custom service worker that imports ngsw** (recommended):
   ```javascript
   importScripts('./ngsw-worker.js');
   // Add Background Fetch handlers below
   ```
2. **Separate service worker scope**: Register a second service worker for uploads only (more complex, not recommended)

Option 1 is simpler and keeps everything in one service worker registration.

---

## Out of Scope

- Offline-first file selection/queuing (user must be online to initiate the upload)
- Background sync for retrying failed uploads automatically (could be a follow-up)
- Caching audio playback files for offline listening
- iOS-specific workarounds (no Background Fetch support on iOS)

---

## References

- [Background Fetch API - Chrome Developers](https://developer.chrome.com/docs/apis/background-fetch)
- [Background Fetch API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Background_Fetch_API)
- [Angular Service Worker Introduction](https://angular.dev/ecosystem/service-workers)
- [Cloud Storage Signed URLs](https://cloud.google.com/storage/docs/access-control/signed-urls)
- [Resumable Uploads with Signed URLs](https://cloud.google.com/storage/docs/resumable-uploads)
