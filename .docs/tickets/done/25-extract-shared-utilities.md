# Extract Shared Utility Services

**Priority:** CRITICAL
**Estimated Effort:** 3-4 hours
**Code Review Issue:** #9, #20
**Status:** Done
**Updated:** 2026-02-23

## Problem

Common utility functions are duplicated across multiple files:

### 1. generateId() - 2 occurrences with inconsistent implementations
- `audio-session-state.service.ts:201-206` - Uses `crypto.randomUUID()` with timestamp fallback
- `chat.component.ts:186-188` - Uses only timestamp-based generation

**Issue:** Inconsistent ID generation strategies could lead to collisions or unexpected behavior.

### 2. Console logging - 122 occurrences across 32 files (INCREASING)
Direct `console.log()`, `console.error()`, etc. calls without abstraction in:
- Frontend: 19 files (23 occurrences)
- Backend: 13 files (99 occurrences)

**Issue:** No centralized logging control, difficult to disable in production, no monitoring integration.

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
- `chat.component.ts:186-188` - Replace with `idGenerator.generateUuid()`
- `audio-session-state.service.ts:201-206` - Replace with `idGenerator.generateUuid()`

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

**Update throughout frontend:**
- Replace all `console.log()` with `logger.debug()`
- Replace all `console.info()` with `logger.info()`
- Replace all `console.warn()` with `logger.warn()`
- Replace all `console.error()` with `logger.error()`

#### 3. Create Backend Logger Utility

```typescript
// functions/src/utils/logger.ts
enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3
}

class Logger {
  private level: LogLevel = process.env.FUNCTIONS_EMULATOR === 'true'
    ? LogLevel.Debug
    : LogLevel.Info;

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
  }
}

export const logger = new Logger();
```

**Update throughout backend:**
- Import `logger` from `./utils/logger`
- Replace console calls same as frontend

### Priority Replacement Locations

#### Frontend (23 occurrences across 19 files)
Start with the most critical services:
1. `campaign-context.service.ts` (6 occurrences)
2. `audio-session.component.ts` (7 occurrences)
3. `audio-session-state.service.ts` (5 occurrences)
4. `audio-complete-processing.service.ts` (4 occurrences)
5. `campaign.service.ts` (4 occurrences)

#### Backend (99 occurrences across 13 files)
**Note:** Backend will need a separate Node.js logging utility (not Angular service):
1. `transcribe-audio-fast.ts` (13 occurrences)
2. `check-batch-status.ts` (14 occurrences)
3. `generate-podcast-audio.ts` (10 occurrences)
4. `kanka.service.ts` (7 occurrences)
5. `worker-queue.service.ts` (6 occurrences)

### Testing

**ID Generation:**
- Test UUID generation when crypto.randomUUID is available
- Test fallback ID generation
- Verify uniqueness across multiple calls

**Frontend Logging:**
- Test logging levels work correctly in development vs production
- Verify `environment.production` controls log levels
- Test error monitoring integration (when implemented)

**Backend Logging:**
- Test logging levels work correctly in emulator vs deployed
- Verify `FUNCTIONS_EMULATOR` environment variable controls log levels
- Test log output format

## Benefits

- **Single source of truth** for ID generation and logging across frontend and backend
- **Consistent ID generation** - eliminates inconsistency between components
- **Environment-aware logging** - production/emulator modes automatically suppress debug logs
- **Easy implementation changes** - switch to nanoid, winston, or other libraries from one place
- **Future-proof** for monitoring integration (Sentry, LogRocket, Cloud Logging)
- **Reduces duplication** - 122+ console calls standardized
- **Better debugging** - structured log levels make troubleshooting easier

## Implementation Order

1. **Create IdGeneratorService** (Frontend) - Quick win, minimal impact
2. **Create Logger utility** (Backend) - Higher impact, 99 occurrences
3. **Create LoggingService** (Frontend) - 23 occurrences
4. **Replace ID generation** (2 files) - Test thoroughly
5. **Replace console logs** (Backend first, then Frontend) - Can be done incrementally

## Future Enhancements

- Integrate with Firebase Cloud Logging for backend
- Add structured logging with request IDs for tracing
- Integrate with error monitoring (Sentry, LogRocket, etc.)
- Add timestamp formatting utilities
- Add retry/backoff utilities
- Add debounce/throttle utilities
- Add performance timing/profiling helpers
