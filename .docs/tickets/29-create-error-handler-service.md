# Create Centralized Error Handler Service

**Priority:** HIGH
**Estimated Effort:** 3 days
**Code Review Issue:** #3, #11

## Problem

Error handling is duplicated across services with similar patterns:
- `chat.service.ts:113-151` (39 lines)
- `audio-transcription.service.ts:732-765` (34 lines)
- `session-story.service.ts:182-219` (38 lines)
- `podcast-script.service.ts:190-227` (38 lines)

Each service reimplements:
- Status code mapping
- Error message generation
- Retry logic
- Special case handling (overloaded, rate limit, etc.)

## Current Pattern (Repeated)

```typescript
private handleError(error: any): Observable<never> {
  let errorMessage = 'Failed to generate...';
  const status = error?.status ?? error?.error?.status;

  if (status) {
    switch (status) {
      case 400: errorMessage = 'Invalid request...'; break;
      case 401: errorMessage = 'API key is invalid...'; break;
      case 403: errorMessage = 'Access forbidden...'; break;
      case 429: errorMessage = 'Rate limit exceeded...'; break;
      case 500: errorMessage = 'Service error...'; break;
      case 503: errorMessage = 'Service overloaded...'; break;
    }
  }

  if (isOverloadedError(error)) {
    errorMessage = 'The model is overloaded...';
  }

  return throwError(() => ({ status, message: errorMessage, error }));
}
```

## Solution

Create a centralized error handling service using Strategy Pattern.

### Implementation Steps

#### 1. Define Error Types

```typescript
// src/app/shared/errors/app-error.types.ts

export interface AppError {
  status: number;
  message: string;
  code?: string;
  context?: string;
  originalError?: any;
}

export interface ErrorContext {
  operation: string;
  service: string;
  additionalInfo?: Record<string, any>;
}
```

#### 2. Create Error Handler Interface

```typescript
// src/app/shared/errors/error-handler.interface.ts

export interface ErrorHandler {
  /**
   * Check if this handler can handle the error
   */
  canHandle(error: any): boolean;

  /**
   * Handle the error and return formatted error
   */
  handle(error: any, context?: ErrorContext): AppError;
}
```

#### 3. Implement Error Handlers

```typescript
// src/app/shared/errors/handlers/api-error.handler.ts

import { ErrorHandler } from '../error-handler.interface';
import { AppError, ErrorContext } from '../app-error.types';

export class ApiErrorHandler implements ErrorHandler {
  private readonly statusMessages = new Map<number, string>([
    [400, 'Invalid request sent to the service'],
    [401, 'API key is invalid or missing'],
    [403, 'Access forbidden'],
    [404, 'Resource not found'],
    [429, 'Rate limit exceeded. Please wait and try again'],
    [500, 'Service error. Please try again later'],
    [503, 'The service is overloaded. Please try again shortly']
  ]);

  canHandle(error: any): boolean {
    return !!this.extractStatus(error);
  }

  handle(error: any, context?: ErrorContext): AppError {
    const status = this.extractStatus(error);
    const message = this.getMessage(status, context);

    return {
      status,
      message,
      context: context?.operation,
      originalError: error
    };
  }

  private extractStatus(error: any): number {
    return error?.status ?? error?.error?.status ?? 0;
  }

  private getMessage(status: number, context?: ErrorContext): string {
    const baseMessage = this.statusMessages.get(status);

    if (!baseMessage) {
      return context?.operation
        ? `${context.operation} failed`
        : 'An error occurred';
    }

    return context?.operation
      ? `${context.operation}: ${baseMessage}`
      : baseMessage;
  }
}
```

```typescript
// src/app/shared/errors/handlers/network-error.handler.ts

import { ErrorHandler } from '../error-handler.interface';
import { AppError, ErrorContext } from '../app-error.types';

export class NetworkErrorHandler implements ErrorHandler {
  canHandle(error: any): boolean {
    return (
      error?.name === 'NetworkError' ||
      error?.message?.includes('Network') ||
      !navigator.onLine
    );
  }

  handle(error: any, context?: ErrorContext): AppError {
    return {
      status: 0,
      message: 'Network error. Please check your internet connection.',
      code: 'NETWORK_ERROR',
      context: context?.operation,
      originalError: error
    };
  }
}
```

