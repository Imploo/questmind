# AI Request Queue & Model Fallback System

## Overview

Implement a robust queue system with model fallback to handle Gemini API unavailability, rate limiting, and service overload. This system will ensure requests don't fail permanently when the primary model (Gemini 2.5 Flash) is unavailable, and will queue requests during outages for automatic retry.

**Status:** 📋 Planned  
**Priority:** P1 - High (User Experience & Reliability)  
**Effort:** ~8-12 hours  
**Related Issues:** Frequent Gemini 2.5 Flash unavailability (503 errors)

## Current State

### Existing Retry Logic

- ✅ `audio-session.service.ts` has basic retry with exponential backoff
- ✅ Detects overload errors (503, UNAVAILABLE)
- ❌ `chat.service.ts` has NO retry logic
- ❌ No model fallback when primary model is down
- ❌ No persistent queue for failed requests
- ❌ No circuit breaker to prevent cascading failures

### Current Issues

1. **Gemini 2.5 Flash frequently unavailable** → User requests fail immediately
2. **No fallback models** → Service appears completely broken
3. **Chat service lacks retry** → Single-attempt failures
4. **No request queuing** → Work is lost on failure
5. **Poor user feedback** → Generic error messages don't explain availability issues

## Key Requirements

### 1. **Model Fallback System**

Automatically try alternative models when the primary model fails:

**Fallback Chain:**

```
gemini-2.5-flash (primary)
  ↓ (on 503/unavailable)
gemini-1.5-flash (fallback 1)
  ↓ (on 503/unavailable)
gemini-1.5-pro (fallback 2)
  ↓ (all failed)
Queue for retry
```

**Requirements:**

- Configure model priorities and capabilities
- Track which models are currently available
- Switch models automatically on specific errors (503, 429, UNAVAILABLE)
- Log fallback usage for monitoring
- Maintain context/quality when switching models
- Allow per-request-type model preferences (e.g., transcription vs chat)

**Configuration:**

```ts
interface ModelConfig {
  name: string;
  priority: number; // Lower = higher priority
  capabilities: string[]; // ['chat', 'transcription', 'story-generation']
  costMultiplier: number; // For tracking/budgeting
  maxTokens: number;
  status: 'available' | 'unavailable' | 'degraded';
  lastFailure?: Date;
  consecutiveFailures: number;
}
```

### 2. **Request Queue System**

Persistent queue that stores failed requests for automatic retry:

**Queue Features:**

- Store requests in IndexedDB for persistence across page reloads
- Retry queued requests automatically when service recovers
- Support priority levels (user-initiated vs background)
- Configurable retry policies (max attempts, backoff strategy)
- Queue size limits to prevent memory issues
- Automatic cleanup of old/expired requests

**Queue Data Structure:**

```ts
interface QueuedRequest {
  id: string;
  userId: string;
  type: 'chat' | 'transcription' | 'story-generation';
  payload: any;
  model: string; // Original model requested
  attemptedModels: string[]; // Models already tried
  priority: number;
  status: 'queued' | 'retrying' | 'failed' | 'completed';
  createdAt: Date;
  lastAttempt?: Date;
  attempts: number;
  maxAttempts: number;
  error?: string;
  userNotified: boolean;
}
```

**Queue Operations:**

```ts
interface QueueService {
  // Add request to queue
  enqueue(request: QueuedRequest): Promise<void>;

  // Process next request(s) from queue
  processQueue(): Promise<void>;

  // Get user's queued requests
  getUserQueue(userId: string): QueuedRequest[];

  // Cancel a queued request
  cancel(requestId: string): Promise<void>;

  // Retry failed request immediately
  retryNow(requestId: string): Promise<void>;

  // Clear completed/expired requests
  cleanup(): Promise<void>;
}
```

### 3. **Circuit Breaker Pattern**

Temporarily stop making requests after repeated failures:

**Circuit States:**

- **CLOSED**: Normal operation, requests go through
- **OPEN**: Too many failures, requests queued immediately
- **HALF_OPEN**: Testing if service recovered

**Configuration:**

```ts
interface CircuitBreakerConfig {
  failureThreshold: number; // Failures before opening (default: 5)
  successThreshold: number; // Successes to close from half-open (default: 2)
  timeout: number; // Time to wait before half-open (default: 60000ms)
  monitoringWindow: number; // Time window for counting failures (default: 120000ms)
}
```

**Per-Model Circuit Breakers:**

- Track circuit state independently for each model
- Open circuit → skip model in fallback chain
- Half-open → allow test request to check recovery
- Closed → model available in normal rotation

### 4. **Enhanced Retry Strategy**

Improve existing retry logic:

**Exponential Backoff:**

- Initial delay: 1.5s
- Max delay: 30s
- Jitter: ±500ms random
- Max attempts: 3-5 (configurable)

