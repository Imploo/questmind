# Dev Container Setup

This dev container is pre-configured with Angular CLI, Firebase CLI, Google Cloud SDK, and Claude CLI.

## Prerequisites for Auto-Login

To have Firebase CLI and Claude CLI automatically authenticated when you rebuild the container, you need to set up the following credentials:

### 1. Firebase Authentication

**Option A: Using Firebase CI Token (Recommended)**

1. Generate a Firebase CI token on your host machine:
   ```bash
   firebase login:ci
   ```

2. Copy the token that's displayed

3. Add it to your environment:
   - **macOS/Linux**: Add to `~/.zshrc` or `~/.bashrc`:
     ```bash
     export FIREBASE_TOKEN="your-token-here"
     ```
   - **Windows**: Set as system environment variable

4. Reload your shell or run:
   ```bash
   source ~/.zshrc  # or ~/.bashrc
   ```

**Option B: Using Google Cloud Credentials (for gcloud)**

Your host machine's gcloud credentials are **NOT** mounted to keep accounts separate. You can:
- Log in separately inside the container: `gcloud auth login`
- Or use a service account (see option below)

### 2. Claude CLI Authentication (Claude.ai Subscription)

1. Install Claude CLI on your **host machine** (if not already installed):
   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   ```

2. Log in with your Claude.ai subscription on your **host machine**:
   ```bash
   claude auth login
   ```
   This will open a browser window to authenticate with your claude.ai account.

3. Your session credentials are stored in `~/.claude/` and will be automatically mounted into the container.

**Note**: You only need to log in once on your host machine. The container will use your existing session.

### 3. Context7 API Key

1. Add your Context7 API key to your environment:
   - **macOS/Linux**: Add to `~/.zshrc` or `~/.bashrc`:
     ```bash
     export CONTEXT7_API_KEY="your-context7-api-key-here"
     ```

2. Reload your shell or run:
   ```bash
   source ~/.zshrc  # or ~/.bashrc
   ```

### 4. Service Account (Optional - for Firebase Admin SDK)

If you need Firebase Admin SDK authentication:

1. Download your service account key from Firebase Console:
   - Go to Project Settings → Service Accounts
   - Click "Generate new private key"

2. Save the JSON file as `.devcontainer/service-account.json`

3. **IMPORTANT**: This file is already in `.gitignore` - never commit it!

## Using GitHub Codespaces

If you're using GitHub Codespaces:

### Firebase Token
Set as a repository secret:
1. Go to your repository → Settings → Secrets and variables → Codespaces
2. Add `FIREBASE_TOKEN` secret

### Claude CLI
For Codespaces, you'll need to log in manually the first time:
```bash
claude auth login
```
Your session will persist in the Codespace's persistent storage.

## Verification

After rebuilding the container, verify authentication:

```bash
# Check Firebase authentication
firebase projects:list

# Check Google Cloud authentication
gcloud auth list

# Check Claude CLI
claude --version
```

## Aliases

The following aliases are automatically configured in the container:

### `claude-yolo`
Runs Claude CLI with `--dangerously-skip-permissions` flag, allowing all commands without prompting.

```bash
# Instead of:
claude --dangerously-skip-permissions

# Just use:
claude-yolo
```

**⚠️ Warning**: This bypasses all permission checks. Use with caution!

## Troubleshooting

### Firebase not authenticated
- Verify `FIREBASE_TOKEN` is set: `echo $FIREBASE_TOKEN`
- Regenerate token: `firebase login:ci`
- Try logging in manually: `firebase login --no-localhost`

### Claude CLI not working
- Check if you're logged in: `claude auth status`
- Login on host machine: `claude auth login`
- Verify mount exists in container: `ls -la ~/.claude`

### Google Cloud not authenticated
- Host credentials are NOT mounted (by design)
- Login inside the container: `gcloud auth login`
- Or use service account: Set up `service-account.json` and `GOOGLE_APPLICATION_CREDENTIALS`

## Security Notes

- **Never commit credentials to version control**
- The following files are in `.gitignore`:
  - `service-account.json`
  - `.env` files
- Use environment variables or secret management for sensitive data
- Rotate credentials regularly
- Revoke unused tokens/keys
