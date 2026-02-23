# Establish Test Coverage Foundation

**Priority:** High
**Status:** Done
**Created:** 2026-02-23
**Updated:** 2026-02-23
**Source:** Multi-Agent Code Review (Opus + Sonnet + Haiku) — [Full Report](../../reviews/FULL-CODEBASE-review-2026-02-23.md)
**Confidence:** HIGH (all 3 agents flagged this as critical)

## Description

The codebase has effectively **0% test coverage** — 1 generated stub test file (`app.spec.ts`) out of ~112 source files. The test runner itself is broken (currently configured with `@angular/build:karma` but missing karma dependencies). No backend Cloud Function tests exist at all.

This is the single largest quality risk in the codebase. Complex async workflows (compress → upload → transcribe → generate story → generate podcast) are entirely untested. Security-adjacent code paths (auth checks, campaign membership verification) have no coverage. The absence of tests means any refactoring or new feature risks regressions that go undetected until production.

## Expected Result

- Working test runner for both frontend (Vitest via `@angular/build:unit-test`) and backend (Vitest)
- Critical backend Cloud Functions tested (auth checks, error paths, happy paths)
- Critical frontend services tested (state management, auth, data processing)
- Test coverage above 30% for new/modified files (incremental approach)

## Status: Todo

---

## Phase 1: Set Up Vitest Infrastructure

**Effort:** 2-4 hours

### Frontend — Migrate Karma to Vitest

Angular 21 has official Vitest support via the `@angular/build:unit-test` builder. Follow the [official migration guide](https://angular.dev/guide/testing/migrating-to-vitest).

**Step 1: Install dependencies**
```bash
npm install --save-dev vitest jsdom
```

**Step 2: Update `angular.json`**

Change the test builder from `@angular/build:karma` to `@angular/build:unit-test`:
```json
{
  "projects": {
    "campaign-manager": {
      "architect": {
        "test": {
          "builder": "@angular/build:unit-test"
        }
      }
    }
  }
}
```

The `unit-test` builder defaults to `tsconfig.spec.json` and `buildTarget: ::development`. No additional build options (polyfills, assets, styles) should be set directly — those come from the build target.

**Step 3: Update `tsconfig.spec.json`**

Change types from `jasmine` to `vitest/globals`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.d.ts", "src/**/*.spec.ts"]
}
```

**Step 4: Refactor existing Jasmine tests to Vitest**

Run the official Angular schematic to auto-convert Jasmine syntax:
```bash
ng g @schematics/angular:refactor-jasmine-vitest
```

This converts `spyOn` → `vi.spyOn`, `jasmine.createSpy` → `vi.fn()`, `jasmine.objectContaining` → `expect.objectContaining`, etc. Review changes after running.

**Step 5: Remove Karma packages (if any were installed)**
```bash
npm uninstall karma karma-chrome-launcher karma-coverage karma-jasmine karma-jasmine-html-reporter
```

Delete `karma.conf.js` and `src/test.ts` if they exist.

**Step 6: Verify**
```bash
ng test
```

> **Note:** `zone.js`-based test helpers (`fakeAsync`, `flush`, `waitForAsync`) are **not supported** with Vitest. Use native `async/await` and Vitest's `vi.useFakeTimers()` instead.

### Backend — Set Up Vitest for Cloud Functions

No test infrastructure exists. Set up Vitest for the `functions/` directory:

**Step 1: Install dependencies**
```bash
cd functions
npm install --save-dev vitest
```

**Step 2: Create `functions/vitest.config.ts`**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './src',
    include: ['**/*.spec.ts', '**/*.test.ts'],
  },
});
```

**Step 3: Add test script to `functions/package.json`**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 4: Verify**
```bash
cd functions && npm test
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
import { describe, it, expect, vi } from 'vitest';

// Mock firebase-admin before importing the function under test
vi.mock('firebase-admin', () => ({
  firestore: vi.fn(() => ({
    collection: vi.fn(),
    doc: vi.fn(),
  })),
}));

describe('resolveSpell', () => {
  it('should reject unauthenticated callers', async () => {
    const request = { data: { characterId: '123', spellName: 'Fireball' }, auth: null };
    await expect(resolveSpellHandler(request)).rejects.toThrow('unauthenticated');
  });

  it('should resolve a known SRD spell without AI', async () => {
    // Mock Firestore, verify no AI call made
  });

  it('should fall back to AI for unknown spells', async () => {
    // Mock AI response with vi.fn(), verify Firestore patch
  });
});
```

**Key Vitest patterns for backend:**
- Use `vi.mock()` for module mocking (hoisted automatically)
- Use `vi.spyOn()` for partial mocking
- Use `vi.fn()` for creating mock functions
- Use `vi.useFakeTimers()` / `vi.useRealTimers()` for timer-dependent code
- Use `beforeEach(() => { vi.clearAllMocks(); })` to reset between tests

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

### Test Pattern (Frontend — Angular + Vitest)

```typescript
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        // Mock Firebase Auth via provide/useValue
      ],
    });
    service = TestBed.inject(AuthService);
  });

  it('should set isAuthenticated to true when user signs in', () => {
    // Arrange: trigger mock auth state change
    // Assert:
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should clear user state on sign out', () => {
    // Arrange: set authenticated state
    // Act: sign out
    // Assert:
    expect(service.isAuthenticated()).toBe(false);
  });
});
```

**Key Vitest patterns for frontend:**
- `TestBed` works with Vitest the same as with Jasmine — no API change needed
- Use `vi.spyOn()` instead of Jasmine's `spyOn()` (auto-converted by schematic)
- Use native `async/await` instead of `fakeAsync`/`waitForAsync`
- Use `vi.useFakeTimers()` for timer-based tests (replaces `fakeAsync` + `tick`)
- `provideZonelessChangeDetection()` is compatible with Vitest

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
| Test runner | Broken (Karma) | Vitest (working) | Vitest (working) | CI integrated |

---

## Checklist

- [ ] Install Vitest + jsdom for frontend: `npm install --save-dev vitest jsdom`
- [ ] Update `angular.json` builder to `@angular/build:unit-test`
- [ ] Update `tsconfig.spec.json` types to `vitest/globals`
- [ ] Run Jasmine→Vitest schematic: `ng g @schematics/angular:refactor-jasmine-vitest`
- [ ] Remove Karma packages and config files
- [ ] Verify frontend tests pass: `ng test`
- [ ] Set up Vitest for backend Cloud Functions (`functions/`)
- [ ] Add `test` and `test:watch` scripts to `functions/package.json`
- [ ] Verify backend tests pass: `cd functions && npm test`
- [ ] Write auth/security tests for `resolve-spell.ts`, `resolve-feature.ts`
- [ ] Write auth tests for `transcribe-audio-fast.ts`, `generate-podcast-audio.ts`
- [ ] Write business logic tests for `character-chat.ts`, `generate-character-draft.ts`
- [ ] Write SSRF protection test for `upload-audio-to-gemini.ts`
- [ ] Write frontend service tests for `auth.service.ts`, `audio-session-state.service.ts`
- [ ] Write Zod schema validation tests
- [ ] Write guard tests (`auth.guard.ts`, `admin.guard.ts`, `campaign.guard.ts`)
- [ ] Verify all tests pass: `ng test` and `cd functions && npm test`
