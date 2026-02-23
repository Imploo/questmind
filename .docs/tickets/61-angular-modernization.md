# Angular Modernization: Migrate Legacy Patterns

**Priority:** Medium
**Status:** Todo
**Created:** 2026-02-23
**Source:** Multi-Agent Code Review (Opus + Sonnet + Haiku) — [Full Report](../../reviews/FULL-CODEBASE-review-2026-02-23.md)
**Confidence:** HIGH (most findings confirmed by all 3 agents)
**Related:** #31 (Medium Priority Improvements — partially overlapping)

## Description

Multiple components use deprecated or outdated Angular patterns that conflict with the project's Angular 21 + zoneless change detection architecture. This ticket groups all Angular-specific modernization items from the multi-agent review into a single actionable ticket.

The app is configured with `provideZonelessChangeDetection()` but several components undermine this by missing `OnPush`, using legacy decorators, or managing subscriptions manually.

## Expected Result

- All components use `ChangeDetectionStrategy.OnPush`
- All components use `input()`/`output()` signal functions (no `@Input`/`@Output` decorators)
- No redundant `standalone: true` (default in Angular 21)
- No `ngClass`/`ngStyle` usage (use `[class]`/`[style]` bindings)
- Subscriptions managed via `takeUntilDestroyed()` or `DestroyRef` (no manual `OnDestroy`)
- Reactive forms preferred over template-driven `ngModel`

## Status: Todo

---

## 1. Remove Redundant `standalone: true` (9 components)

**Confidence:** HIGH | **Effort:** 30 minutes

In Angular 21, standalone is the default. Explicit `standalone: true` is noise.

| Component | File |
|-----------|------|
| AppComponent | `src/app/app.ts` |
| AudioUploadComponent | `src/app/audio/audio-upload.component.ts` |
| PodcastLibraryComponent | `src/app/audio/podcast-library.component.ts` |
| SessionStoryComponent | `src/app/audio/session-story.component.ts` |
| AuthButtonComponent | `src/app/auth/auth-button.component.ts` |
| SignInModalComponent | `src/app/auth/sign-in-modal.component.ts` |
| SignInPageComponent | `src/app/auth/sign-in-page.component.ts` |
| ChatComponent | `src/app/chat/chat.component.ts` |
| ImageLightboxComponent | `src/app/chat/image-lightbox.component.ts` |

### Fix

Remove `standalone: true` from each `@Component` decorator.

---

## 2. Add Missing `ChangeDetectionStrategy.OnPush` (6 components)

**Confidence:** HIGH | **Effort:** 1 hour

These components lack `OnPush`, undermining the zoneless change detection strategy.

| Component | File |
|-----------|------|
| AppComponent | `src/app/app.ts` |
| AuthButtonComponent | `src/app/auth/auth-button.component.ts` |
| SignInModalComponent | `src/app/auth/sign-in-modal.component.ts` |
| SignInPageComponent | `src/app/auth/sign-in-page.component.ts` |
| PodcastLibraryComponent | `src/app/audio/podcast-library.component.ts` |
| SessionStoryComponent | `src/app/audio/session-story.component.ts` |

### Fix

Add `changeDetection: ChangeDetectionStrategy.OnPush` to each `@Component` decorator. May require converting any mutable class properties to signals.

---

## 3. Migrate `@Input()`/`@Output()` to `input()`/`output()` Signal Functions

**Confidence:** HIGH | **Effort:** 2-3 hours

Two components still use the deprecated decorator pattern.

### 3a. `AudioUploadComponent` (`src/app/audio/audio-upload.component.ts`)

Lines 2195-2203: Uses `@Input()` for `sessionId`, `campaignId` and `@Output()` for `uploadStarted`, `uploadComplete`, `uploadError`.

```typescript
// Before:
@Input() sessionId!: string;
@Output() uploadComplete = new EventEmitter<void>();

// After:
sessionId = input.required<string>();
uploadComplete = output<void>();
```

### 3b. `SessionStoryComponent` (`src/app/audio/session-story.component.ts`)

Lines 4668-4698: Uses ~20 `@Input()` decorators and multiple `@Output()` decorators. Also uses `@ViewChild()`. This is the biggest migration target.

Also replace `OnChanges`/`ngOnChanges` with `effect()` or `computed()` for reactive updates:

```typescript
// Before:
@Input() story!: string;
ngOnChanges(changes: SimpleChanges) {
  if (changes['story']) { this.convertMarkdown(this.story); }
}

// After:
story = input.required<string>();
renderedStory = computed(() => this.convertMarkdown(this.story()));
```

---

## 4. Replace `ngClass` with `[class]` Bindings

**Confidence:** HIGH | **Effort:** 30 minutes

**File:** `src/app/admin/admin.component.ts` at lines 110 and 127.

```html
<!-- Before: -->
<div [ngClass]="feature.providerColor">

<!-- After: -->
<div [class]="feature.providerColor">
```

---

## 5. Replace Manual Subscription Management with `takeUntilDestroyed()`

**Confidence:** HIGH | **Effort:** 1-2 hours

### 5a. `AudioSessionComponent` (`src/app/audio/audio-session.component.ts`)

Uses `OnDestroy` with manual `Subscription` tracking (lines 1022, 1114, 1425-1429).

```typescript
// Before:
private subscription = new Subscription();
ngOnDestroy() { this.subscription.unsubscribe(); }

// After:
private destroyRef = inject(DestroyRef);
// In constructor/init:
someObservable$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(...);
```

### 5b. `AppShellComponent` (`src/app/app-shell.component.ts:L529`)

Constructor subscribes to `route.paramMap` with no cleanup at all — no `OnDestroy`, no `takeUntilDestroyed`.

```typescript
// Before:
constructor() {
  this.route.paramMap.subscribe(params => { ... });
}

// After:
constructor() {
  toSignal(this.route.paramMap); // or:
  this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => { ... });
}
```

---

## 6. Replace `ngModel` with Reactive Forms in Admin (LOW priority)

**Confidence:** MEDIUM | **Effort:** 3-4 hours

**File:** `src/app/admin/admin.component.ts`

The entire admin settings form uses `[(ngModel)]` bindings. Project rules prefer reactive forms. Consider migrating to `FormGroup`/`FormControl` with typed forms.

Also applies to `campaign-selector.component.ts` (`newCampaignName`, `newCampaignDescription`).

**Note:** This is lower priority — the current implementation works, but doesn't follow the project convention.

---

## 7. Remove `CommonModule` Import

**Confidence:** LOW | **Effort:** 5 minutes

**File:** `src/app/chat/chat.component.ts`

`CommonModule` is imported but unnecessary in Angular 21 standalone components using native control flow (`@if`, `@for`). Remove the import.

---

## Checklist

- [ ] Remove `standalone: true` from 9 components
- [ ] Add `OnPush` to 6 components
- [ ] Migrate `audio-upload.component.ts` to `input()`/`output()`
- [ ] Migrate `session-story.component.ts` to `input()`/`output()` + replace `OnChanges` with `computed()`
- [ ] Replace `[ngClass]` with `[class]` in `admin.component.ts`
- [ ] Replace manual subscriptions in `audio-session.component.ts` with `takeUntilDestroyed()`
- [ ] Fix subscription leak in `app-shell.component.ts`
- [ ] Remove `CommonModule` from `chat.component.ts`
- [ ] (Optional) Migrate admin form to reactive forms
- [ ] Run build (`npm run build`) and verify no regressions
