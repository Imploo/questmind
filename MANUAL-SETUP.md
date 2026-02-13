# Manual Setup Steps

Steps that require manual action outside of the codebase.

---

## Azure AI Foundry — characterChat

After deploying the `characterChat` Firebase function, set the following secrets:

```bash
firebase functions:secrets:set AZURE_FOUNDRY_API_KEY
firebase functions:secrets:set AZURE_FOUNDRY_ENDPOINT
```

- **`AZURE_FOUNDRY_API_KEY`** — API key from your Azure AI Foundry project.
  Found in: Azure Portal → AI Foundry project → Settings → Keys and Endpoint

- **`AZURE_FOUNDRY_ENDPOINT`** — The inference endpoint URL.
  Format: `https://<your-project>.inference.ai.azure.com`
  Found in: Azure Portal → AI Foundry project → Settings → Keys and Endpoint

> The old `CLAUDE_API_KEY` secret is no longer used by `characterChat` and can be removed from Firebase if no other functions reference it.

---

## Firebase Secret Management

### List current secrets
```bash
firebase functions:secrets:access <SECRET_NAME>
```

### Remove an old secret
```bash
firebase functions:secrets:destroy CLAUDE_API_KEY
```