```typescript
// src/app/shared/errors/handlers/overloaded-error.handler.ts

import { ErrorHandler } from '../error-handler.interface';
import { AppError, ErrorContext } from '../app-error.types';

export class OverloadedErrorHandler implements ErrorHandler {
  canHandle(error: any): boolean {
    const message = error?.message || '';
    const errorText = error?.error?.error?.message || '';

    return (
      message.includes('overloaded') ||
      message.includes('503') ||
      errorText.includes('overloaded') ||
      error?.status === 503
    );
  }

  handle(error: any, context?: ErrorContext): AppError {
    return {
      status: 503,
      message: 'The model is currently overloaded. Please try again in a few moments.',
      code: 'MODEL_OVERLOADED',
      context: context?.operation,
      originalError: error
    };
  }
}
```

```typescript
// src/app/shared/errors/handlers/validation-error.handler.ts

import { ErrorHandler } from '../error-handler.interface';
import { AppError, ErrorContext } from '../app-error.types';

export class ValidationErrorHandler implements ErrorHandler {
  canHandle(error: any): boolean {
    return error?.code === 'VALIDATION_ERROR' || error?.validationErrors;
  }

  handle(error: any, context?: ErrorContext): AppError {
    const validationErrors = error?.validationErrors || [];
    const message = validationErrors.length > 0
      ? `Validation failed: ${validationErrors.join(', ')}`
      : 'Validation error';

    return {
      status: 400,
      message,
      code: 'VALIDATION_ERROR',
      context: context?.operation,
      originalError: error
    };
  }
}
```

#### 4. Create Error Handler Service

```typescript
// src/app/shared/errors/error-handler.service.ts

import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { ErrorHandler } from './error-handler.interface';
import { AppError, ErrorContext } from './app-error.types';
import { ApiErrorHandler } from './handlers/api-error.handler';
import { NetworkErrorHandler } from './handlers/network-error.handler';
import { OverloadedErrorHandler } from './handlers/overloaded-error.handler';
import { ValidationErrorHandler } from './handlers/validation-error.handler';

@Injectable({ providedIn: 'root' })
export class ErrorHandlerService {
  private readonly handlers: ErrorHandler[] = [
    new ValidationErrorHandler(),
    new NetworkErrorHandler(),
    new OverloadedErrorHandler(),
    new ApiErrorHandler()
    // Add more handlers as needed
  ];

  /**
   * Handle an error and return formatted AppError
   */
  handleError(error: any, context?: ErrorContext): AppError {
    const handler = this.findHandler(error);
    return handler.handle(error, context);
  }

  /**
   * Handle an error and return Observable that throws
   */
  handleError$(error: any, context?: ErrorContext): Observable<never> {
    const appError = this.handleError(error, context);
    return throwError(() => appError);
  }

  /**
   * Register a custom error handler
   */
  registerHandler(handler: ErrorHandler): void {
    this.handlers.unshift(handler); // Add at beginning for priority
  }

  private findHandler(error: any): ErrorHandler {
    return (
      this.handlers.find(handler => handler.canHandle(error)) ||
      this.getDefaultHandler()
    );
  }

  private getDefaultHandler(): ErrorHandler {
    return {
      canHandle: () => true,
      handle: (error: any, context?: ErrorContext) => ({
        status: 500,
        message: context?.operation
          ? `${context.operation} failed`
          : 'An unexpected error occurred',
        originalError: error
      })
    };
  }
}
```

#### 5. Create Retry Strategy Service

