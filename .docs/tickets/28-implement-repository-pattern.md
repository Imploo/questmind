# Implement Repository Pattern for Data Access

**Priority:** HIGH
**Estimated Effort:** 1 week
**Code Review Issue:** #5, #22, #23

## Problem

Services are tightly coupled to Firebase implementation:
- Direct Firestore imports in business logic services
- Data access logic mixed with business logic
- Difficult to test without real Firebase
- Hard to switch to different backend

## Current Pattern

```typescript
// Services directly use Firebase
import { collection, doc, getFirestore, setDoc } from 'firebase/firestore';

export class AudioSessionService {
  private db = getFirestore();

  async save(session: AudioSessionRecord): Promise<void> {
    // Business logic mixed with Firestore details
    const ref = doc(this.db, `campaigns/${session.campaignId}/sessions/${session.id}`);
    await setDoc(ref, session);
  }
}
```

## Solution

Implement Repository Pattern to abstract data access.

### Architecture

```
┌──────────────────────────────────────┐
│ Services (Business Logic)           │
│ - AudioSessionService                │
│ - TranscriptionService               │
└────────────┬─────────────────────────┘
             │ depends on
┌────────────▼─────────────────────────┐
│ Repositories (Data Access Interface) │
│ - AudioSessionRepository             │
│ - TranscriptionRepository            │
└────────────┬─────────────────────────┘
             │ implements
┌────────────▼─────────────────────────┐
│ Firebase Implementation              │
│ - FirebaseAudioSessionRepository     │
└──────────────────────────────────────┘
```

### Implementation Steps

#### 1. Create Base Repository Interface

```typescript
// src/app/core/repositories/base.repository.ts
import { Observable } from 'rxjs';

export interface QueryOptions {
  where?: Array<[string, string, any]>;
  orderBy?: [string, 'asc' | 'desc'];
  limit?: number;
}

export interface Repository<T> {
  findById(id: string, ...path: string[]): Observable<T | null>;
  findAll(...path: string[]): Observable<T[]>;
  query(options: QueryOptions, ...path: string[]): Observable<T[]>;
  save(entity: T, ...path: string[]): Observable<void>;
  update(id: string, updates: Partial<T>, ...path: string[]): Observable<void>;
  delete(id: string, ...path: string[]): Observable<void>;
}
```

#### 2. Create AudioSessionRepository

```typescript
// src/app/core/repositories/audio-session.repository.ts
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AudioSessionRecord } from '../../audio/audio-session.models';

export abstract class AudioSessionRepository {
  abstract findById(campaignId: string, sessionId: string): Observable<AudioSessionRecord | null>;
  abstract findByCampaign(campaignId: string): Observable<AudioSessionRecord[]>;
  abstract save(session: AudioSessionRecord): Observable<void>;
  abstract update(campaignId: string, sessionId: string, updates: Partial<AudioSessionRecord>): Observable<void>;
  abstract delete(campaignId: string, sessionId: string): Observable<void>;
  abstract listenToSession(campaignId: string, sessionId: string): Observable<AudioSessionRecord | null>;
  abstract listenToCampaignSessions(campaignId: string): Observable<AudioSessionRecord[]>;
}
```

#### 3. Implement Firebase Repository

