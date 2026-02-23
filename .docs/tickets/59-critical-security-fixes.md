# Critical Security Fixes

**Priority:** Critical
**Status:** Todo
**Created:** 2026-02-23
**Source:** Multi-Agent Code Review (Opus + Sonnet + Haiku) — [Full Report](../../reviews/FULL-CODEBASE-review-2026-02-23.md)
**Confidence:** HIGH (all 3 agents agreed, all cross-verifiers confirmed)

## Description

Three security vulnerabilities were identified with HIGH confidence by all three review agents. Two unauthenticated Cloud Functions allow any caller to consume AI API credits, and one XSS vector exists through bypassed HTML sanitization on AI-generated content.

## Expected Result

- All callable Cloud Functions verify `request.auth?.uid` before processing
- No `bypassSecurityTrustHtml` usage on user-influenced or AI-generated content
- Angular's built-in sanitization used consistently across the app

## Status: Todo

---

## Finding 1: Unauthenticated `resolveSpell` Cloud Function

**File:** `functions/src/resolve-spell.ts`
**Severity:** Critical
**Confidence:** HIGH — found by all 3 agents, confirmed by all 3 cross-verifiers

### Problem

The `resolveSpell` callable function does not verify the caller is authenticated. Any unauthenticated user can invoke this function to:
- Consume AI API credits (Google AI / Anthropic)
- Write to Firestore (patching character documents)
- Potentially enumerate character data

Firebase `onCall` passes auth context but does **not** enforce authentication automatically.

### Fix

Add auth guard at the top of the function handler:

```typescript
if (!request.auth?.uid) {
  throw new HttpsError('unauthenticated', 'Authentication required');
}
```

Also consider adding an authorization check to verify the caller owns or has access to the character being modified.

---

## Finding 2: Unauthenticated `resolveFeature` Cloud Function

**File:** `functions/src/resolve-feature.ts`
**Severity:** Critical
**Confidence:** HIGH — found by all 3 agents, confirmed by all 3 cross-verifiers

### Problem

Same issue as Finding 1. The `resolveFeature` callable function does not check `request.auth?.uid`. Identical attack surface — unauthenticated AI API abuse and Firestore writes.

### Fix

Same pattern as Finding 1:

```typescript
if (!request.auth?.uid) {
  throw new HttpsError('unauthenticated', 'Authentication required');
}
```

---

## Finding 3: XSS via `bypassSecurityTrustHtml` in session-story

**File:** `src/app/audio/session-story.component.ts:L4720`
**Severity:** High
**Confidence:** HIGH — found by all 3 agents, confirmed by all 3 cross-verifiers

### Problem

The component converts AI-generated story content through `marked.parse()` and then passes it through `bypassSecurityTrustHtml()`, completely disabling Angular's built-in XSS protection:

```typescript
this.sanitizer.bypassSecurityTrustHtml(this.convertMarkdown(this.story))
```

If Firestore data is ever compromised (via security rules gap, admin access, or AI output containing `<script>` / `<img onerror=...>` tags), this is a direct stored XSS vector.

The correct pattern already exists in the codebase — `chat.component.ts` uses `sanitizer.sanitize(SecurityContext.HTML, html)` instead.

### Fix

Replace `bypassSecurityTrustHtml` with Angular's sanitizer:

```typescript
import { SecurityContext } from '@angular/core';

// Instead of:
this.sanitizer.bypassSecurityTrustHtml(this.convertMarkdown(this.story))

// Use:
this.sanitizer.sanitize(SecurityContext.HTML, this.convertMarkdown(this.story))
```

---

## Finding 4: Missing auth on `transcribeAudioFast` (MEDIUM confidence)

**File:** `functions/src/transcribe-audio-fast.ts`
**Severity:** Medium
**Confidence:** MEDIUM — found by Sonnet, confirmed by Opus cross-verifier

### Problem

Unlike `generatePodcastAudio` which explicitly validates `request.auth?.uid`, this function accepts a storage URL and triggers expensive Gemini AI processing without explicit auth verification.

### Fix

Add the same auth guard pattern:

```typescript
if (!request.auth?.uid) {
  throw new HttpsError('unauthenticated', 'Authentication required');
}
```

---

## Checklist

- [ ] Add auth check to `resolveSpell` in `functions/src/resolve-spell.ts`
- [ ] Add auth check to `resolveFeature` in `functions/src/resolve-feature.ts`
- [ ] Add auth check to `transcribeAudioFast` in `functions/src/transcribe-audio-fast.ts`
- [ ] Replace `bypassSecurityTrustHtml` with `sanitizer.sanitize()` in `session-story.component.ts`
- [ ] Verify all other callable functions have explicit auth checks (audit)
- [ ] Run build to verify no regressions
