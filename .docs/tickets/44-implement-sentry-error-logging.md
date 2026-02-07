# Ticket #44: Implement Sentry Error Logging for Frontend and Backend

## Metadata

- **Created**: 2026-02-07
- **Priority**: High
- **Status**: Todo
- **Effort**: 3-4 days
- **Category**: Observability & Monitoring
- **Dependencies**: None
- **Related Issues**: #3, #29 (Error handling improvements)

---

## Description

Implement comprehensive error logging and monitoring using Sentry for both the Angular frontend application and backend Cloud Functions. This will provide centralized error tracking, real-time alerts, performance monitoring, and detailed debugging information to improve application reliability and development efficiency.

### Current State

**Problems:**
- No centralized error tracking across frontend and backend
- Console logs are ephemeral and not searchable
- No way to know when users encounter errors in production
- Limited context when debugging production issues
- No performance monitoring or bottleneck detection
- Errors are handled inconsistently (see Issue #3, #29)
- Cannot track error frequency or trends
- No alerting when critical errors occur

**Impact:**
- Slower debugging and issue resolution
- Poor visibility into production health
- User experience issues may go unnoticed
- Cannot prioritize fixes based on error frequency
- No historical error data for analysis

---

## Expected Result

### Frontend (Angular)
- All unhandled errors automatically captured and sent to Sentry
- Source maps uploaded for readable stack traces
- User context (Firebase Auth user ID, email) attached to errors
- Custom error boundaries for component-level error handling
- Breadcrumbs tracking user actions leading to errors
- Performance monitoring for slow components/routes
- Integration with Angular's ErrorHandler

### Backend (Cloud Functions)
- All function errors captured with full stack traces
- Function context (name, invocation ID, region) attached
- Request/response data logged (excluding sensitive info)
- Performance monitoring for function execution time
- Integration with existing error handling
- Separate projects/environments for dev/staging/prod

### General
- Sentry dashboard showing error trends and statistics
- Email/Slack alerts for critical errors
- Release tracking to correlate errors with deployments
- Environment-based filtering (development errors not sent to Sentry)
- Proper error grouping and deduplication
- Search and filtering by user, timestamp, environment, etc.

---

## Technical Details

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Sentry Dashboard                         │
│  (Centralized Error Tracking & Performance Monitoring)       │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
                ┌───────────┴───────────┐
                │                       │
        ┌───────▼─────┐         ┌──────▼──────┐
        │   Frontend   │         │   Backend    │
        │   (Angular)  │         │  (Functions) │
        └──────────────┘         └──────────────┘
```

### Technology Stack

- **Sentry SDK for Angular**: `@sentry/angular`
- **Sentry SDK for Node.js**: `@sentry/node`
- **Source Maps**: Generated and uploaded via Sentry CLI
- **Environment Configuration**: `.env` files and Firebase environment config
- **Integration**: Angular ErrorHandler, Cloud Functions error handling

---

## Implementation Plan

### Phase 1: Sentry Account & Project Setup (1-2 hours)

#### 1.1 Create Sentry Account
- Sign up at https://sentry.io
- Create organization (e.g., "QuestMind")

#### 1.2 Create Projects
Create separate projects for better organization:
- `questmind-frontend` (Platform: Angular)
- `questmind-backend` (Platform: Node.js)
- Optional: Separate environments (dev, staging, prod) or use environment tags

#### 1.3 Obtain DSN Keys
- Copy DSN (Data Source Name) for each project
- Store securely (will be added to environment variables)

---

### Phase 2: Frontend Integration (1 day)

#### 2.1 Install Dependencies

```bash
npm install @sentry/angular @sentry/tracing --save
```

#### 2.2 Create Sentry Configuration Service

**File**: `src/app/core/services/sentry.service.ts`

```typescript
import { Injectable, ErrorHandler } from '@angular/core';
import * as Sentry from '@sentry/angular';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SentryService {

  static init(): void {
    if (!environment.production || !environment.sentry.dsn) {
      console.log('Sentry disabled in development mode');
      return;
    }

    Sentry.init({
      dsn: environment.sentry.dsn,
      environment: environment.sentry.environment,
      release: environment.version,

      // Performance Monitoring
      tracesSampleRate: environment.sentry.tracesSampleRate,
      tracePropagationTargets: ['localhost', /^https:\/\/yourbackend\.cloudfunctions\.net/],

      // Error filtering
      ignoreErrors: [
        // Browser extensions
        'top.GLOBALS',
        'canvas.contentDocument',
        'MyApp_RemoveAllHighlights',
        // Network errors that are not actionable
        'NetworkError',
        'Non-Error promise rejection captured',
      ],

      // Breadcrumbs
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],

      // Session replay sample rate
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,

      // Enhanced error context
      beforeSend(event, hint) {
        // Don't send errors in development
        if (!environment.production) {
          return null;
        }

        // Add custom context
        event.contexts = {
          ...event.contexts,
          app: {
            version: environment.version,
            buildTime: environment.buildTime,
          }
        };

        return event;
      },
    });
  }

  setUser(userId: string, email?: string, username?: string): void {
    Sentry.setUser({
      id: userId,
      email: email,
      username: username,
    });
  }

  clearUser(): void {
    Sentry.setUser(null);
  }

  addBreadcrumb(message: string, category: string, level: Sentry.SeverityLevel = 'info', data?: Record<string, any>): void {
    Sentry.addBreadcrumb({
      message,
      category,
      level,
      data,
      timestamp: Date.now() / 1000,
    });
  }

  captureException(error: Error, context?: Record<string, any>): void {
    Sentry.captureException(error, {
      extra: context,
    });
  }

  captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>): void {
    Sentry.captureMessage(message, {
      level,
      extra: context,
    });
  }
}
```

#### 2.3 Create Custom Error Handler

**File**: `src/app/core/handlers/global-error.handler.ts`

```typescript
import { ErrorHandler, Injectable, inject } from '@angular/core';
import * as Sentry from '@sentry/angular';
import { SentryService } from '../services/sentry.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private sentryService = inject(SentryService);

  handleError(error: Error | any): void {
    // Log to console for development
    console.error('Global error caught:', error);

    // Extract meaningful error message
    const errorMessage = error?.message || error?.toString() || 'Unknown error';

    // Capture in Sentry
    this.sentryService.captureException(error instanceof Error ? error : new Error(errorMessage), {
      originalError: error,
      errorType: error?.constructor?.name,
    });

    // Optionally show user-friendly error notification
    // this.notificationService.showError('An unexpected error occurred');
  }
}
```

#### 2.4 Update App Configuration

**File**: `src/app/app.config.ts`

```typescript
import { ApplicationConfig, ErrorHandler } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { GlobalErrorHandler } from './core/handlers/global-error.handler';
import { SentryService } from './core/services/sentry.service';
import * as Sentry from '@sentry/angular';