**Intelligent Retry Decisions:**

```ts
interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  nextModel?: string; // If fallback recommended
  queueForLater: boolean; // If immediate retry not advised
  reason: string;
}
```

**Retry Logic by Error Type:**

```
429 (Rate Limit)     → Exponential backoff, try same model
503 (Overloaded)     → Immediate fallback to next model
500 (Server Error)   → Short delay, try same model once, then fallback
401/403 (Auth)       → Don't retry, show config error
400 (Bad Request)    → Don't retry, show user error
Network Error        → Exponential backoff, try same model
```

### 5. **User Experience Improvements**

**Status Communication:**

- Show which model is being used
- Indicate when falling back to alternative model
- Display queue status ("Your request is queued, position: 3")
- Show retry countdown timers
- Provide manual retry buttons

**UI Components:**

```ts
// Queue Status Indicator
interface QueueStatus {
  active: boolean;
  position?: number;
  estimatedWaitTime?: number;
  currentModel?: string;
  message: string;
}

// Request Status Badge
<app-request-status
  [status]="'retrying'"
  [model]="'gemini-1.5-flash'"
  [attempt]="2"
  [maxAttempts]="5">
</app-request-status>
```

**Error Messages:**

- ✅ "Gemini 2.5 Flash is currently unavailable. Using Gemini 1.5 Flash instead."
- ✅ "All models are busy. Your request has been queued and will complete automatically."
- ✅ "Service temporarily unavailable. Retrying in 5 seconds... (Attempt 2 of 5)"
- ❌ ~~"AI service error. Please try again later."~~ (too vague)

### 6. **Monitoring & Observability**

Track system health and model availability:

```ts
interface ModelMetrics {
  modelName: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  avgResponseTime: number;
  lastAvailable: Date;
  lastUnavailable?: Date;
  currentStatus: 'available' | 'unavailable' | 'degraded';
}

interface QueueMetrics {
  queuedRequests: number;
  processingRequests: number;
  completedToday: number;
  failedToday: number;
  avgQueueTime: number;
  oldestRequest?: Date;
}
```

**Logging:**

- Log all model fallbacks with reason
- Log circuit breaker state changes
- Log queue operations (enqueue, process, complete)
- Track request lifecycle for debugging

## Technical Implementation

### Service Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Application Layer                   │
│          (ChatComponent, AudioSessionComponent)      │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│              AI Request Orchestrator                 │
│  - Receives all AI requests                          │
│  - Determines model selection                        │
│  - Handles fallback logic                            │
│  - Queues failed requests                            │
└────┬────────────────┬────────────────┬───────────────┘
     │                │                │
┌────▼─────┐   ┌──────▼──────┐  ┌─────▼──────────┐
│  Model   │   │   Circuit   │  │  Request Queue │
│ Manager  │   │   Breaker   │  │    Service     │
└──────────┘   └─────────────┘  └────────────────┘
```

### New Services

#### 1. **AI Request Service** (`ai-request.service.ts`)

Central service for all AI operations:

```ts
@Injectable({ providedIn: 'root' })
export class AIRequestService {
  sendRequest<T>(config: AIRequestConfig): Observable<T> {
    // 1. Check circuit breaker
    // 2. Select best available model
    // 3. Try request with retry logic
    // 4. On failure, try fallback models
    // 5. If all fail, queue for later
    // 6. Return result or queued status
  }

  generateChat(message: string, context?: any): Observable<string> {
    return this.sendRequest({
      type: 'chat',
      payload: { message, context },
      preferredModel: 'gemini-2.5-flash',
    });
  }

  transcribeAudio(file: File): Observable<TranscriptionResult> {
    return this.sendRequest({
      type: 'transcription',
      payload: { file },
      preferredModel: 'gemini-2.5-flash',
    });
  }

  generateStory(transcript: string, metadata: any): Observable<string> {
    return this.sendRequest({
      type: 'story-generation',
      payload: { transcript, metadata },
      preferredModel: 'gemini-2.5-flash',
    });
  }
}
```

#### 2. **Model Manager Service** (`model-manager.service.ts`)

Manages model availability and selection:

```ts
@Injectable({ providedIn: 'root' })
export class ModelManagerService {
  private models = signal<ModelConfig[]>([...]);

  getAvailableModel(
    type: RequestType,
    excludeModels: string[] = []
  ): ModelConfig | null {
    // Return highest priority available model
  }

  markModelUnavailable(modelName: string, reason: string): void {
    // Update model status and notify circuit breaker
  }

  markModelAvailable(modelName: string): void {
    // Update model status
  }

  recordSuccess(modelName: string, responseTime: number): void {
    // Update metrics
  }

