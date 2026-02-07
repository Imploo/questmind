# Create Centralized Firebase Service

**Status:** Done
**Priority:** CRITICAL
**Estimated Effort:** 3 hours
**Code Review Issue:** #5, #10

## Problem

Firebase initialization pattern is duplicated across multiple services:
- `audio-transcription.service.ts:72-80`
- `audio-session-state.service.ts:37-44`
- `campaign.service.ts:25-32`

Each service independently tries to initialize Firebase with identical try-catch blocks.

## Current Pattern (Repeated 3+ times)

```typescript
try {
  this.app = getApp();
  this.db = getFirestore(this.app);
} catch (error) {
  console.error('Firebase not initialized:', error);
  this.app = null;
  this.db = null;
}
```

## Solution

Create a centralized Firebase service that provides properly initialized Firebase instances.

### Implementation Steps

1. **Create FirebaseService**

```typescript
// src/app/core/firebase.service.ts
import { Injectable } from '@angular/core';
import { getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app: FirebaseApp | null;
  readonly firestore: Firestore | null;
  readonly functions: Functions | null;
  readonly storage: FirebaseStorage | null;

  constructor() {
    try {
      this.app = getApp();
      this.firestore = getFirestore(this.app);
      this.functions = getFunctions(this.app, 'europe-west4');
      this.storage = getStorage(this.app);
    } catch (error) {
      console.error('Firebase not initialized:', error);
      this.app = null;
      this.firestore = null;
      this.functions = null;
      this.storage = null;
    }
  }

  isInitialized(): boolean {
    return this.app !== null;
  }

  requireFirestore(): Firestore {
    if (!this.firestore) {
      throw new Error('Firestore not initialized');
    }
    return this.firestore;
  }

  requireFunctions(): Functions {
    if (!this.functions) {
      throw new Error('Functions not initialized');
    }
    return this.functions;
  }

  requireStorage(): FirebaseStorage {
    if (!this.storage) {
      throw new Error('Storage not initialized');
    }
    return this.storage;
  }
}
```

2. **Update AudioTranscriptionService**
   - Inject `FirebaseService`
   - Remove local Firebase initialization
   - Use `firebase.requireFirestore()`

3. **Update AudioSessionStateService**
   - Inject `FirebaseService`
   - Remove local Firebase initialization

4. **Update CampaignService**
   - Inject `FirebaseService`
   - Remove local Firebase initialization

5. **Update Other Services**
   - Find all services using `getApp()`, `getFirestore()`, etc.
   - Replace with `FirebaseService`

### Testing

- Test behavior when Firebase is not initialized
- Verify all services work correctly
- Ensure error handling works properly

## Benefits

- Single initialization point
- Consistent error handling
- Easier to mock for testing
- Better dependency management
- Reduces duplication

## Next Steps

This service can later be extended to:
- Provide authentication helpers
- Handle reconnection logic
- Manage offline persistence
- Centralize Firebase configuration
