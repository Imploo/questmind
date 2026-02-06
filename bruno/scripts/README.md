# Bruno Test Scripts

## Generate Test Auth Token

Voor lokaal testen met de Firebase Emulator kun je een test auth token genereren:

```bash
node bruno/scripts/generate-test-token.js
```

Of met een specifieke user ID:

```bash
node bruno/scripts/generate-test-token.js my-test-user-123
```

Het script geeft een Bearer token die je kunt gebruiken in Bruno's Auth tab.

## Alternatief: Auth uitschakelen voor lokaal testen

Als je de auth check tijdelijk wilt uitschakelen voor lokaal testen, voeg dit toe aan het begin van je function handler:

```typescript
// Skip auth check in emulator
if (process.env.FUNCTIONS_EMULATOR === 'true') {
  // Create a fake auth context for testing
  request.auth = { uid: 'test-user-123' };
}
```

**Let op:** Vergeet niet deze code te verwijderen voor deployment!