  recordFailure(modelName: string, error: any): void {
    // Update metrics and check if should mark unavailable
  }
}
```

#### 3. **Request Queue Service** (`request-queue.service.ts`)

Manages persistent request queue:

```ts
@Injectable({ providedIn: 'root' })
export class RequestQueueService {
  private queue = signal<QueuedRequest[]>([]);
  private processing = false;

  async enqueue(request: QueuedRequest): Promise<void> {
    // Add to IndexedDB and signal
    // Start processing if not already running
  }

  async processQueue(): Promise<void> {
    // Process queued requests in order
    // Respect priority and rate limits
    // Update request status
  }

  getUserQueue(userId: string): Observable<QueuedRequest[]> {
    // Return user's queued requests
  }

  async retryRequest(requestId: string): Promise<void> {
    // Retry specific request immediately
  }

  observeRequest(requestId: string): Observable<QueuedRequest> {
    // Watch request status changes
  }
}
```

#### 4. **Circuit Breaker Service** (`circuit-breaker.service.ts`)

Implements circuit breaker pattern:

```ts
@Injectable({ providedIn: 'root' })
export class CircuitBreakerService {
  private circuits = new Map<string, CircuitState>();

  async execute<T>(modelName: string, operation: () => Promise<T>): Promise<T> {
    const circuit = this.getCircuit(modelName);

    if (circuit.state === 'OPEN') {
      throw new Error(`Circuit breaker open for ${modelName}`);
    }

    try {
      const result = await operation();
      this.recordSuccess(modelName);
      return result;
    } catch (error) {
      this.recordFailure(modelName);
      throw error;
    }
  }

  getCircuitState(modelName: string): CircuitState {
    // Return current circuit state
  }

  reset(modelName: string): void {
    // Manually reset circuit
  }
}
```

### Storage Layer

**IndexedDB Schema** for queue persistence:

```ts
// Database: questmind-ai-queue
// Store: requests
interface StoredRequest {
  id: string; // Primary key
  userId: string; // Indexed
  type: string; // Indexed
  status: string; // Indexed
  priority: number;
  createdAt: number; // Indexed (for cleanup)
  payload: string; // JSON serialized
  metadata: string; // JSON serialized
}
```

**Firestore** for cross-device sync (optional future enhancement):

```
/users/{userId}/queuedRequests/{requestId}
  - Similar structure to IndexedDB
  - Syncs across devices
  - Can show queue on mobile/other devices
```

### Integration with Existing Services

**Refactor ChatService:**

```ts
export class ChatService {
  constructor(private aiRequest: AIRequestService) {}

  sendMessage(userMessage: string): Observable<string> {
    return this.aiRequest.generateChat(userMessage, {
      history: this.conversationHistory,
      systemPrompt: this.SYSTEM_CONTEXT,
    });
  }
}
```

**Refactor AudioSessionService:**

```ts
export class AudioSessionService {
  constructor(private aiRequest: AIRequestService, private queue: RequestQueueService) {}

  transcribeAudio(file: File): Observable<TranscriptionResult> {
    return this.aiRequest.transcribeAudio(file);
  }

  generateStory(transcript: string, metadata: any): Observable<string> {
    return this.aiRequest.generateStory(transcript, metadata);
  }

