# CORS Configuration for Firebase Storage

## Overview

This document explains the CORS (Cross-Origin Resource Sharing) configuration for Firebase Storage and how to fix CORS errors in development and production.

## The Problem

When accessing Firebase Storage files from a web application running on a different origin (e.g., `localhost:4200` accessing `firebasestorage.googleapis.com`), browsers enforce CORS policies. Without proper configuration, these requests will be blocked with errors like:

```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...' from origin 'http://localhost:4200'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Solution: Configure CORS on Firebase Storage Bucket

The application uses the Firebase Storage SDK's `getBlob()` method which handles authentication automatically, but CORS configuration is still required on the storage bucket to allow browser requests from your application's origin.

### Quick Fix

If you're seeing CORS errors in development:

1. **Authenticate with Google Cloud:**

   ```bash
   gcloud auth login
   gcloud config set project questmind-dnd
   ```

2. **Apply CORS configuration:**

   ```bash
   gsutil cors set cors.json gs://questmind-dnd.firebasestorage.app
   ```

3. **Verify:**

   ```bash
   gsutil cors get gs://questmind-dnd.firebasestorage.app
   ```

4. **Clear browser cache and test**

See `CORS_QUICKFIX.md` for detailed step-by-step instructions.

### CORS Configuration File

The `cors.json` file in the project root contains the CORS configuration:

```json
[
  {
    "origin": [
      "http://localhost:4200",
      "https://questmind-dnd.web.app",
      "https://questmind-dnd.firebaseapp.com"
    ],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Authorization", "x-goog-resumable"],
    "maxAgeSeconds": 3600
  }
]
```

## Code Implementation

The `downloadAudioFile` method in `audio-session.service.ts` uses Firebase Storage SDK to avoid manual CORS handling:

```typescript
import { getBlob } from 'firebase/storage';

async downloadAudioFile(storageMetadata: StorageMetadata): Promise<File> {
  try {
    // Use Firebase Storage SDK instead of fetch to avoid manual CORS handling
    if (!this.storage) {
      throw new Error('Firebase Storage not initialized');
    }
    const storageRef = ref(this.storage, storageMetadata.storagePath);
    const blob = await getBlob(storageRef);
    const fileName = this.getFileNameFromPath(storageMetadata.storagePath);
    return new File([blob], fileName, {
      type: storageMetadata.contentType || blob.type || 'audio/mpeg'
    });
  } catch (error) {
    console.error('Failed to download audio from storage:', error);
    throw new Error('Failed to download audio from storage.');
  }
}
```

### Benefits of Using Firebase SDK

1. **Automatic authentication**: Firebase SDK includes auth tokens automatically
2. **Better error handling**: Firebase SDK provides detailed error messages
3. **Cleaner code**: Uses official SDK instead of raw fetch
4. **BUT CORS still required**: Browsers enforce CORS on all cross-origin XMLHttpRequests

## Applying CORS Configuration

### Prerequisites

- Google Cloud SDK installed (`gcloud` and `gsutil` commands)
- Authenticated with Google Cloud (`gcloud auth login`)
- Appropriate permissions on the Firebase Storage bucket

### Using the Automated Script

```bash
./apply-cors.sh
```

This script will guide you through the process with confirmations and verification.

### Manual Application

```bash
# Apply CORS configuration
gsutil cors set cors.json gs://questmind-dnd.firebasestorage.app

# Verify it was applied
gsutil cors get gs://questmind-dnd.firebasestorage.app
```

## Production Deployment

For production deployments, add production URLs to the `origin` array in `cors.json`:

```json
{
  "origin": [
    "http://localhost:4200",
    "https://questmind-dnd.web.app",
    "https://questmind-dnd.firebaseapp.com",
    "https://yourdomain.com"
  ],
  ...
}
```

Then reapply the configuration:

```bash
gsutil cors set cors.json gs://questmind-dnd.firebasestorage.app
```

## Common Issues

### Permission Denied

**Error:**

```
AccessDeniedException: 403 ... does not have storage.buckets.update permission
```

**Solution:**

- Ensure you're authenticated with the correct Google account
- Request "Storage Admin" role from the project owner
- Or ask the project owner to apply the CORS configuration

### CORS Errors Persist

If CORS errors continue after applying configuration:

1. **Clear browser cache**: Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
2. **Try incognito mode**: Rule out caching issues
3. **Verify configuration**: `gsutil cors get gs://questmind-dnd.firebasestorage.app`
4. **Check port**: Ensure you're running on `localhost:4200`
5. **Restart dev server**: Some changes require a server restart

### Anonymous Caller Error

**Error:**

```
Anonymous caller does not have storage.buckets.get access
```

**Solution:**

```bash
gcloud auth login
gcloud config set project questmind-dnd
```

## Security Considerations

### CORS vs Storage Rules

Both are needed for complete security:

**CORS (this configuration):**

- Controls which **websites** can make requests
- Browser-level security
- Required for web applications

**Storage Rules (`storage.rules`):**

- Controls which **users** can access files
- Server-level security
- Required for user data protection

### Best Practices

1. **Specific origins only**: Don't use wildcards (`*`) in production
2. **HTTPS in production**: Only use `https://` for production origins
3. **Keep Storage Rules strict**: Always require authentication
4. **Monitor access**: Use Firebase Console to monitor usage

## References

- [Firebase Storage SDK Documentation](https://firebase.google.com/docs/storage/web/download-files)
- [Google Cloud Storage CORS Configuration](https://cloud.google.com/storage/docs/cross-origin)
- [CORS on MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
