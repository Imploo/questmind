# Performance & Architecture Improvements

**Priority:** Medium
**Status:** Todo
**Created:** 2026-02-23
**Source:** Multi-Agent Code Review (Opus + Sonnet + Haiku) — [Full Report](../../reviews/FULL-CODEBASE-review-2026-02-23.md)
**Confidence:** MEDIUM to HIGH
**Related:** #26 (Split AudioSessionComponent), #32 (Low Priority Optimizations)

## Description

Performance and architectural improvements identified during the multi-agent review. These don't cause immediate bugs but impact bundle size, runtime efficiency, and code maintainability.

## Expected Result

- Campaign feature routes lazy-loaded (reduced initial bundle)
- AI settings cached in Cloud Functions (fewer Firestore reads)
- `setImmediate` fire-and-forget replaced with reliable patterns
- Native `alert()` replaced with app's toast system
- `audio-session.component.ts` decomposed (see also #26)

## Status: Todo

---

## 1. Lazy-Load Campaign Feature Routes

**Confidence:** MEDIUM (Sonnet cross-verification new finding, correcting Opus)
**File:** `src/app/app.routes.ts`
**Impact:** Reduced initial bundle size

Campaign child routes use direct `component:` references instead of `loadComponent`. All these components are imported at the top of `app.routes.ts`, adding them to the initial bundle even if the user never visits a campaign.

**Affected routes:**
- `audio` → `AudioSessionComponent`
- `audio/new` → `AudioUploadPageComponent`
- `audio/:sessionId` → `AudioSessionComponent`
- `podcasts` → `PodcastLibraryComponent`
- `settings` → `CampaignSettingsComponent`

### Fix

```typescript
// Before:
{ path: 'audio', component: AudioSessionComponent }

// After:
{ path: 'audio', loadComponent: () => import('./audio/audio-session.component').then(m => m.AudioSessionComponent) }
```

Remove the top-level imports for these components.

---

## 2. Add In-Memory TTL Cache for AI Settings

**Confidence:** MEDIUM (Opus found, Sonnet confirmed)
**File:** `functions/src/utils/ai-settings.ts`
**Impact:** Fewer Firestore reads, lower latency for Cloud Functions

Every Cloud Function invocation calls `getAiFeatureConfig()` which reads from Firestore. In high-traffic scenarios, this adds latency and Firestore read costs.

### Fix

```typescript
let cachedSettings: AiSettings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getAiFeatureConfig(feature: string): Promise<AiModelConfig> {
  const now = Date.now();
  if (!cachedSettings || now - cacheTimestamp > CACHE_TTL_MS) {
    const doc = await getFirestore().collection('settings').doc('ai').get();
    cachedSettings = doc.data() as AiSettings ?? null;
    cacheTimestamp = now;
  }
  // ... use cachedSettings
}
```

**Note:** Cloud Function instances can be recycled, so the cache is per-instance. This is acceptable — it reduces reads within a warm instance's lifetime.

---

## 3. Replace `setImmediate` Fire-and-Forget in Worker Queue

**Confidence:** HIGH (all 3 agents agreed)
**File:** `functions/src/services/worker-queue.service.ts:L2097,L2138`
**Impact:** Prevents lost background work

`setImmediate` defers execution past the HTTP response. Cloud Functions may terminate the Node.js process after responding, causing the deferred work to never execute.

### Fix Options

- **Option A:** Use Cloud Tasks (already used elsewhere in the codebase) for background work
- **Option B:** `await` the background work before responding (increases response time but guarantees completion)
- **Option C:** If the fire-and-forget pattern is intentional for emulator-only use, add clear documentation and a runtime guard

---

## 4. Replace Native `alert()` with Toast Notifications

**Confidence:** MEDIUM (Opus warning, Sonnet cross-new)
**File:** `src/app/audio/audio-session.component.ts:L1300,L1342,L1345`
**Impact:** Better UX, consistent with app patterns

The app has a `ToastContainerComponent` and `ToastService` for non-blocking notifications, but `audio-session.component.ts` uses native `alert()` which blocks the main thread and can't be styled.

### Fix

```typescript
// Before:
alert('Podcast generation started!');

// After:
this.toastService.show('Podcast generation started!', 'success');
```

---

## 5. Decompose `audio-session.component.ts` (~900 lines)

**Confidence:** HIGH (all 3 agents agreed)
**File:** `src/app/audio/audio-session.component.ts`
**Related:** Ticket #26 already covers this in detail
**Impact:** Single Responsibility, testability, maintainability

The component handles: session management, podcast generation, audio corrections, retry logic, progress tracking, mobile drawer state, and navigation. Decompose into:

- `AudioSessionListComponent` — session selection and display
- `PodcastControlsComponent` — generation, retry, corrections
- `AudioSessionPageComponent` — container/orchestrator

See ticket #26 for detailed decomposition plan.

---

## 6. Memoize `marked.parse()` in Chat Template

**Confidence:** LOW (Sonnet only)
**File:** `src/app/chat/chat.component.ts`
**Impact:** Reduced CPU work on change detection

`parseMarkdown(message.text)` is called in the template for every message on every change detection cycle. Without `OnPush` (this component lacks it), this runs frequently.

### Fix

Either:
- Add `OnPush` (covered in ticket #61)
- Pre-compute markdown in a `Map<string, SafeHtml>` signal
- Use a pipe with memoization

---

## Checklist

- [ ] Convert campaign routes to `loadComponent` in `app.routes.ts`
- [ ] Add TTL cache to `getAiFeatureConfig()` in `ai-settings.ts`
- [ ] Replace or document `setImmediate` pattern in `worker-queue.service.ts`
- [ ] Replace `alert()` with `toastService.show()` in `audio-session.component.ts`
- [ ] Decompose `audio-session.component.ts` (see also #26)
- [ ] Run build (`npm run build && npm run build:backend`)
