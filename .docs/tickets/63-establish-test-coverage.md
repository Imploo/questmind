# Establish Test Coverage Foundation

**Priority:** High
**Status:** Todo
**Created:** 2026-02-23
**Source:** Multi-Agent Code Review (Opus + Sonnet + Haiku) — [Full Report](../../reviews/FULL-CODEBASE-review-2026-02-23.md)
**Confidence:** HIGH (all 3 agents flagged this as critical)

## Description

The codebase has effectively **0% test coverage** — 1 generated stub test file (`app.spec.ts`) out of ~112 source files. The test runner itself is broken (missing `karma-jasmine` dependency). No backend Cloud Function tests exist at all.

This is the single largest quality risk in the codebase. Complex async workflows (compress → upload → transcribe → generate story → generate podcast) are entirely untested. Security-adjacent code paths (auth checks, campaign membership verification) have no coverage. The absence of tests means any refactoring or new feature risks regressions that go undetected until production.

## Expected Result

- Working test runner for both frontend (Jasmine/Karma or Jest) and backend (Jest)
- Critical backend Cloud Functions tested (auth checks, error paths, happy paths)
- Critical frontend services tested (state management, auth, data processing)
- Test coverage above 30% for new/modified files (incremental approach)

## Status: Todo

---

## Phase 1: Fix Test Infrastructure

**Effort:** 2-4 hours

### Frontend

The test runner fails with `Cannot find module 'karma-jasmine'`. Either:
- Install missing dependency: `npm install --save-dev karma-jasmine karma-chrome-launcher`
- **Or** migrate to Jest (recommended for new Angular projects):
  - Install: `npm install --save-dev jest @angular-builders/jest @types/jest`
  - Update `angular.json` test architect to use `@angular-builders/jest:run`

### Backend

No test infrastructure exists. Set up Jest for Cloud Functions:
```bash
cd functions
npm install --save-dev jest ts-jest @types/jest
```

Create `functions/jest.config.js`:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
};
```

---

## Phase 2: Backend Cloud Function Tests (Highest Priority)

**Effort:** 3-5 days

Backend functions are the highest-risk untested code — they handle auth, AI API calls, Firestore writes, and external service integrations.

### Priority 1: Auth & Security Tests

| File | Test Focus |
|------|-----------|
| `resolve-spell.ts` | Auth check (after #59 fix), input validation, Firestore write |
| `resolve-feature.ts` | Auth check (after #59 fix), input validation, Firestore write |
| `transcribe-audio-fast.ts` | Auth check, Gemini API mocking, progress updates |
| `generate-podcast-audio.ts` | Auth + campaign membership + session ownership triple check |

### Priority 2: Core Business Logic Tests

| File | Test Focus |
|------|-----------|
| `character-chat.ts` | Rate limit handling, message history, Cloud Task dispatch |
| `generate-character-draft.ts` | JSON parsing, Zod validation, error recovery (isGenerating flag) |
| `upload-audio-to-gemini.ts` | SSRF protection, auth token verification, chunked upload |

### Priority 3: Service Tests

| File | Test Focus |
|------|-----------|
| `services/kanka.service.ts` | API integration, error handling, parallel fetching |
| `services/progress-tracker.service.ts` | Value clamping, debouncing |
| `services/worker-queue.service.ts` | Handler registration, task dispatch |
| `utils/ai-settings.ts` | Firestore read, default fallback |

### Test Pattern (Backend)

```typescript
import { describe, it, expect, jest } from '@jest/globals';

describe('resolveSpell', () => {
  it('should reject unauthenticated callers', async () => {
    const request = { data: { characterId: '123', spellName: 'Fireball' }, auth: null };
    await expect(resolveSpellHandler(request)).rejects.toThrow('unauthenticated');
  });

  it('should resolve a known SRD spell without AI', async () => {
    // Mock Firestore, verify no AI call made
  });

  it('should fall back to AI for unknown spells', async () => {
    // Mock AI response, verify Firestore patch
  });
});
```

---

## Phase 3: Frontend Service Tests

**Effort:** 3-4 days

### Priority 1: State Management & Auth

| File | Test Focus |
|------|-----------|
| `auth/auth.service.ts` | Signal state transitions, sign-in/out flows |
| `audio/services/audio-session-state.service.ts` | Resource loading, session state |
| `campaign/campaign-context.service.ts` | Resource lifecycle, campaign switching |

### Priority 2: Data Processing

| File | Test Focus |
|------|-----------|
| `audio/services/audio-compression.service.ts` | Skip-if-larger logic, bitrate handling |
| `audio/services/audio-complete-processing.service.ts` | Chunked upload, progress tracking |
| `core/models/schemas/*.ts` | Zod schema validation (valid + invalid inputs) |

### Priority 3: Guards

| File | Test Focus |
|------|-----------|
| `auth/auth.guard.ts` | Authenticated vs unauthenticated routing |
| `auth/admin.guard.ts` | Admin vs non-admin access |
| `campaign/campaign.guard.ts` | Campaign membership check |

### Test Pattern (Frontend with ng-mocks)

```typescript
describe('AuthService', () => {
  it('should set isAuthenticated to true when user signs in', () => {
    // Arrange: mock Firebase auth
    // Act: trigger auth state change
    // Assert: expect(service.isAuthenticated()).toBe(true);
  });
});
```

---

## Phase 4: Component Tests (Lower Priority)

**Effort:** 2-3 days (incremental)

Focus on components with complex logic:

| Component | Test Focus |
|-----------|-----------|
| `AudioSessionComponent` | Session selection, podcast generation trigger, error states |
| `AdminComponent` | Settings load/save, form interactions |
| `ChatComponent` | Message rendering, scroll behavior |

---

## Metrics & Goals

| Metric | Current | Phase 2 Target | Phase 3 Target | Long-term Target |
|--------|---------|----------------|----------------|-----------------|
| Backend coverage | 0% | 40% | 40% | 70% |
| Frontend coverage | 0% | 0% | 25% | 50% |
| Test files | 1 (stub) | 10+ | 20+ | 50+ |
| Test runner | Broken | Working | Working | CI integrated |

---

## Checklist

- [ ] Fix or replace frontend test runner (Karma or migrate to Jest)
- [ ] Set up Jest for backend Cloud Functions
- [ ] Write auth/security tests for `resolve-spell.ts`, `resolve-feature.ts`
- [ ] Write auth tests for `transcribe-audio-fast.ts`, `generate-podcast-audio.ts`
- [ ] Write business logic tests for `character-chat.ts`, `generate-character-draft.ts`
- [ ] Write SSRF protection test for `upload-audio-to-gemini.ts`
- [ ] Write frontend service tests for `auth.service.ts`, `audio-session-state.service.ts`
- [ ] Write Zod schema validation tests
- [ ] Write guard tests (`auth.guard.ts`, `admin.guard.ts`, `campaign.guard.ts`)
- [ ] Add test scripts to `package.json` for both frontend and backend
- [ ] Verify all tests pass: `npm test` and `cd functions && npm test`
