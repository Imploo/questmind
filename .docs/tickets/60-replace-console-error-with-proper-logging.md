# Replace console.error with Proper Logging Across Codebase

**Priority:** High
**Status:** Todo
**Created:** 2026-02-23
**Source:** Multi-Agent Code Review (Opus + Sonnet + Haiku) — [Full Report](../../reviews/FULL-CODEBASE-review-2026-02-23.md)
**Confidence:** HIGH (all 3 agents agreed, all cross-verifiers confirmed)
**Related:** #44 (Sentry setup — Done), #29 (Error Handler Service)

## Description

~35 `console.error` calls across both frontend and backend bypass the established error logging infrastructure. Frontend should use `logger.error()` from `shared/logger` (which sends to Sentry in production). Backend Cloud Functions should use `captureFunctionError()` or `captureException()` from `./utils/sentry-error-handler`.

Sentry is already set up (#44 is Done), but the actual codebase migration from `console.error` was never completed. Production errors at these locations are silently lost — they appear in Cloud Function logs but not in Sentry alerts.

## Expected Result

- Zero `console.error` calls in `src/` (frontend) — all replaced with `logger.error()`
- Zero `console.error` calls in `functions/src/` (backend) — all replaced with Sentry utilities
- Production errors visible in Sentry dashboard with proper context

## Status: Todo

---

## Frontend Locations (~15 calls)

All should be replaced with `logger.error()` from `shared/logger`.

| File | Lines | Context |
|------|-------|---------|
| `src/app/admin/admin.component.ts` | L445, L466 | Settings save/load errors |
| `src/app/audio/audio-session.component.ts` | L1214, L1257, L1481, L1582 | Session operations, podcast generation errors |
| `src/app/audio/audio-upload-page.component.ts` | L1819, L1891 | Upload errors |
| `src/app/audio/services/audio-complete-processing.service.ts` | L3019 | Processing pipeline error |
| `src/app/audio/services/audio-session-state.service.ts` | L3447, L3482, L3486 | State management errors |
| `src/app/auth/auth.service.ts` | L5095, L5111 | Auth state change, sign-out errors |
| `src/app/auth/auth-button.component.ts` | L62 | Sign-out error |
| `src/app/auth/sign-in-modal.component.ts` | L5438, L5465 | Sign-in errors |
| `src/app/campaign/campaign-context.service.ts` | L5666, L5717 | Campaign context load errors |
| `src/app/campaign/campaign.service.ts` | L6527, L6606, L6628 | Campaign operations |
| `src/app/chat/chat.component.ts` | L7006 | Chat error |
| `src/app/chat/chat.service.ts` | L7303 | Chat service error |
| `src/app/core/firebase.service.ts` | L7384 | Firebase init error (critical) |

**Also:** `console.warn` at `audio-session.component.ts:L1577` — replace with `logger.warn()`.

### Frontend Fix Pattern

```typescript
// Before:
console.error('Failed to load settings:', error);

// After:
import { logger } from '../shared/logger';
logger.error('Failed to load settings:', error);
```

---

## Backend Locations (~20 calls)

All should be replaced with `captureException()` or `captureFunctionError()` from `./utils/sentry-error-handler`. Note: the backend `logger.error()` from `./utils/logger.ts` already calls `Sentry.captureException()` — using either is acceptable.

| File | Lines | Context |
|------|-------|---------|
| `functions/src/character-chat.ts` | L101, L129, L147 | Chat errors, task dispatch |
| `functions/src/generate-character-draft.ts` | L226 | Missing payload fields |
| `functions/src/generate-podcast-audio.ts` | L893 | Podcast generation error |
| `functions/src/resolve-spell.ts` | L1458, L1485 | Spell resolution errors |
| `functions/src/resolve-feature.ts` | L1350, L1377 | Feature resolution errors |
| `functions/src/services/kanka.service.ts` | L1754, L1794, L1824, L1865 | Kanka API errors (4 locations) |
| `functions/src/services/worker-queue.service.ts` | L2102, L2143, L2156 | Worker queue errors |
| `functions/src/services/progress-tracker.service.ts` | L1996 | Progress update error |
| `functions/src/transcribe-audio-fast.ts` | L2607 | Transcription error |
| `functions/src/workers/story-generation-worker.ts` | L3753 | Story generation error |

### Backend Fix Pattern

```typescript
// Before:
console.error('Kanka API error:', error);

// After (option A — using logger):
import { logger } from '../utils/logger';
logger.error('Kanka API error:', error);

// After (option B — using Sentry directly):
import { captureException } from '../utils/sentry-error-handler';
captureException(error, { extra: { context: 'Kanka API' } });
```

---

## Checklist

- [ ] Replace all `console.error` in `src/` with `logger.error()` (~15 locations)
- [ ] Replace `console.warn` in `audio-session.component.ts` with `logger.warn()`
- [ ] Replace all `console.error` in `functions/src/` with `logger.error()` or `captureException()` (~20 locations)
- [ ] Verify `shared/logger` is imported in all modified frontend files
- [ ] Verify `utils/logger` or `utils/sentry-error-handler` is imported in all modified backend files
- [ ] Run `grep -r "console.error" src/ functions/src/` to confirm zero remaining violations
- [ ] Run build (`npm run build && npm run build:backend`)