  // Show user's queued transcriptions
  getQueuedTranscriptions(): Observable<QueuedRequest[]> {
    return this.queue
      .getUserQueue(this.userId)
      .pipe(map((requests) => requests.filter((r) => r.type === 'transcription')));
  }
}
```

### UI Components

#### Queue Status Component

```ts
@Component({
  selector: 'app-queue-status',
  template: `
    <div class="queue-status" *ngIf="queueStatus() as status">
      <div class="status-icon">⏳</div>
      <div class="status-text">
        <p>{{ status.message }}</p>
        <p *ngIf="status.position" class="text-sm text-gray-600">
          Position in queue: {{ status.position }}
        </p>
        <p *ngIf="status.estimatedWaitTime" class="text-sm text-gray-600">
          Estimated wait: {{ status.estimatedWaitTime }}s
        </p>
      </div>
      <button (click)="cancelRequest()" class="btn-cancel">Cancel</button>
    </div>
  `,
})
export class QueueStatusComponent {
  queueStatus = input.required<QueueStatus>();
  cancelRequest = output<void>();
}
```

#### Model Status Indicator

```ts
@Component({
  selector: 'app-model-status',
  template: `
    <div class="model-status" [class.fallback]="isFallback()">
      <span class="model-name">{{ modelName() }}</span>
      <span *ngIf="isFallback()" class="badge-fallback">Fallback</span>
    </div>
  `,
})
export class ModelStatusComponent {
  modelName = input.required<string>();
  isFallback = input<boolean>(false);
}
```

## Configuration

### Environment Variables

```ts
export const environment = {
  // ... existing config

  aiConfig: {
    models: [
      {
        name: 'gemini-2.5-flash',
        priority: 1,
        capabilities: ['chat', 'transcription', 'story-generation'],
      },
      {
        name: 'gemini-1.5-flash',
        priority: 2,
        capabilities: ['chat', 'transcription', 'story-generation'],
      },
      {
        name: 'gemini-1.5-pro',
        priority: 3,
        capabilities: ['chat', 'transcription', 'story-generation'],
      },
    ],
    queue: {
      maxSize: 100,
      maxRequestAge: 24 * 60 * 60 * 1000, // 24 hours
      processInterval: 5000, // Check queue every 5s
      priorityLevels: ['immediate', 'high', 'normal', 'low'],
    },
    retry: {
      maxAttempts: 5,
      baseDelay: 1500,
      maxDelay: 30000,
      jitter: 500,
    },
    circuitBreaker: {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
      monitoringWindow: 120000,
    },
  },
};
```

## Testing Strategy

### Unit Tests

- Model selection logic
- Circuit breaker state transitions
- Retry delay calculations
- Queue operations (enqueue, dequeue, priority)

### Integration Tests

- Full request flow with fallbacks
- Queue persistence across page reloads
- Circuit breaker preventing excessive requests
- Multiple concurrent requests

### E2E Tests

- User initiates chat request → fallback → success
- User initiates transcription → all models fail → queued → eventual success
- Circuit breaker opens → requests queued immediately
- Queue status displays correctly in UI

### Mock Testing

- Simulate 503 errors from different models
- Test circuit breaker transitions
- Verify queue processing order

## Migration Path

### Phase 1: Core Infrastructure (3-4 hours)

- [ ] Create AIRequestService with basic model fallback
- [ ] Create ModelManagerService with model tracking
- [ ] Create CircuitBreakerService with basic implementation
- [ ] Add unit tests for core logic

### Phase 2: Queue System (3-4 hours)

- [ ] Create RequestQueueService with IndexedDB
- [ ] Implement queue processing logic
- [ ] Add queue status UI components
- [ ] Test queue persistence

### Phase 3: Integration (2-3 hours)

- [ ] Refactor ChatService to use AIRequestService
- [ ] Refactor AudioSessionService to use AIRequestService
- [ ] Update UI components to show model status
- [ ] Add error handling and user feedback

### Phase 4: Polish & Monitoring (1-2 hours)

- [ ] Add comprehensive logging
- [ ] Add metrics collection
- [ ] Add admin/debug view for queue status
- [ ] Documentation and examples

## Success Criteria

- [ ] Requests automatically fallback to alternative models on 503 errors
- [ ] Failed requests are queued and retried automatically
- [ ] Circuit breaker prevents excessive requests to failing models
- [ ] Queue persists across page reloads (IndexedDB)
- [ ] Users see clear status messages about model usage and queue position
- [ ] Chat requests have retry logic (currently missing)
- [ ] Transcription requests benefit from enhanced retry strategy
- [ ] Zero data loss - all requests either complete or are queued
- [ ] Metrics show reduced user-facing errors
- [ ] System degrades gracefully when all models unavailable

## Metrics & KPIs

Track these metrics to measure success:

- **Request Success Rate**: % of requests that complete successfully
- **Fallback Rate**: % of requests using fallback models
- **Queue Usage**: Average queue size and wait time
- **Circuit Breaker Triggers**: How often circuits open
- **Model Availability**: Uptime per model
- **User-Facing Errors**: Errors shown to users (should decrease)
- **Request Completion Time**: Total time from request to completion

## Future Enhancements (Out of Scope)

- Multi-device queue sync via Firestore
- Request prioritization based on user tier/plan
- Smart model selection based on request complexity
- Cost optimization (prefer cheaper models when possible)
- Batch processing of queued requests
- Background sync for offline requests
- Request cancellation and modification
- Queue analytics dashboard

## Dependencies

- ✅ Existing Firebase and Gemini API setup
- ✅ Angular signals for reactive state
- ✅ RxJS for observables
- 📦 NEW: IndexedDB library (e.g., `idb` or `dexie.js`)
- 📦 NEW: Circuit breaker utility (or custom implementation)

## Estimated Complexity

**High** - Requires:

- Sophisticated state management (queue, circuit breaker, model status)
- Persistent storage (IndexedDB)
- Complex error handling and retry logic
- Coordinated refactoring of multiple services
- Comprehensive testing of failure scenarios
- UI updates for status communication
- Careful consideration of edge cases (queue full, very old requests, etc.)

## Related Documentation

- [Ticket 01: AI Chat Interface](./01-ai-powered-chat-interface.md) - Will benefit from retry logic
- [Ticket 07: Audio Transcription](./07-audio-session-transcription.md) - Will benefit from queue system
- [Google Gemini API Docs](https://ai.google.dev/gemini-api/docs)
- [Circuit Breaker Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
