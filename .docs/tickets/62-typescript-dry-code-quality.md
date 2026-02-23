# TypeScript & DRY Code Quality Improvements

**Priority:** Medium
**Status:** Todo
**Created:** 2026-02-23
**Source:** Multi-Agent Code Review (Opus + Sonnet + Haiku) — [Full Report](../../reviews/FULL-CODEBASE-review-2026-02-23.md)
**Confidence:** HIGH to MEDIUM (most findings confirmed by 2+ agents)

## Description

TypeScript type safety violations and DRY (Don't Repeat Yourself) violations identified across both frontend and backend. These issues don't cause immediate bugs but increase maintenance burden, reduce type safety, and create drift risk between shared types.

## Expected Result

- Zero `any` usage in backend code (use `unknown` with type guards)
- Unsafe type assertions replaced with proper typing
- Shared types defined once and imported everywhere
- Duplicated logic extracted to shared utilities
- Signal mutation anti-pattern fixed in admin component

## Status: Todo

---

## TypeScript Type Safety

### 1. Replace `catch (error: any)` with `catch (error: unknown)`

**Confidence:** HIGH | **File:** `functions/src/transcribe-audio-fast.ts:L2606`

```typescript
// Before:
catch (error: any) {
  logger.error('Transcription failed:', error.message);
}

// After:
catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Transcription failed:', message);
}
```

### 2. Remove `any` in `worker-queue.service.ts`

**Confidence:** MEDIUM | **File:** `functions/src/services/worker-queue.service.ts:L2163,L2171`

Two `any` usages for attaching/retrieving handler functions on worker functions.

```typescript
// Before:
(workerFunc as any).__handler = handler;
static getHandler(workerFunc: any): WorkerHandler { ... }

// After — use a WeakMap instead of mutating function objects:
private static handlerMap = new WeakMap<Function, WorkerHandler>();
static setHandler(workerFunc: Function, handler: WorkerHandler) {
  this.handlerMap.set(workerFunc, handler);
}
static getHandler(workerFunc: Function): WorkerHandler | undefined {
  return this.handlerMap.get(workerFunc);
}
```

### 3. Reduce Unsafe Type Assertions in `admin.component.ts`

**Confidence:** MEDIUM | **File:** `src/app/admin/admin.component.ts:L413-491`

6 locations use `as Record<string, Record<string, unknown>>` or similar casts. These bypass TypeScript safety. Consider:
- Defining a proper `AiSettingsFeatures` interface
- Using `satisfies` where appropriate
- Adding type guards for Firestore data

### 4. Fix Signal Mutation Anti-Pattern in `admin.component.ts`

**Confidence:** MEDIUM (found by 2 cross-verifiers) | **File:** `src/app/admin/admin.component.ts:L417-425`

`setFeatureValue()` directly mutates the object inside a signal without calling `signal.update()` or `signal.set()`. This bypasses signal change detection:

```typescript
// Current (anti-pattern):
setFeatureValue(field: string, value: unknown): void {
  const featureConfig = (...)[key];
  featureConfig[field] = value; // Direct mutation!
}

// Fix — use signal.update():
setFeatureValue(field: string, value: unknown): void {
  this.aiSettings.update(settings => {
    const updated = structuredClone(settings);
    // ... apply the change to updated ...
    return updated;
  });
}
```

### 5. Validate Environment Variables Before Non-Null Assertion

**Confidence:** MEDIUM | **Files:**
- `functions/src/generate-character-draft.ts:L230` — `process.env.GOOGLE_AI_API_KEY!`
- `functions/src/transcribe-audio-fast.ts:L2486,L2491` — same

Add explicit validation with a descriptive error:

```typescript
const apiKey = process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  throw new HttpsError('failed-precondition', 'Google AI API key not configured');
}
```

---

## DRY Violations

### 6. Extract `sortedSessions` to `AudioSessionStateService`

**Confidence:** HIGH | **Files:**
- `src/app/audio/audio-session.component.ts:L1027-1035`
- `src/app/audio/audio-upload-page.component.ts:L1785-1792`

Identical `computed()` sorting logic duplicated in two components. Move to the shared service:

```typescript
// In AudioSessionStateService:
readonly sortedSessions = computed(() => {
  const sessions = this.sessions();
  return [...sessions].sort((a, b) => /* sorting logic */);
});
```

### 7. Extract `ChatHistoryMessage` to Shared Types

**Confidence:** MEDIUM | **Files:**
- `functions/src/character-chat.ts:L70`
- `functions/src/generate-character-draft.ts:L207`
- `functions/src/generate-image.ts:L345`

Same interface defined 3 times. Extract to `functions/src/types/chat.types.ts`:

```typescript
export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}
```

### 8. Consolidate `SessionProgressStage` / `SessionProgress` Types

**Confidence:** MEDIUM | **Files:**
- `src/app/audio/services/audio-session.models.ts`
- `functions/src/types/audio-session.types.ts`

Nearly identical types with slight differences (frontend has extra stages). Options:
- **Option A:** Create a shared `types/` package in the monorepo root
- **Option B:** Make backend the source of truth, frontend extends with additional stages
- **Option C:** Accept the duplication but document it (least effort)

### 9. Extract Parallel Fetch Logic in `kanka.service.ts`

**Confidence:** MEDIUM | **File:** `functions/src/services/kanka.service.ts:L1733-1831`

`getAllEntities` and `searchEntities` have nearly identical parallel mapping patterns. Extract a shared method:

```typescript
private async fetchEntityTypes(
  campaignId: number,
  fetchFn: (type: string, campaignId: number) => Promise<Entity[]>
): Promise<KankaSearchResult> {
  // shared parallel fetch + error handling
}
```

### 10. Extract AI Config Defaults to Shared Location

**Confidence:** MEDIUM | **Files:**
- `src/app/admin/admin.component.ts` (frontend `defaultConfigs`)
- `functions/src/utils/ai-settings.ts` (backend `DEFAULT_CONFIGS`)

Same default model names, temperatures, and parameters defined in two places. If one is updated, the other drifts.

---

## Checklist

- [ ] Replace `catch (error: any)` with `catch (error: unknown)` in `transcribe-audio-fast.ts`
- [ ] Replace `any` with `WeakMap` in `worker-queue.service.ts`
- [ ] Fix signal mutation anti-pattern in `admin.component.ts`
- [ ] Add env var validation before non-null assertions (2 files)
- [ ] Extract `sortedSessions` to `AudioSessionStateService`
- [ ] Extract `ChatHistoryMessage` to `functions/src/types/chat.types.ts`
- [ ] Extract parallel fetch logic in `kanka.service.ts`
- [ ] Reduce type assertions in `admin.component.ts` (nice-to-have)
- [ ] Run build (`npm run build && npm run build:backend`) and lint
