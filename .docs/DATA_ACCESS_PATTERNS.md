# Data Access Patterns

This document outlines common patterns for accessing and manipulating data in QuestMind's Firestore database.

## Table of Contents

- [Collection Structure](#collection-structure)
- [Common Query Patterns](#common-query-patterns)
- [Update Patterns](#update-patterns)
- [Best Practices](#best-practices)
- [Runtime Validation](#runtime-validation)
- [Timestamp Handling](#timestamp-handling)

## Collection Structure

```
/campaigns/{campaignId}
  - Campaign document
  /audioSessions/{sessionId}
    - AudioSessionRecord documents
  /members/{userId}
    - CampaignMember documents

/users/{userId}
  - UserProfile documents
```

## Common Query Patterns

### Get Session by ID

```typescript
import { doc, getDoc } from 'firebase/firestore';
import { validateAudioSessionRecord } from '@/core/models/schemas';

const sessionRef = doc(
  db,
  `campaigns/${campaignId}/audioSessions/${sessionId}`
);
const sessionDoc = await getDoc(sessionRef);

if (sessionDoc.exists()) {
  // Use runtime validation to ensure data integrity
  const session = validateAudioSessionRecord(sessionDoc.data());
  console.log(session);
}
```

### List Campaign Sessions (Ordered by Date)

```typescript
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

const sessionsRef = collection(
  db,
  `campaigns/${campaignId}/audioSessions`
);
const q = query(
  sessionsRef,
  orderBy('createdAt', 'desc'),
  limit(20)
);

const querySnapshot = await getDocs(q);
const sessions = querySnapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));
```

### Get Sessions by Status

```typescript
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';

const sessionsRef = collection(
  db,
  `campaigns/${campaignId}/audioSessions`
);
const q = query(
  sessionsRef,
  where('status', '==', 'processing'),
  orderBy('updatedAt', 'desc')
);

const querySnapshot = await getDocs(q);
```

### Monitor Processing Sessions (Real-time)

```typescript
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';

const q = query(
  collection(db, `campaigns/${campaignId}/audioSessions`),
  where('progress.stage', 'in', ['transcribing', 'generating-story']),
  orderBy('updatedAt', 'desc')
);

const unsubscribe = onSnapshot(q, (snapshot) => {
  snapshot.forEach((doc) => {
    const session = validateAudioSessionRecord(doc.data());
    console.log(`Session ${session.id}: ${session.progress?.stage}`);
  });
});

// Don't forget to unsubscribe when done
// unsubscribe();
```

### Get User's Sessions Across Campaigns

```typescript
import { collectionGroup, query, where, orderBy, getDocs } from 'firebase/firestore';

const q = query(
  collectionGroup(db, 'audioSessions'),
  where('ownerId', '==', userId),
  orderBy('createdAt', 'desc')
);

const querySnapshot = await getDocs(q);
```

### Get Failed Sessions for Retry

```typescript
const q = query(
  collection(db, `campaigns/${campaignId}/audioSessions`),
  where('status', '==', 'failed'),
  orderBy('updatedAt', 'desc')
);
```

### Paginated Query

```typescript
import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';

// First page
const firstPageQuery = query(
  collection(db, `campaigns/${campaignId}/audioSessions`),
  orderBy('createdAt', 'desc'),
  limit(20)
);
const firstPageSnapshot = await getDocs(firstPageQuery);

// Get the last document for pagination
const lastVisible = firstPageSnapshot.docs[firstPageSnapshot.docs.length - 1];

// Next page
const nextPageQuery = query(
  collection(db, `campaigns/${campaignId}/audioSessions`),
  orderBy('createdAt', 'desc'),
  startAfter(lastVisible),
  limit(20)
);
const nextPageSnapshot = await getDocs(nextPageQuery);
```

## Update Patterns

### Update Nested Field

```typescript
import { doc, updateDoc } from 'firebase/firestore';
import { now } from '@/core/utils/timestamp.util';

const sessionRef = doc(
  db,
  `campaigns/${campaignId}/audioSessions/${sessionId}`
);

await updateDoc(sessionRef, {
  'progress.stage': 'transcribing',
  'progress.progress': 60,
  'progress.updatedAt': now(),
  updatedAt: new Date().toISOString()
});
```

### Update Multiple Fields

```typescript
await updateDoc(sessionRef, {
  title: 'Updated Title',
  content: 'Updated content',
  userCorrections: 'Corrections here',
  correctionsUpdatedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
```

### Add to Array

```typescript
import { arrayUnion, updateDoc } from 'firebase/firestore';

await updateDoc(sessionRef, {
  podcasts: arrayUnion(newPodcastVersion),
  latestPodcastVersion: newPodcastVersion.version,
  updatedAt: new Date().toISOString()
});
```

### Remove from Array

```typescript
import { arrayRemove, updateDoc } from 'firebase/firestore';

await updateDoc(sessionRef, {
  podcasts: arrayRemove(oldPodcastVersion),
  updatedAt: new Date().toISOString()
});
```

### Increment a Counter

```typescript
import { increment, updateDoc } from 'firebase/firestore';

await updateDoc(sessionRef, {
  storyRegenerationCount: increment(1),
  storyRegeneratedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
```

### Conditional Update (Transaction)

```typescript
import { runTransaction, doc } from 'firebase/firestore';

await runTransaction(db, async (transaction) => {
  const sessionRef = doc(
    db,
    `campaigns/${campaignId}/audioSessions/${sessionId}`
  );
  const sessionDoc = await transaction.get(sessionRef);

  if (!sessionDoc.exists()) {
    throw new Error('Session does not exist');
  }

  const session = sessionDoc.data();
  if (session.status !== 'processing') {
    throw new Error('Session is not in processing state');
  }

  transaction.update(sessionRef, {
    status: 'completed',
    processingCompletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
});
```

### Batch Update Multiple Documents

```typescript
import { writeBatch, doc } from 'firebase/firestore';

const batch = writeBatch(db);

sessionIds.forEach((sessionId) => {
  const sessionRef = doc(
    db,
    `campaigns/${campaignId}/audioSessions/${sessionId}`
  );
  batch.update(sessionRef, {
    status: 'archived',
    updatedAt: new Date().toISOString()
  });
});

await batch.commit();
```

## Best Practices

### 1. Always Use Runtime Validation

```typescript
import { validateAudioSessionRecord } from '@/core/models/schemas';

// ✅ Good - validates data from Firestore
const session = validateAudioSessionRecord(doc.data());

// ❌ Bad - no validation, could have invalid data
const session = doc.data() as AudioSessionRecord;
```

### 2. Use Timestamp Utilities

```typescript
import { toDate, toISOString, now } from '@/core/utils/timestamp.util';

// ✅ Good - standardized timestamp handling
const createdAt = toDate(session.createdAt);
const isoString = toISOString(createdAt);
const currentTime = now();

// ❌ Bad - inconsistent timestamp handling
const createdAt = new Date(session.createdAt);
```

### 3. Use TypeScript Utility Types

```typescript
import type { RequireKeys, WithoutId, FirestoreUpdate } from '@/core/models/utils/type-utils';

// Require certain fields
type CompleteSession = RequireKeys<AudioSessionRecord, 'transcription' | 'storageMetadata'>;

// For creating new documents
type NewSession = WithoutId<AudioSessionRecord>;

// For updates
type SessionUpdate = FirestoreUpdate<AudioSessionRecord>;
```

### 4. Handle Errors Gracefully

```typescript
import { ZodError } from 'zod';

try {
  const session = validateAudioSessionRecord(doc.data());
  // Process validated session
} catch (error) {
  if (error instanceof ZodError) {
    console.error('Invalid session data:', error.errors);
    // Handle validation error
  } else {
    throw error;
  }
}
```

### 5. Optimize Queries with Indexes

Ensure composite indexes exist for complex queries. See `firestore.indexes.json` for configured indexes.

```typescript
// This query requires a composite index (campaignId + status + createdAt)
const q = query(
  collection(db, `campaigns/${campaignId}/audioSessions`),
  where('status', '==', 'completed'),
  orderBy('createdAt', 'desc')
);
```

### 6. Use Real-time Listeners Wisely

```typescript
// ✅ Good - unsubscribe when component unmounts
useEffect(() => {
  const unsubscribe = onSnapshot(sessionRef, (doc) => {
    setSession(doc.data());
  });
  return () => unsubscribe();
}, [sessionId]);

// ❌ Bad - memory leak, never unsubscribes
onSnapshot(sessionRef, (doc) => {
  setSession(doc.data());
});
```

### 7. Batch Reads for Multiple Documents

```typescript
import { documentId, where } from 'firebase/firestore';

// ✅ Good - single query for multiple documents
const q = query(
  collection(db, `campaigns/${campaignId}/audioSessions`),
  where(documentId(), 'in', sessionIds.slice(0, 10)) // Max 10 per query
);

// ❌ Bad - N+1 query problem
for (const sessionId of sessionIds) {
  await getDoc(doc(db, `campaigns/${campaignId}/audioSessions/${sessionId}`));
}
```

### 8. Update Timestamps Consistently

```typescript
// ✅ Good - always update updatedAt
await updateDoc(sessionRef, {
  title: 'New Title',
  updatedAt: new Date().toISOString()
});

// ❌ Bad - forgot to update timestamp
await updateDoc(sessionRef, {
  title: 'New Title'
});
```

## Runtime Validation

Use Zod schemas for runtime validation at system boundaries:

### Validating Firestore Data

```typescript
import {
  validateAudioSessionRecord,
  safeValidateAudioSessionRecord
} from '@/core/models/schemas';

// Throws ZodError if invalid
const session = validateAudioSessionRecord(firestoreData);

// Returns undefined if invalid (safe)
const session = safeValidateAudioSessionRecord(firestoreData);
if (!session) {
  console.error('Invalid session data');
  return;
}
```

### Validating API Responses

```typescript
import { validateCampaign } from '@/core/models/schemas';

const response = await fetch('/api/campaigns/123');
const data = await response.json();

// Validate API response
const campaign = validateCampaign(data);
```

### Custom Validation Rules

```typescript
import { z } from 'zod';
import { AudioSessionRecordSchema } from '@/core/models/schemas';

// Extend existing schema with custom rules
const StrictSessionSchema = AudioSessionRecordSchema.refine(
  (data) => data.status === 'completed' ? !!data.transcription : true,
  {
    message: 'Completed sessions must have transcription',
    path: ['transcription']
  }
);
```

## Timestamp Handling

Standardized timestamp conversions using utility functions:

### Converting Firestore Timestamps

```typescript
import { toDate, toISOString } from '@/core/utils/timestamp.util';
import { Timestamp } from 'firebase/firestore';

// Firestore Timestamp to Date
const firestoreTimestamp: Timestamp = doc.data().createdAt;
const date: Date = toDate(firestoreTimestamp)!;

// Date to ISO string for storage
const isoString: string = toISOString(date)!;
```

### Formatting Dates for Display

```typescript
import { formatDate } from '@/core/utils/timestamp.util';

// Format with default options
const formatted = formatDate(session.createdAt);
// "Feb 7, 2026, 2:30 PM"

// Custom formatting
const customFormatted = formatDate(session.createdAt, {
  dateStyle: 'full',
  timeStyle: 'long'
});
// "Friday, February 7, 2026 at 2:30:00 PM PST"
```

### Working with Current Time

```typescript
import { now, nowTimestamp } from '@/core/utils/timestamp.util';

// Get current Date
const currentDate = now();

// Get current Firestore Timestamp
const currentTimestamp = nowTimestamp();
```

## Performance Tips

1. **Use Indexes**: Define composite indexes for complex queries
2. **Limit Results**: Always use `.limit()` for list queries
3. **Paginate**: Use cursor-based pagination for large result sets
4. **Batch Operations**: Use `writeBatch` for multiple updates
5. **Cache Reads**: Consider caching frequently accessed documents
6. **Optimize Listeners**: Unsubscribe from real-time listeners when done
7. **Avoid N+1**: Batch read multiple documents instead of individual reads

## Related Documentation

- [Data Layer Analysis](./DATA_LAYER_ANALYSIS.md) - Overview of data structure
- [Firestore Indexes](../firestore.indexes.json) - Index configuration
- [Schemas](../src/app/core/models/schemas/) - Zod validation schemas
- [Type Utils](../src/app/core/models/utils/type-utils.ts) - TypeScript utilities
- [Timestamp Utils](../src/app/core/utils/timestamp.util.ts) - Timestamp conversion