// Initialize Sentry before app bootstrap
SentryService.init();

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    {
      provide: ErrorHandler,
      useClass: GlobalErrorHandler,
    },
    {
      provide: Sentry.TraceService,
      deps: [],
    },
  ],
};
```

#### 2.5 Update Environment Files

**File**: `src/environments/environment.ts` (development)

```typescript
export const environment = {
  production: false,
  version: '1.0.0-dev',
  buildTime: new Date().toISOString(),
  sentry: {
    dsn: '', // Empty in development - errors not sent
    environment: 'development',
    tracesSampleRate: 0,
  },
  // ... other config
};
```

**File**: `src/environments/environment.prod.ts` (production)

```typescript
export const environment = {
  production: true,
  version: '1.0.0', // Should be replaced during build
  buildTime: '{{BUILD_TIME}}', // Should be replaced during build
  sentry: {
    dsn: 'https://YOUR_SENTRY_DSN@sentry.io/YOUR_PROJECT_ID',
    environment: 'production',
    tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
  },
  // ... other config
};
```

#### 2.6 Track User Context

**File**: `src/app/core/services/auth.service.ts` (modify existing)

```typescript
// Add to AuthService after successful login
import { inject } from '@angular/core';
import { SentryService } from './sentry.service';

export class AuthService {
  private sentryService = inject(SentryService);