```typescript
// src/app/shared/errors/retry-strategy.service.ts

import { Injectable } from '@angular/core';
import { Observable, timer } from 'rxjs';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

@Injectable({ providedIn: 'root' })
export class RetryStrategyService {
  private readonly defaultConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  };

  /**
   * Calculate retry delay with exponential backoff
   */
  getRetryDelay(error: any, retryCount: number, config?: Partial<RetryConfig>): number {
    const cfg = { ...this.defaultConfig, ...config };

    // Don't retry on client errors (4xx)
    const status = error?.status ?? 0;
    if (status >= 400 && status < 500 && status !== 429) {
      return -1; // Signal no retry
    }

    // Exponential backoff
    const delay = Math.min(
      cfg.baseDelay * Math.pow(cfg.backoffMultiplier, retryCount),
      cfg.maxDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;
    return delay + jitter;
  }

  /**
   * Check if error should be retried
   */
  shouldRetry(error: any, retryCount: number, maxAttempts: number = 3): boolean {
    if (retryCount >= maxAttempts) {
      return false;
    }

    const status = error?.status ?? 0;

    // Don't retry client errors except rate limit
    if (status >= 400 && status < 500 && status !== 429) {
      return false;
    }

    // Retry on server errors and network errors
    return status >= 500 || status === 429 || status === 0;
  }
}
```

#### 6. Update Services to Use Error Handler

```typescript
// Before
export class ChatService {
  private handleError(error: any): Observable<never> {
    let errorMessage = 'Failed to send message.';
    const status = error?.status ?? error?.error?.status;

    if (status) {
      switch (status) {
        case 400: errorMessage = 'Invalid request...'; break;
        // ... many more cases
      }
    }

    return throwError(() => ({ status, message: errorMessage, error }));
  }
}

// After
export class ChatService {
  constructor(private errorHandler: ErrorHandlerService) {}

  private handleError(error: any): Observable<never> {
    return this.errorHandler.handleError$(error, {
      operation: 'Send message',
      service: 'ChatService'
    });
  }
}
```

## Usage Example

```typescript
// In a service
@Injectable({ providedIn: 'root' })
export class TranscriptionService {
  constructor(
    private errorHandler: ErrorHandlerService,
    private retryStrategy: RetryStrategyService
  ) {}

  transcribe(file: File): Observable<TranscriptionResult> {
    return this.api.transcribe(file).pipe(
      retry({
        count: 3,
        delay: (error, retryCount) => {
          const delay = this.retryStrategy.getRetryDelay(error, retryCount);
          return delay > 0 ? timer(delay) : throwError(() => error);
        }
      }),
      catchError(error => this.errorHandler.handleError$(error, {
        operation: 'Transcribe audio',
        service: 'TranscriptionService',
        additionalInfo: { fileName: file.name }
      }))
    );
  }
}
```

## Testing

```typescript
describe('ErrorHandlerService', () => {
  let service: ErrorHandlerService;

  beforeEach(() => {
    service = new ErrorHandlerService();
  });

  it('should handle API errors', () => {
    const error = { status: 401 };
    const result = service.handleError(error, { operation: 'Login', service: 'AuthService' });

    expect(result.status).toBe(401);
    expect(result.message).toContain('API key');
  });

  it('should handle network errors', () => {
    const error = { name: 'NetworkError' };
    const result = service.handleError(error);

    expect(result.code).toBe('NETWORK_ERROR');
  });

  it('should handle overloaded errors', () => {
    const error = { status: 503, message: 'Model overloaded' };
    const result = service.handleError(error);

    expect(result.code).toBe('MODEL_OVERLOADED');
  });
});
```

## Migration Plan

1. Create error handling infrastructure
2. Update one service at a time:
   - ChatService
   - AudioTranscriptionService
   - SessionStoryService
   - PodcastScriptService
3. Test each migration
4. Remove old error handling code

## Benefits

- Single source of truth for error handling
- Extensible via Strategy Pattern (add handlers without modifying existing code)
- Consistent error messages across app
- Easy to add monitoring/logging
- Testable in isolation
- Reduces code duplication by ~150 lines

## Future Enhancements

- Integrate with error monitoring (Sentry, LogRocket)
- Add user-friendly error messages with actions
- Implement error recovery strategies
- Add error analytics
