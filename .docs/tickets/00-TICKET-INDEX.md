# QuestMind Refactoring Tickets - Index

**Generated from:** CODE_REVIEW.md
**Date:** 2026-02-03
**Total Issues:** 23 identified
**Total Tickets:** 11 created

## Overview

This index provides a quick reference to all refactoring tickets created from the comprehensive code review. Tickets are organized by priority and estimated effort.

---

## 🔴 Critical Priority (Week 1-4)

**Focus:** Foundation and immediate code quality improvements

| Ticket | Title | Effort | Lines Saved | Issues |
|--------|-------|--------|-------------|--------|
| [#23](./23-extract-shared-formatting-service.md) | Extract Shared Formatting Service | 2 hours | ~50 | #6, #7, #8 |
| [#24](./24-create-firebase-service.md) | Create Centralized Firebase Service | 3 hours | ~30 | #5, #10 |
| [#25](./25-extract-shared-utilities.md) | Extract Shared Utility Services | 2 hours | ~40 | #9, #20 |
| [#26](./26-split-audio-session-component.md) | Split AudioSessionComponent | 1 week | ~400 | #1, #13, #14 |
| [#27](./27-split-audio-transcription-service.md) | Split AudioTranscriptionService | 1 week | ~390 | #2 |

**Total Effort:** 2-3 weeks
**Total Lines Reduced:** ~910 lines

---

## 🟡 High Priority (Week 5-6)

**Focus:** Architecture patterns and separation of concerns

| Ticket | Title | Effort | Impact | Issues |
|--------|-------|--------|--------|--------|
| [#28](./28-implement-repository-pattern.md) | Implement Repository Pattern | 1 week | Decouples data access | #5, #22, #23 |
| [#29](./29-create-error-handler-service.md) | Create Error Handler Service | 3 days | ~150 lines saved | #3, #11 |
| [#30](./30-split-audio-session-record-interface.md) | Split AudioSessionRecord Interface | 3 days | Type safety | #4 |

**Total Effort:** 2-3 weeks
**Total Lines Reduced:** ~150 lines (+ architectural improvements)

---

## 🟢 Medium Priority (Week 7-8)

**Focus:** Code quality and consistency

| Ticket | Title | Effort | Key Improvements | Issues |
|--------|-------|--------|------------------|--------|
| [#31](./31-medium-priority-improvements.md) | Medium Priority Improvements | 1 week | Templates, constants, types | #13, #15-19 |

**Includes:**
- Extract inline templates to HTML
- Extract magic numbers to constants
- Replace manual subscriptions with DestroyRef
- Improve type safety (remove `any`)
- Standardize Signal/Observable usage

**Total Effort:** 1 week

---

## 🔵 Low Priority (Week 9-10)

**Focus:** Performance and optimization

| Ticket | Title | Effort | Key Benefits | Issues |
|--------|-------|--------|--------------|--------|
| [#32](./32-low-priority-optimizations.md) | Low Priority Optimizations | 1 week | Performance, state machine | #15, #21 |

**Includes:**
- Add OnPush change detection
- Lazy load audio module
- Implement state machine
- Remove dead code
- Add feature flags
- Add unit tests

**Total Effort:** 1 week

---

## 📋 Planning & Coordination

| Document | Purpose |
|----------|---------|
| [#33](./33-refactoring-roadmap.md) | Complete refactoring roadmap with phases |
| [CODE_REVIEW.md](../CODE_REVIEW.md) | Original comprehensive code review |

---

## Quick Reference: Issues by Category

### SOLID Principle Violations

| Issue | Ticket | Priority |
|-------|--------|----------|
| #1: AudioSessionComponent - God Component | #26 | Critical |
| #2: AudioTranscriptionService - Too Many Responsibilities | #27 | Critical |
| #3: Hardcoded Error Handling (OCP) | #29 | High |
| #4: AudioSessionRecord - Fat Interface (ISP) | #30 | High |
| #5: Direct Firebase Dependencies (DIP) | #24, #28 | Critical, High |

### DRY Violations

| Issue | Ticket | Priority |
|-------|--------|----------|
| #6: formatDuration() duplicated | #23 | Critical |
| #7: formatFileSize() duplicated | #23 | Critical |
| #8: formatDate() duplicated | #23 | Critical |
| #9: generateId() duplicated | #25 | Critical |
| #10: Firebase initialization duplicated | #24 | Critical |
| #11: Error handling duplicated | #29 | High |
| #12: Podcast playback logic duplicated | #26 | Critical |

### Angular Best Practices

| Issue | Ticket | Priority |
|-------|--------|----------|
| #13: Massive inline template | #31 | Medium |
| #14: Business logic in component | #26 | Critical |
| #15: No clear state machine | #32 | Low |
| #16: Manual subscription cleanup | #31 | Medium |
| #17: Mixed reactive paradigms | #31 | Medium |

### Code Quality

| Issue | Ticket | Priority |
|-------|--------|----------|
| #18: Magic numbers | #31 | Medium |
| #19: Loose `any` types | #31 | Medium |
| #20: Production console logs | #25 | Critical |
| #21: Dead code | #32 | Low |

### Architecture

| Issue | Ticket | Priority |
|-------|--------|----------|
| #22: No repository pattern | #28 | High |
| #23: No clear separation of concerns | #28 | High |

---

## Recommended Implementation Order

### Phase 1: Quick Wins (Week 1)
Start here for immediate impact with minimal risk:

1. #23: Extract Formatting Service (2 hours)
2. #25: Extract Utilities (2 hours)
3. #31: Extract Templates (1 day)
4. #31: Extract Constants (1 day)

**Total: 2-3 days, ~100 lines removed**

### Phase 2: Foundation (Week 1-2)

1. #24: Firebase Service (3 hours)
2. Continue #31: Medium priority items

### Phase 3: Data Layer (Week 3-4)

1. #29: Error Handler Service (3 days)
2. #28: Repository Pattern (1 week)

### Phase 4: Service Decomposition (Week 5-6)

1. #27: Split AudioTranscriptionService (1 week)
2. #30: Split AudioSessionRecord (3 days)

### Phase 5: Component Refactoring (Week 7-8)

1. #26: Split AudioSessionComponent (1 week)
2. Complete #31: Remaining medium priority

### Phase 6: Polish (Week 9-10)

1. #32: Low priority optimizations (1 week)

---

## Metrics Tracking

### Before Refactoring

| Metric | Value |
|--------|-------|
| Total Lines (TS) | ~6,500 |
| Largest Component | 942 lines |
| Largest Service | 990 lines |
| Code Duplication | ~150 lines |
| SOLID Violations | 23 |
| Avg Service Dependencies | 6-7 |

### After Refactoring (Target)

| Metric | Target |
|--------|--------|
| Total Lines (TS) | ~5,500 (-15%) |
| Largest Component | <300 lines |
| Largest Service | <250 lines |
| Code Duplication | <20 lines |
| SOLID Violations | <5 |
| Avg Service Dependencies | 1-2 |

---

## Notes

- Tickets are designed to be independent where possible
- Dependencies are clearly marked in each ticket
- Each ticket includes:
  - Problem description
  - Proposed solution
  - Implementation steps
  - Testing strategy
  - Expected benefits
- Estimated efforts are for experienced Angular developers
- Adjust timeline based on team capacity and priorities

---

## Getting Started

1. Read [#33: Refactoring Roadmap](./33-refactoring-roadmap.md)
2. Review [CODE_REVIEW.md](../CODE_REVIEW.md) for context
3. Start with Phase 1 quick wins (#23, #25, #31)
4. Follow the recommended implementation order
5. Update this index as tickets are completed

---

## 🚀 Feature Enhancement Tickets

| Ticket | Title | Priority | Status | Dependencies |
|--------|-------|----------|--------|--------------|
| [#34](./34-backend-podcast-script-generation.md) | Backend Podcast Script Generation with Database-Driven Model Selection | High | Draft | #19, #17 |
| [#35](./35-backend-transcription-and-story-generation.md) | Backend Audio Transcription and Story Generation with Configurable AI Parameters | High | Draft | #34, #19 |
| [#36](./36-refactor-transcription-flow.md) | Refactor Transcription and Retranscription Flows (Worker Chain Architecture) | High | Open | - |
| [#37](./37-gemini-batch-api-transcription.md) | Simplified Transcription Flow with Gemini Batch API | High | Open | #14 |

**Key Features:**
- **Ticket 34**: Move podcast script generation to backend with Gemini 3 Flash
  - Fire-and-forget pattern
  - Database-driven model configuration
  - Secure API key handling

- **Ticket 35**: Move transcription and story generation to backend
  - Complete audio-to-podcast pipeline in one call
  - Configurable AI parameters (temperature, topK, topP) per feature
  - Feature-specific parameter tuning for quality
  - Unified fire-and-forget architecture

- **Ticket 36**: Worker chain architecture for transcription
  - Separate Cloud Functions for each stage
  - Independent retry logic and timeout handling
  - Cloud Tasks for worker communication
  - Comprehensive progress tracking

- **Ticket 37**: Simplified transcription using Gemini Batch API
  - Process audio files directly from GCS (no download/chunking)
  - Gemini handles large files natively
  - Callback-based result handling with polling fallback
  - Significantly reduced code complexity
  - Alternative to #36 if Gemini Batch API supports requirements

---

## 🗄️ Data Layer Cleanup Tickets

| Ticket | Title | Priority | Effort | Dependencies |
|--------|-------|----------|--------|--------------|
| [#38](./38-data-layer-critical-duplicates-cleanup.md) | Data Layer Critical Duplicates Cleanup (Phase 1) | Critical | 1 week | - |
| [#39](./39-data-layer-legacy-fields-removal.md) | Data Layer Legacy Fields Removal (Phase 2) | High | 2-3 days | #38 |
| [#40](./40-data-layer-optimization.md) | Data Layer Optimization (Phase 3) | Medium | 1 week | #38, #39 |

**Key Improvements:**
- **Ticket 38** (Phase 1): Remove critical duplicate fields
  - Merge duplicate `UserProfile` interfaces (2 versions exist!)
  - Remove file size duplicates (4 fields storing same data)
  - Remove transcription duplicates (flat vs nested)
  - Remove storage duplicates (flat vs nested)
  - **No migration needed** - alpha app, fresh start with new sessions
  - **Impact:** 18+ duplicate fields removed, data consistency improved

- **Ticket 39** (Phase 2): Remove legacy progress tracking fields
  - Remove `completeProcessingStatus`, `completeProcessingProgress`, etc.
  - Delete legacy `ProcessingProgress` interface
  - Keep only new `UnifiedProgress` from worker chain architecture
  - Run after #36 worker chain is stable in production
  - **No migration needed** - old sessions can be deleted
  - **Impact:** 4 legacy fields removed, cleaner progress tracking

- **Ticket 40** (Phase 3): Optional optimizations
  - Add Zod runtime validation schemas
  - Standardize timestamp handling (Date vs string)
  - Separate DTOs from domain models
  - Add Firestore indexes for performance
  - Improve TypeScript utility types
  - Document data access patterns
  - **Impact:** Better type safety, runtime validation, improved DX

**References:**
- See [DATA_LAYER_ANALYSIS.md](../DATA_LAYER_ANALYSIS.md) for complete analysis
- Includes Mermaid diagrams visualizing data relationships
- Documents all 18 duplicate/redundant fields found

---

## 🧹 Backend Technical Debt

| Ticket | Title | Priority | Status | Completed | Dependencies |
|--------|-------|----------|--------|-----------|--------------|
| [#41](./done/41-remove-enableKankaContext-from-frontend.md) | Remove enableKankaContext from Frontend Audio Upload | Medium | Done | 2026-02-07 | - |
| [#42](./done/42-implement-kanka-transcription-integration.md) | Implement Kanka Integration for Transcription (Phase 2) | Medium | Done | 2026-02-07 | #41 |

**Key Improvements:**
- **Ticket 41**: Single source of truth for campaign settings
  - Backend reads `settings.kankaEnabled` from campaign settings in Firestore
  - Frontend no longer passes hardcoded `enableKankaContext: false` parameter
  - Reduced frontend/backend coupling
  - Fixed hardcoded prompt string in batch transcription
  - Phase 1 complete - Phase 2 (actual Kanka integration) tracked in ticket #42

- **Ticket 42**: Complete Kanka integration for transcription
  - Created backend KankaService to fetch campaign entities from Kanka API
  - Integrated Kanka context fetching into fast and batch transcription endpoints
  - Transcription prompts now include campaign-specific entity names when enabled
  - Session document stores `kankaSearchResult` for reuse by story generation
  - Improved transcription accuracy for character names, locations, quests, and organizations
  - Fails with clear error when Kanka is enabled but unavailable (ensures reliable integration)

---

## 🎨 UX & Progress Tracking

| Ticket | Title | Priority | Status | Completed | Effort | Dependencies |
|--------|-------|----------|--------|-----------|--------|--------------|
| [#43](./done/43-consolidate-session-progress-tracking.md) | Consolidate and Simplify Session Progress Tracking | High | Done | 2026-02-07 | 1 week | #36, #39 |

**Key Improvements:**
- **Ticket 43**: Unified progress tracking system
  - Single `SessionProgress` object per session for ALL operations
  - New progress card component displayed at top of session details page
  - Tracks: upload, transcription (fast/batch), retranscription, story generation/regeneration, podcast generation
  - Removes scattered inline progress indicators from UI
  - Consolidates 4+ progress interfaces into 1 unified interface
  - Removes `TranscriptionStatusComponent` and inline progress in `SessionStoryComponent`, `PodcastLibraryComponent`
  - Backend writes to single `progress` field for all operations
  - Auto-hides progress card when idle or completed
  - Clear error states with retry functionality
  - **Lines reduced:** ~50-100 lines net, **Files deleted:** 1-2
  - **Benefits:** Single source of truth, consistent UX, simplified codebase, easier maintenance

---

## 📊 Observability & Monitoring

| Ticket | Title | Priority | Status | Effort | Dependencies |
|--------|-------|----------|--------|--------|--------------|
| [#44](./44-implement-sentry-error-logging.md) | Implement Sentry Error Logging for Frontend and Backend | High | Todo | 3-4 days | - |

**Key Improvements:**
- **Ticket 44**: Comprehensive error tracking and monitoring
  - Centralized error logging for Angular frontend and Cloud Functions backend
  - Real-time error alerts via email/Slack
  - Source maps for readable production stack traces
  - User context tracking (Firebase Auth integration)
  - Performance monitoring for components and functions
  - Breadcrumb tracking for user actions before errors
  - Environment-based filtering (dev/staging/prod)
  - Integration with Angular ErrorHandler and Cloud Functions error handling
  - **Benefits:** Real-time visibility into production errors, faster debugging, data-driven prioritization, improved user experience
  - **Related:** #3 (Hardcoded Error Handling), #29 (Error Handler Service)

---

## 🔄 Transcription Features

| Ticket | Title | Priority | Status | Completed | Effort | Dependencies |
|--------|-------|----------|--------|-----------|--------|--------------|
| [#45](./done/45-transcription-retry-and-retranscribe-buttons.md) | Enable Retry and Re-Transcribe Buttons for Failed/Completed Transcriptions | High | Done | 2026-02-07 | 2-3 days | #43 |

**Key Improvements:**
- **Ticket 45**: Retry and re-transcribe functionality
  - Retry button for failed transcriptions using `transcribeAudioFast`
  - Re-transcribe button for completed transcriptions using fast mode
  - User corrections dialog for improved accuracy (implemented as browser prompt)
  - Reuses existing `transcribeAudioFast` Cloud Function
  - Integrates with unified progress tracking system via Firestore subscriptions
  - Fire-and-forget pattern with real-time Firestore monitoring
  - Proper error handling and validation for all edge cases
  - **Benefits:** Recovery from failures without re-upload, iterative transcription improvement, reduced user frustration
  - **Related:** #43 (Consolidated Progress Tracking), #36 (Worker Chain Architecture)

---

## 📲 PWA & Background Processing

| Ticket | Title | Priority | Status | Effort | Dependencies |
|--------|-------|----------|--------|--------|--------------|
| [#46](./done/46-background-fetch-api-for-uploads.md) | Background Fetch API for Persistent File Uploads (PWA) | High | Done | 1-2 weeks | - |

**Key Improvements:**
- **Ticket 46**: Background Fetch API for persistent uploads
  - Full PWA setup (service worker, manifest, ngsw-config)
  - Audio uploads continue when screen locks, user switches apps, or closes tab
  - Signed URL approach: backend generates upload URLs, service worker handles upload via Background Fetch
  - New Cloud Functions: `generateSignedUploadUrl` and `finalizeUpload`
  - Native browser progress notification for ongoing uploads
  - Graceful fallback to `uploadBytesResumable` on unsupported browsers (Safari, Firefox)
  - Integrates with existing Firestore-based progress tracking
  - **Benefits:** Reliable uploads on mobile, app installable as PWA, no lost uploads from screen lock or app switch

---

---

## 🎵 Audio Processing

| Ticket | Title | Priority | Status | Effort | Dependencies |
|--------|-------|----------|--------|--------|--------------|
| [#47](./47-browser-audio-compression-before-upload.md) | Browser Audio Compression Before Upload | High | Todo | 3-5 days | #46 |

**Key Improvements:**
- **Ticket 47**: Compress audio in the browser before uploading to GCS
  - Reduces 300 MB recordings to ~50 MB using Web Audio API + MediaRecorder (Opus/WebM)
  - Zero new dependencies — fully browser-native
  - Mono, 32–64 kbps, 16 kHz sample rate
  - Compression progress shown to user before upload begins
  - Fallback to original file if compression fails
  - **Benefits:** ~6× smaller uploads, lower GCS costs, faster upload on mobile, reduced Gemini token consumption

---

## 🤖 AI Stack Refactoring

| Ticket | Title | Priority | Status | Effort | Dependencies |
|--------|-------|----------|--------|--------|--------------|
| [#48](./done/47-refactor-ai-stack-to-vertexai.md) | Refactor AI Stack naar Vertex AI + Claude Haiku | High | Done | 1–2 weken | #46 |

**Key Changes:**
- **Ticket 48**: Volledige AI stack refactor
  - `characterChat` → Claude Haiku 4.5 (Anthropic)
  - `generateImage` → Imagen 4 op Vertex AI (vervangt FAL.ai)
  - `generatePodcastAudio` → script via Haiku 4.5, audio via Chirp 3 HD (directe MP3 output, vervangt ElevenLabs)
  - Audio uploads → GCloud Storage bucket + `gs://` URI (vervangt Gemini Files API)
  - Nieuwe gedeelde `buildContextContents()` utility voor characterChat én generateImage

---

**Last Updated:** 2026-02-16
**Status:** Planning Complete, Ready to Begin