```typescript
// src/app/infrastructure/repositories/firebase-audio-session.repository.ts
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  Unsubscribe
} from 'firebase/firestore';
import { FirebaseService } from '../../core/firebase.service';
import { AudioSessionRepository } from '../../core/repositories/audio-session.repository';
import { AudioSessionRecord } from '../../audio/audio-session.models';

@Injectable({ providedIn: 'root' })
export class FirebaseAudioSessionRepository extends AudioSessionRepository {
  private readonly firebase = inject(FirebaseService);

  findById(campaignId: string, sessionId: string): Observable<AudioSessionRecord | null> {
    const db = this.firebase.requireFirestore();
    const docRef = doc(db, `campaigns/${campaignId}/audioSessions/${sessionId}`);

    return from(getDoc(docRef)).pipe(
      map(snapshot => {
        if (!snapshot.exists()) return null;
        return { id: snapshot.id, ...snapshot.data() } as AudioSessionRecord;
      })
    );
  }

  findByCampaign(campaignId: string): Observable<AudioSessionRecord[]> {
    const db = this.firebase.requireFirestore();
    const collectionRef = collection(db, `campaigns/${campaignId}/audioSessions`);
    const q = query(collectionRef, orderBy('createdAt', 'desc'));

    return from(getDocs(q)).pipe(
      map(snapshot =>
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as AudioSessionRecord))
      )
    );
  }

  save(session: AudioSessionRecord): Observable<void> {
    const db = this.firebase.requireFirestore();
    const docRef = doc(db, `campaigns/${session.campaignId}/audioSessions/${session.id}`);

    return from(setDoc(docRef, session));
  }

  update(
    campaignId: string,
    sessionId: string,
    updates: Partial<AudioSessionRecord>
  ): Observable<void> {
    const db = this.firebase.requireFirestore();
    const docRef = doc(db, `campaigns/${campaignId}/audioSessions/${sessionId}`);

    return from(updateDoc(docRef, { ...updates, updatedAt: new Date().toISOString() }));
  }

  delete(campaignId: string, sessionId: string): Observable<void> {
    const db = this.firebase.requireFirestore();
    const docRef = doc(db, `campaigns/${campaignId}/audioSessions/${sessionId}`);

    return from(deleteDoc(docRef));
  }

  listenToSession(
    campaignId: string,
    sessionId: string
  ): Observable<AudioSessionRecord | null> {
    const db = this.firebase.requireFirestore();
    const docRef = doc(db, `campaigns/${campaignId}/audioSessions/${sessionId}`);

    return new Observable(observer => {
      const unsubscribe = onSnapshot(
        docRef,
        snapshot => {
          if (!snapshot.exists()) {
            observer.next(null);
          } else {
            observer.next({ id: snapshot.id, ...snapshot.data() } as AudioSessionRecord);
          }
        },
        error => observer.error(error)
      );

      return () => unsubscribe();
    });
  }

  listenToCampaignSessions(campaignId: string): Observable<AudioSessionRecord[]> {
    const db = this.firebase.requireFirestore();
    const collectionRef = collection(db, `campaigns/${campaignId}/audioSessions`);
    const q = query(collectionRef, orderBy('createdAt', 'desc'));

    return new Observable(observer => {
      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const sessions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as AudioSessionRecord));
          observer.next(sessions);
        },
        error => observer.error(error)
      );

      return () => unsubscribe();
    });
  }
}
```

#### 4. Provide Repository in DI

```typescript
// src/app/app.config.ts
import { AudioSessionRepository } from './core/repositories/audio-session.repository';
import { FirebaseAudioSessionRepository } from './infrastructure/repositories/firebase-audio-session.repository';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... other providers
    {
      provide: AudioSessionRepository,
      useClass: FirebaseAudioSessionRepository
    }
  ]
};
```

#### 5. Update Services to Use Repositories

```typescript
// Before: Direct Firebase usage
export class AudioSessionService {
  private db = getFirestore();

  async getSession(campaignId: string, sessionId: string): Promise<AudioSessionRecord | null> {
    const docRef = doc(this.db, `campaigns/${campaignId}/audioSessions/${sessionId}`);
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? snapshot.data() as AudioSessionRecord : null;
  }
}

// After: Repository usage
export class AudioSessionService {
  private readonly repo = inject(AudioSessionRepository);

  getSession(campaignId: string, sessionId: string): Observable<AudioSessionRecord | null> {
    return this.repo.findById(campaignId, sessionId);
  }
}
```

### Additional Repositories Needed

1. **CampaignRepository**
   - Campaign CRUD operations
   - Member management
   - Settings updates

2. **TranscriptionRepository**
   - Save/load transcriptions
   - Chunk management
   - History queries

3. **PodcastRepository**
   - Podcast versions
   - Progress tracking
   - Audio metadata

### Testing Benefits

```typescript
// Mock repository for testing
class MockAudioSessionRepository extends AudioSessionRepository {
  private sessions = new Map<string, AudioSessionRecord>();

  findById(campaignId: string, sessionId: string): Observable<AudioSessionRecord | null> {
    return of(this.sessions.get(sessionId) || null);
  }

  // ... other methods
}

// Test service without Firebase
describe('AudioSessionService', () => {
  let service: AudioSessionService;
  let mockRepo: MockAudioSessionRepository;

  beforeEach(() => {
    mockRepo = new MockAudioSessionRepository();
    TestBed.configureTestingModule({
      providers: [
        { provide: AudioSessionRepository, useValue: mockRepo }
      ]
    });
    service = TestBed.inject(AudioSessionService);
  });

  it('should get session', (done) => {
    const mockSession = { id: '123', title: 'Test' } as AudioSessionRecord;
    mockRepo.sessions.set('123', mockSession);

    service.getSession('campaign1', '123').subscribe(session => {
      expect(session).toEqual(mockSession);
      done();
    });
  });
});
```

## Migration Plan

1. Create repository interfaces
2. Implement Firebase repositories
3. Update DI configuration
4. Migrate one service at a time:
   - AudioSessionStateService
   - AudioTranscriptionService
   - CampaignService
5. Test each migration thoroughly
6. Remove direct Firebase imports from services

## Benefits

- Services only contain business logic
- Easy to test with mock repositories
- Can swap Firebase for different backend
- Clear separation of concerns
- Type-safe data access layer
- Centralized data access logic

## Future Enhancements

- Add caching layer
- Implement offline support
- Add query builder
- Pagination support
- Optimistic updates
