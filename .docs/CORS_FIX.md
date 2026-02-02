# Fixing Firebase Storage CORS Issues

## The Problem

When trying to download audio files from Firebase Storage in development mode (`localhost:4200`), you're getting a CORS error:

```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...' from origin 'http://localhost:4200'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

This happens even though the code uses Firebase Storage SDK's `getBlob()` method, because the underlying XMLHttpRequest still requires proper CORS headers from the Firebase Storage bucket.

## The Solution

You need to configure CORS on your Firebase Storage bucket to allow requests from your development origin (`localhost:4200`) and production domains.

### Step 1: Authenticate with Google Cloud

First, make sure you're authenticated with the Google Cloud SDK:

```bash
# Install gcloud CLI if not already installed
# macOS: brew install google-cloud-sdk
# Linux/Windows: See https://cloud.google.com/sdk/docs/install

# Login to your Google account
gcloud auth login

# Set your project
gcloud config set project questmind-dnd
```

### Step 2: Apply CORS Configuration

#### Option A: Using the Provided Script (Recommended)

Run the automated script from the project root:

```bash
./apply-cors.sh
```

This script will:

- Check if you're authenticated
- Show the current CORS configuration
- Show the new configuration to be applied
- Ask for confirmation
- Apply the configuration
- Verify the configuration was applied successfully

#### Option B: Manual Application

Apply the CORS configuration manually:

```bash
gsutil cors set cors.json gs://questmind-dnd.firebasestorage.app
```

Verify it was applied:

```bash
gsutil cors get gs://questmind-dnd.firebasestorage.app
```

### Step 3: Verify the Fix

1. Restart your development server if it's running
2. Clear your browser cache (or open in incognito mode)
3. Try downloading/retranscribing an audio file
4. The CORS error should be gone

## CORS Configuration Explained

The `cors.json` file configures which origins can access your Firebase Storage bucket:

```json
[
  {
    "origin": [
      "http://localhost:4200", // Development
      "https://questmind-dnd.web.app", // Firebase Hosting
      "https://questmind-dnd.firebaseapp.com" // Firebase Hosting (alternative)
    ],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Authorization", "x-goog-resumable"],
    "maxAgeSeconds": 3600 // Cache preflight requests for 1 hour
  }
]
```

### What Each Field Does

- **`origin`**: List of allowed origins (must match exactly, including protocol and port)
- **`method`**: HTTP methods allowed from these origins
- **`responseHeader`**: Headers the server will include in responses
- **`maxAgeSeconds`**: How long browsers can cache the CORS preflight response

## Common Issues

### Permission Denied

If you get a permission error:

```
AccessDeniedException: 403 ... does not have storage.buckets.update permission
```

You need to:

1. Make sure you're authenticated as the correct account
2. Have the "Storage Admin" role or be the project owner
3. Ask the project owner to grant you the necessary permissions

### CORS Still Not Working

If CORS errors persist after applying configuration:

1. **Clear browser cache**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
2. **Check browser**: Try incognito mode or a different browser
3. **Verify configuration**: Run `gsutil cors get gs://questmind-dnd.firebasestorage.app`
4. **Check Firebase SDK**: Make sure you're using `getBlob()` from Firebase Storage SDK, not raw `fetch()`
5. **Check auth**: Make sure the user is authenticated before downloading

### Adding New Origins

If you deploy to a custom domain, add it to `cors.json`:

```json
{
  "origin": [
    "http://localhost:4200",
    "https://questmind-dnd.web.app",
    "https://questmind-dnd.firebaseapp.com",
    "https://yourdomain.com"  // Add your custom domain
  ],
  ...
}
```

Then reapply the configuration with `./apply-cors.sh`.

## Security Considerations

### CORS vs Storage Rules

**CORS** (this configuration):

- Controls which **websites** can make requests
- Browser-level security
- Required for web applications

**Storage Rules** (`storage.rules`):

- Controls which **users** can access files
- Server-level security
- Required for user data protection

Both are needed! CORS allows the website to make requests, but Storage Rules still enforce user authentication and authorization.

### Production Best Practices

1. **Only allow necessary origins**: Don't use wildcards like `*` in production
2. **Keep Storage Rules strict**: Always require authentication
3. **Use HTTPS**: Always use `https://` in production origins
4. **Monitor access**: Use Firebase Console to monitor storage usage and access patterns

## Why Firebase SDK Still Needs CORS

Even though we're using the Firebase Storage SDK (`getBlob()`), CORS is still needed because:

1. The SDK makes XMLHttpRequest/fetch calls under the hood
2. Browsers enforce CORS on all cross-origin requests
3. Firebase Storage is hosted on a different origin (`firebasestorage.googleapis.com`)
4. The bucket needs to explicitly allow your website's origin

The Firebase SDK helps by:

- Automatically adding authentication tokens
- Handling retries and errors
- Providing a cleaner API

But it can't bypass browser CORS requirements.

## References

- [Google Cloud Storage CORS Configuration](https://cloud.google.com/storage/docs/cross-origin)
- [Firebase Storage Download Files](https://firebase.google.com/docs/storage/web/download-files)
- [CORS on MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
