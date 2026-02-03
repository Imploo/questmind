# Extract Shared Utility Services

**Priority:** CRITICAL
**Estimated Effort:** 2 hours
**Code Review Issue:** #9, #20

## Problem

Common utility functions are duplicated across multiple files:

### 1. generateId() - 3 occurrences
- `audio-session.component.ts:649-654`
- `audio-transcription.service.ts:783-788`
- `audio-session-state.service.ts:210-215`

### 2. Console logging - 40+ occurrences throughout codebase
Direct `console.log()`, `console.error()`, etc. calls without abstraction.

## Solution

Create shared utility services for common operations.

### Implementation Steps

#### 1. Create IdGeneratorService

```typescript
// src/app/shared/id-generator.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class IdGeneratorService {
  /**
   * Generate a UUID using crypto.randomUUID() if available,
   * otherwise falls back to timestamp-based ID
   */
  generateUuid(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Generate a short ID (for non-critical use cases)
   */
  generateShortId(): string {
    return Math.random().toString(36).slice(2, 11);
  }
}
```

**Update locations:**
- `AudioSessionComponent` - inject and use `idGenerator.generateUuid()`
- `AudioTranscriptionService` - inject and use `idGenerator.generateUuid()`
- `AudioSessionStateService` - inject and use `idGenerator.generateUuid()`

#### 2. Create LoggingService

```typescript
// src/app/shared/logging.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3
}

@Injectable({ providedIn: 'root' })
export class LoggingService {
  private level: LogLevel = environment.production ? LogLevel.Warn : LogLevel.Debug;

  debug(message: string, context?: any): void {
    if (this.level <= LogLevel.Debug) {
      console.log(`[DEBUG] ${message}`, context ?? '');
    }
  }

  info(message: string, context?: any): void {
    if (this.level <= LogLevel.Info) {
      console.info(`[INFO] ${message}`, context ?? '');
    }
  }

  warn(message: string, context?: any): void {
    if (this.level <= LogLevel.Warn) {
      console.warn(`[WARN] ${message}`, context ?? '');
    }
  }

  error(message: string, error?: Error, context?: any): void {
    console.error(`[ERROR] ${message}`, error ?? '', context ?? '');

    // In production, could send to monitoring service
    if (environment.production) {
      this.sendToMonitoring(message, error, context);
    }
  }

  private sendToMonitoring(message: string, error?: Error, context?: any): void {
    // TODO: Integrate with error monitoring service (e.g., Sentry)
    // For now, just ensure errors are logged
  }
}
```

**Update throughout codebase:**
- Replace all `console.log()` with `logger.debug()`
- Replace all `console.info()` with `logger.info()`
- Replace all `console.warn()` with `logger.warn()`
- Replace all `console.error()` with `logger.error()`

### Priority Replacement Locations

Start with the most critical services:
1. `audio-transcription.service.ts`
2. `audio-session-state.service.ts`
3. `session-story.service.ts`
4. `podcast-script.service.ts`
5. `campaign-context.service.ts`

### Testing

- Test ID generation uniqueness
- Test logging levels work correctly
- Verify production mode suppresses debug logs
- Test error monitoring integration (when implemented)

## Benefits

- Single source of truth for common utilities
- Easier to change implementation (e.g., switch to nanoid for IDs)
- Production logs can be controlled via environment
- Future-proof for monitoring integration
- Reduces duplication

## Future Enhancements

- Add timestamp formatting utilities
- Add retry/backoff utilities
- Add debounce/throttle utilities
- Integrate with error monitoring (Sentry, LogRocket, etc.)
