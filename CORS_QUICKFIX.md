# Quick Fix: CORS Error in Development

## TL;DR - The Fix

Your Firebase Storage bucket needs CORS configuration to allow localhost access. Here's how to fix it:

### Quick Steps

1. **Authenticate with Google Cloud:**

   ```bash
   gcloud auth login
   gcloud config set project questmind-dnd
   ```

2. **Apply CORS configuration:**

   ```bash
   gsutil cors set cors.json gs://questmind-dnd.firebasestorage.app
   ```

3. **Verify it worked:**

   ```bash
   gsutil cors get gs://questmind-dnd.firebasestorage.app
   ```

4. **Clear browser cache and test**

---

## Detailed Instructions

### Step 1: Install Google Cloud SDK (if needed)

Check if you have `gcloud` installed:

```bash
gcloud --version
```

If not installed:

- **macOS**: `brew install google-cloud-sdk`
- **Windows/Linux**: [Download installer](https://cloud.google.com/sdk/docs/install)

### Step 2: Authenticate

```bash
# Login with your Google account (the one with Firebase access)
gcloud auth login

# This will open a browser window for you to login
# Use the account that has access to the questmind-dnd Firebase project
```

### Step 3: Set Your Project

```bash
gcloud config set project questmind-dnd
```

### Step 4: Apply CORS Configuration

From the project root directory:

```bash
gsutil cors set cors.json gs://questmind-dnd.firebasestorage.app
```

Expected output:

```
Setting CORS on gs://questmind-dnd.firebasestorage.app/...
```

### Step 5: Verify

```bash
gsutil cors get gs://questmind-dnd.firebasestorage.app
```

You should see the CORS configuration with `localhost:4200` in the origins list.

### Step 6: Test

1. Clear your browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)
2. Restart your development server
3. Try downloading/retranscribing audio again
4. CORS error should be gone! ✅

---

## Troubleshooting

### "Permission denied" error

If you see:

```
AccessDeniedException: 403 ... does not have storage.buckets.update permission
```

**Solution:**

- Make sure you're logged in with the correct Google account
- Ask the Firebase project owner to grant you "Storage Admin" role
- Or ask them to run the command for you

### CORS error still appears

1. **Hard refresh** your browser: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. **Try incognito mode** to rule out caching issues
3. **Check you're running on port 4200**: `http://localhost:4200`
4. **Verify CORS was applied**: `gsutil cors get gs://questmind-dnd.firebasestorage.app`

### "gsutil not found"

Install the Google Cloud SDK:

- macOS: `brew install google-cloud-sdk`
- Others: https://cloud.google.com/sdk/docs/install

---

## What's in cors.json?

The file allows these origins to access Firebase Storage:

- `http://localhost:4200` - Your development server
- `https://questmind-dnd.web.app` - Production Firebase Hosting
- `https://questmind-dnd.firebaseapp.com` - Production Firebase Hosting (alternative)

---

## Why Is This Needed?

Even though your code uses the Firebase Storage SDK, browsers enforce CORS on all cross-origin requests. Your app runs on `localhost:4200`, but Firebase Storage is on `firebasestorage.googleapis.com` - different origin!

The CORS configuration tells Firebase Storage: "It's okay to respond to requests from these origins."

---

## Need Help?

If you're stuck:

1. Check you're authenticated: `gcloud auth list`
2. Check your project: `gcloud config get-value project`
3. Verify you have the right permissions in Firebase Console

For more details, see `.docs/CORS_FIX.md`
