# Extract Shared Formatting Service

**Priority:** CRITICAL
**Estimated Effort:** 2 hours
**Code Review Issue:** #6, #7, #8

## Problem

Three utility functions are duplicated across `AudioSessionComponent` and `PodcastLibraryComponent`:
- `formatDuration()` - 2 occurrences
- `formatFileSize()` - 2 occurrences
- `formatDate()` - 2 occurrences (24 lines each)

**Total Duplication:** ~50 lines of code

## Current Locations

**formatDuration:**
- `src/app/audio/audio-session.component.ts:934-939`
- `src/app/audio/podcast-library.component.ts:281-286`

**formatFileSize:**
- `src/app/audio/audio-session.component.ts:941-949`
- `src/app/audio/podcast-library.component.ts:288-296`

**formatDate:**
- `src/app/audio/audio-session.component.ts:951-974`
- `src/app/audio/podcast-library.component.ts:298-321`

## Solution

Create a shared formatting service to eliminate duplication.

### Implementation Steps

1. **Create FormattingService**

```typescript
// src/app/shared/formatting.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FormattingService {
  formatDuration(seconds?: number): string {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  }

  formatDate(date: unknown): string {
    if (!date) return '';
    let d: Date | null = null;

    if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'string' || typeof date === 'number') {
      d = new Date(date);
    } else if (typeof date === 'object') {
      const maybeTimestamp = date as { toDate?: () => Date; seconds?: number };
      if (typeof maybeTimestamp.toDate === 'function') {
        d = maybeTimestamp.toDate();
      } else if (typeof maybeTimestamp.seconds === 'number') {
        d = new Date(maybeTimestamp.seconds * 1000);
      }
    }

    if (!d || Number.isNaN(d.getTime())) return '';

    return d.toLocaleDateString('nl-NL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
```

2. **Update AudioSessionComponent**
   - Inject `FormattingService`
   - Remove duplicate methods
   - Update template to use `formatting.formatDuration()` etc.

3. **Update PodcastLibraryComponent**
   - Inject `FormattingService`
   - Remove duplicate methods
   - Update template to use service

### Testing

- Create unit tests for `FormattingService`
- Test edge cases (null, undefined, invalid dates)
- Verify both components work correctly after refactoring

## Benefits

- Single source of truth for formatting logic
- Easier to maintain and update
- Reduces code duplication by ~50 lines
- Can easily add new formatters (percentage, tokens, etc.)

## Related Issues

- Issue #9: generateId() duplication (can be added to shared utilities)
