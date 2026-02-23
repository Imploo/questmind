# Create Centralized Error Handler Utility

**Priority:** LOW
**Estimated Effort:** 4-6 hours
**Status:** Todo
**Created:** 2025 (updated 2026-02-23)

## Problem

Error-to-user-message mapping is duplicated across several services. Each implements its own version of "given an error code/status, produce a human-readable message":

- `chat.service.ts:170-197` — maps Firebase function error codes (`functions/invalid-argument`, `functions/unauthenticated`, etc.) to messages
- `chat.component.ts:331-346` — maps HTTP status codes (0, 401, 429) to messages
- `auth.service.ts:175-194` — maps Firebase auth error codes (`auth/invalid-email`, `auth/wrong-password`, etc.) to messages
- `campaign-settings.component.ts` — inline `error instanceof Error ? error.message : 'Failed to...'` pattern repeated 3 times

### What already exists

- **`shared/logger.ts`** — centralized logging with Sentry integration in production. This handles *logging*, not user-facing error message formatting.
- Error logging is consistent (services use `logger.error()`).

### What's still duplicated

- Error code → user message mapping (each service has its own map/switch)
- The `instanceof Error ? error.message : fallback` pattern appears in multiple components
- No shared type for structured errors returned to the UI

## Solution

Create a lightweight error formatting utility — not an over-engineered Strategy Pattern service, but a simple set of helper functions.

### 1. Create error message maps

```typescript
// src/app/shared/errors/error-messages.ts

/** Firebase Cloud Functions error codes → user messages */
const FUNCTIONS_ERROR_MESSAGES: Record<string, string> = {
  'functions/invalid-argument': 'Invalid request. Please try rephrasing your message.',
  'functions/unauthenticated': 'Not authenticated. Please sign in.',
  'functions/permission-denied': 'Access forbidden. Please verify your permissions.',
  'functions/resource-exhausted': 'Rate limit exceeded. Please wait a moment before trying again.',
  'functions/internal': 'Service error. Please try again later.',
  'functions/unavailable': 'Service temporarily unavailable. Please try again shortly.',
};

/** Firebase Auth error codes → user messages */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Invalid email address',
  'auth/user-disabled': 'This account has been disabled',
  'auth/user-not-found': 'No account found with this email',
  'auth/wrong-password': 'Incorrect password',
  'auth/email-already-in-use': 'An account with this email already exists',
  'auth/weak-password': 'Password should be at least 6 characters',
  'auth/operation-not-allowed': 'This sign-in method is not enabled',
  'auth/popup-blocked': 'Sign-in popup was blocked. Please allow popups for this site.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled',
  'auth/cancelled-popup-request': 'Sign-in was cancelled',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/invalid-credential': 'Invalid credentials provided',
};

/** HTTP status codes → user messages */
const HTTP_ERROR_MESSAGES: Record<number, string> = {
  0: 'Network error. Please check your connection.',
  400: 'Invalid request.',
  401: 'Not authenticated. Please sign in.',
  403: 'Access forbidden.',
  429: 'Rate limit exceeded. Please try again later.',
  500: 'Service error. Please try again later.',
  503: 'Service temporarily unavailable. Please try again shortly.',
};
```

### 2. Create helper functions

```typescript
export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (!error || typeof error !== 'object') return fallback;

  const err = error as { code?: string; status?: number; message?: string };

  // Try Firebase error code lookup first
  if (err.code) {
    const msg = FUNCTIONS_ERROR_MESSAGES[err.code]
      ?? AUTH_ERROR_MESSAGES[err.code];
    if (msg) return msg;
  }

  // Try HTTP status code
  if (err.status !== undefined) {
    const msg = HTTP_ERROR_MESSAGES[err.status];
    if (msg) return msg;
  }

  // Fall back to error message string
  return err.message || fallback;
}

export function extractErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
```

### 3. Migrate services

**ChatService** — replace `formatError()` with `getErrorMessage()`
**ChatComponent** — replace `getErrorMessage()` with shared version
**AuthService** — replace `getErrorMessage()` and inline error map with shared version
**CampaignSettingsComponent** — replace inline `instanceof Error` checks with `extractErrorMessage()`

## Benefits

- Single source of truth for error code → message mapping
- Easy to add new error codes in one place
- Consistent messages across the app
- Simple functions, no unnecessary abstraction
- Works alongside existing `logger.ts` (logging stays separate from user-facing messages)

## Non-goals

- This ticket does NOT cover retry logic or circuit breakers (see ticket #09)
- This is not an error logging change — `logger.ts` already handles that well