  // ... existing code

  private onAuthStateChanged(user: User | null): void {
    if (user) {
      // Set user context in Sentry
      this.sentryService.setUser(
        user.uid,
        user.email || undefined,
        user.displayName || undefined
      );
    } else {
      // Clear user context on logout
      this.sentryService.clearUser();
    }
    // ... rest of auth logic
  }
}
```

#### 2.7 Add Breadcrumbs for User Actions

Add breadcrumbs in key user flows:

```typescript
// Example: Audio session creation
createSession(file: File): void {
  this.sentryService.addBreadcrumb(
    'Creating audio session',
    'user-action',
    'info',
    { fileName: file.name, fileSize: file.size }
  );
  // ... rest of logic
}
```

#### 2.8 Configure Source Maps Upload

**File**: `angular.json` (modify production build)

```json
{
  "projects": {
    "questmind": {
      "architect": {
        "build": {
          "configurations": {
            "production": {
              "sourceMap": {
                "scripts": true,
                "styles": false,
                "hidden": true
              }
            }
          }
        }
      }
    }
  }
}
```

**File**: `.sentryclirc` (create in project root)

```ini
[defaults]
project=questmind-frontend
org=your-org-name

[auth]
token=YOUR_SENTRY_AUTH_TOKEN
```

**Add to `package.json` scripts:**

```json
{
  "scripts": {
    "build:prod": "ng build --configuration production",
    "sentry:sourcemaps": "sentry-cli releases files $npm_package_version upload-sourcemaps ./dist/questmind --rewrite",
    "deploy:prod": "npm run build:prod && npm run sentry:sourcemaps"
  }
}
```

---

### Phase 3: Backend Integration (1 day)

#### 3.1 Install Dependencies

```bash
cd backend
npm install @sentry/node @sentry/profiling-node --save
```

#### 3.2 Create Sentry Configuration

**File**: `backend/src/config/sentry.config.ts`

```typescript
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

export function initSentry(): void {
  const environment = process.env.NODE_ENV || 'development';
  const sentryDsn = process.env.SENTRY_DSN;

  if (!sentryDsn) {
    console.log('Sentry DSN not configured - error tracking disabled');
    return;
  }

  if (environment === 'development') {
    console.log('Sentry disabled in development mode');
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: environment,
    release: process.env.RELEASE_VERSION || 'unknown',

    // Performance monitoring
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),

    // Integrations
    integrations: [
      new ProfilingIntegration(),
    ],

    // Enhanced context
    beforeSend(event, hint) {
      // Don't send in development
      if (environment === 'development') {
        return null;
      }

      // Add Cloud Functions context
      event.contexts = {
        ...event.contexts,
        runtime: {
          name: 'Cloud Functions',
          version: process.version,
        },
      };

      return event;
    },
  });

  console.log(`Sentry initialized for environment: ${environment}`);
}
```

#### 3.3 Create Error Handler Utility

**File**: `backend/src/utils/error-handler.ts`

```typescript
import * as Sentry from '@sentry/node';
import { HttpsError } from 'firebase-functions/v2/https';

export function captureException(error: Error, context?: Record<string, any>): void {
  console.error('Error captured:', error);

  Sentry.captureException(error, {
    extra: context,
  });
}

export function captureFunctionError(
  functionName: string,
  error: Error,
  context?: Record<string, any>
): void {
  console.error(`[${functionName}] Error:`, error);

  Sentry.captureException(error, {
    tags: {
      functionName,
    },
    extra: context,
  });
}

export function handleHttpsError(
  error: unknown,
  functionName: string,
  defaultMessage: string = 'An error occurred'
): never {
  if (error instanceof HttpsError) {
    captureFunctionError(functionName, error);
    throw error;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const httpsError = new HttpsError('internal', `${defaultMessage}: ${errorMessage}`);

  captureFunctionError(functionName, httpsError, {
    originalError: error,
  });

  throw httpsError;
}
```

#### 3.4 Update Cloud Functions

**File**: `backend/src/index.ts`

```typescript
import { initSentry } from './config/sentry.config';
import * as Sentry from '@sentry/node';

// Initialize Sentry before function handlers
initSentry();

// Example: Wrap existing function
export const transcribeAudio = onCall(
  {
    timeoutSeconds: 540,
    memory: '2GiB',
  },
  async (request) => {
    // Start Sentry transaction for performance monitoring
    const transaction = Sentry.startTransaction({
      name: 'transcribeAudio',
      op: 'function.call',
    });

    try {
      // Add Sentry context
      Sentry.setContext('function', {
        name: 'transcribeAudio',
        userId: request.auth?.uid,
        sessionId: request.data.sessionId,
      });

      // Existing function logic
      const result = await processTranscription(request.data);

      transaction.setStatus('ok');
      return result;

    } catch (error) {
      transaction.setStatus('internal_error');

      // Capture error with context
      captureFunctionError('transcribeAudio', error as Error, {
        userId: request.auth?.uid,
        sessionId: request.data.sessionId,
        requestData: request.data,
      });

      throw error;

    } finally {
      transaction.finish();
    }
  }
);
```

#### 3.5 Update Environment Configuration

**File**: `backend/.env.development`

```env
NODE_ENV=development
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0
SENTRY_PROFILES_SAMPLE_RATE=0
```

**File**: `backend/.env.production`

```env
NODE_ENV=production
SENTRY_DSN=https://YOUR_BACKEND_SENTRY_DSN@sentry.io/YOUR_PROJECT_ID
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_PROFILES_SAMPLE_RATE=0.1
RELEASE_VERSION={{RELEASE_VERSION}}
```

**Set in Firebase Functions config:**

```bash
firebase functions:config:set \
  sentry.dsn="https://YOUR_BACKEND_SENTRY_DSN@sentry.io/YOUR_PROJECT_ID" \
  sentry.environment="production" \
  sentry.traces_sample_rate="0.1"
```

#### 3.6 Source Maps for Backend

**File**: `backend/tsconfig.json`

```json
{
  "compilerOptions": {
    "sourceMap": true,
    "inlineSources": true
  }
}
```

**Add to `backend/package.json` scripts:**

```json
{
  "scripts": {
    "build": "tsc",
    "sentry:sourcemaps": "sentry-cli releases files $npm_package_version upload-sourcemaps ./lib --rewrite",
    "deploy": "npm run build && npm run sentry:sourcemaps && firebase deploy --only functions"
  }
}
```

---

### Phase 4: Testing & Validation (0.5 days)

#### 4.1 Frontend Testing

**Test scenarios:**
1. Trigger unhandled exception in component
2. Trigger HTTP error in service
3. Verify source maps show correct file/line
4. Verify user context is attached
5. Verify breadcrumbs are captured
6. Test performance monitoring for slow routes

**Test code** (`src/app/test-error.component.ts`):

```typescript
import { Component, inject } from '@angular/core';
import { SentryService } from './core/services/sentry.service';

@Component({
  selector: 'app-test-error',
  template: `
    <button (click)="throwError()">Throw Error</button>
    <button (click)="captureMessage()">Capture Message</button>
  `,
  standalone: true,
})
export class TestErrorComponent {
  private sentry = inject(SentryService);

  throwError(): void {
    throw new Error('Test error from frontend!');
  }

  captureMessage(): void {
    this.sentry.captureMessage('Test message from frontend', 'warning');
  }
}
```

#### 4.2 Backend Testing

**Test Cloud Function:**

```typescript
export const testSentryError = onCall(async (request) => {
  // Test 1: Throw error
  throw new Error('Test error from Cloud Function!');

  // Test 2: Capture message
  Sentry.captureMessage('Test message from backend', 'warning');

  // Test 3: Capture with context
  Sentry.captureException(new Error('Error with context'), {
    extra: {
      testData: 'some context',
      userId: request.auth?.uid,
    },
  });
});
```

#### 4.3 Validation Checklist

- [ ] Errors appear in Sentry dashboard
- [ ] Source maps resolve to correct files and line numbers
- [ ] User context (ID, email) is attached
- [ ] Breadcrumbs show user actions before error
- [ ] Environment tags are correct (dev/prod)
- [ ] Release versions are tracked
- [ ] Performance transactions are captured
- [ ] Email alerts are sent for critical errors
- [ ] Error grouping works correctly
- [ ] No sensitive data (passwords, tokens) in error logs

---

### Phase 5: Configuration & Deployment (0.5 days)

#### 5.1 Set Up Alerts

**In Sentry Dashboard:**
1. Navigate to Alerts → Create Alert Rule
2. Configure conditions:
   - Error count threshold
   - New issue detected
   - Regression detected
3. Set notification channels:
   - Email
   - Slack integration (optional)
4. Set alert frequency and snooze rules

#### 5.2 Configure Environments

**Sentry Projects:**
- Use environment tags to separate dev/staging/prod
- Or create separate projects per environment

#### 5.3 Release Tracking

**Integrate with CI/CD:**

```bash
# Create release in Sentry
sentry-cli releases new "$VERSION"

# Upload source maps
sentry-cli releases files "$VERSION" upload-sourcemaps ./dist

# Finalize release
sentry-cli releases finalize "$VERSION"

# Associate commits
sentry-cli releases set-commits "$VERSION" --auto
```

#### 5.4 Update Documentation

**Add to README.md:**
- Sentry is used for error tracking
- How to view errors in Sentry dashboard
- How errors are captured (automatic + manual)
- Environment configuration requirements

**Add to .env.example:**

```env
# Sentry Configuration
SENTRY_DSN=your_sentry_dsn_here
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

---

## Testing Strategy

### Unit Tests

**Frontend:**
- Test `SentryService.captureException()` is called on errors
- Test `GlobalErrorHandler` captures errors correctly
- Mock Sentry SDK in tests

**Backend:**
- Test error handler wraps function calls
- Test error context is added correctly
- Verify Sentry is not called in test environment

### Integration Tests

**Frontend:**
- Trigger real errors and verify Sentry receives them
- Test breadcrumb tracking through user flows
- Verify user context is set after login

**Backend:**
- Deploy test function that throws error
- Verify error appears in Sentry
- Test performance monitoring captures function duration

### Manual Testing

1. Deploy to staging environment
2. Trigger various error scenarios
3. Verify errors appear in Sentry dashboard
4. Check source maps resolve correctly
5. Verify alerts are sent
6. Test error search and filtering

---

## Benefits

### Immediate Benefits
1. **Real-time error visibility**: Know immediately when errors occur
2. **User impact tracking**: See how many users are affected
3. **Stack traces with source maps**: Debug production errors easily
4. **Alert notifications**: Get notified of critical errors via email/Slack
5. **Performance insights**: Identify slow components and functions

### Long-term Benefits
1. **Error trend analysis**: Track error frequency over time
2. **Release quality tracking**: Compare error rates between releases
3. **User experience improvement**: Proactively fix errors users encounter
4. **Debugging efficiency**: Reduce time spent reproducing issues
5. **Data-driven prioritization**: Fix most common/impactful errors first

### Metrics to Track
- Total error count (trending down over time)
- Unique errors (new vs recurring)
- Error resolution time
- Affected users per error
- Function performance (p50, p95, p99)
- Release stability score

---

## Security & Privacy Considerations

### Do Not Log
- Passwords or authentication tokens
- Personal identifiable information (PII) beyond user ID
- Credit card numbers or payment information
- API keys or secrets
- Full request/response bodies with sensitive data

### Sanitization Strategy

```typescript
// Example: Sanitize before sending to Sentry
beforeSend(event, hint) {
  // Remove sensitive headers
  if (event.request?.headers) {
    delete event.request.headers['Authorization'];
    delete event.request.headers['Cookie'];
  }

  // Sanitize user data
  if (event.user?.email) {
    event.user.email = event.user.email.replace(/(.{2}).*(@.*)/, '$1***$2');
  }

  return event;
}
```

### Compliance
- Sentry is GDPR compliant
- Configure data retention policy (default: 90 days)
- Implement data scrubbing rules
- Document in privacy policy

---

## Cost Estimation

### Sentry Pricing (as of 2026)
- **Developer Plan** (Free): 5K errors/month, 1 user
- **Team Plan** ($26/month): 50K errors/month, unlimited users
- **Business Plan** ($80/month): 150K errors/month, advanced features

### Recommended Plan
- Start with **Team Plan** for production monitoring
- Adjust based on actual error volume
- Performance monitoring may require additional quota

---

## Rollout Plan

### Week 1: Setup & Frontend
- Day 1: Sentry account and project setup
- Day 2-3: Frontend integration and testing
- Day 4: Deploy to staging, validate

### Week 2: Backend & Production
- Day 1-2: Backend integration and testing
- Day 3: Deploy to staging, validate
- Day 4: Configure alerts and dashboards
- Day 5: Deploy to production, monitor

### Post-Deployment
- Monitor for 1 week to validate setup
- Tune alert thresholds based on actual error rates
- Create dashboard for key metrics
- Train team on using Sentry

---

## Success Criteria

- [ ] All frontend errors captured in Sentry
- [ ] All backend function errors captured in Sentry
- [ ] Source maps correctly resolve file/line numbers
- [ ] User context attached to all errors
- [ ] Email alerts configured and working
- [ ] Performance monitoring showing transaction data
- [ ] No errors in development mode sent to Sentry
- [ ] Zero sensitive data logged in Sentry
- [ ] Team can search/filter errors effectively
- [ ] Error resolution workflow established

---

## Future Enhancements

1. **Session Replay**: Enable full session replay to see exact user actions before error
2. **Custom Dashboards**: Create team-specific dashboards for error trends
3. **Slack Integration**: Send critical errors to Slack channel
4. **Error Budgets**: Set acceptable error rates and alert when exceeded
5. **Automated Issue Creation**: Create GitHub issues from Sentry errors
6. **User Feedback**: Allow users to report errors directly from app
7. **Performance Budgets**: Set performance thresholds and monitor
8. **Distributed Tracing**: Trace requests across frontend → backend → external APIs

---

## References

### Documentation
- [Sentry Angular SDK](https://docs.sentry.io/platforms/javascript/guides/angular/)
- [Sentry Node.js SDK](https://docs.sentry.io/platforms/node/)
- [Sentry Cloud Functions](https://docs.sentry.io/platforms/node/guides/gcp-functions/)
- [Source Maps Upload](https://docs.sentry.io/platforms/javascript/sourcemaps/)

### Related Tickets
- #29: Create Error Handler Service (consolidate with Sentry)
- #3: Hardcoded Error Handling improvements

### Best Practices
- [Sentry Best Practices](https://docs.sentry.io/product/best-practices/)
- [Error Monitoring Strategy](https://docs.sentry.io/product/error-monitoring/)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)

---

## Notes

- Ensure `.sentryclirc` is added to `.gitignore` (contains auth token)
- Store Sentry DSN in environment variables, not in code
- Use different Sentry projects/environments for dev/staging/prod
- Start with low sampling rates for performance monitoring (10%) to control costs
- Review Sentry data retention and privacy policies
- Consider GDPR compliance when logging user data
- Set up automated source map uploads in CI/CD pipeline
- Test error tracking in staging before production deployment

---

**Estimated Total Effort:** 3-4 days
**Lines Added:** ~500-700 (config, services, utilities)
**Files Modified:** ~10-15
**External Dependencies:** Sentry account, npm packages

---

**Status**: Ready for implementation
**Next Steps**:
1. Create Sentry account and projects
2. Obtain DSN keys for frontend and backend
3. Begin Phase 1: Sentry account setup
