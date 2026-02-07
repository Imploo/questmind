# Ticket #40: Data Layer Optimization (Phase 3)

**Status:** Open
**Priority:** Medium
**Created:** 2026-02-07
**Effort:** 1-2 weeks
**Dependencies:** #38 (Phase 1), #39 (Phase 2)
**Related:** [Data Layer Analysis](../DATA_LAYER_ANALYSIS.md)

## Overview

Optional optimizations and improvements to the data layer after critical duplicates and legacy fields have been removed. This phase focuses on code quality, maintainability, and developer experience improvements.

## Problem Statement

After cleaning up duplicates and legacy fields, there are additional opportunities to improve the data layer:

- Complex nested structures could be simplified
- Missing runtime validation can cause bugs
- Inconsistent timestamp handling (Date vs string)
- No clear separation between database models and domain models
- Firestore query complexity due to deep nesting

## Goals

1. Evaluate and potentially flatten some nested structures
2. Add runtime validation with Zod schemas
3. Standardize timestamp handling
4. Consider separating database DTOs from domain models
5. Improve TypeScript types with mapped types and utility types
6. Add database indexes for common queries
7. Document data access patterns

## Proposed Improvements

### 1. Add Zod Runtime Validation

**Problem:** TypeScript types are compile-time only. Invalid data can enter the system at runtime.

**Solution:** Add Zod schemas for all interfaces with runtime validation.

**Benefits:**
- Catch invalid data from Firestore
- Validate API inputs
- Self-documenting schemas
- Type inference from schemas

**Implementation:**

Create `/src/app/core/models/schemas/`:

```typescript
// user.schema.ts
import { z } from 'zod';

export const UserProfileSchema = z.object({
  uid: z.string(),
  email: z.string().email().nullable(),
  displayName: z.string().nullable().optional(),
  photoURL: z.string().url().nullable().optional(),
  admin: z.boolean().optional(),
  campaigns: z.array(z.string()).optional(),
  defaultCampaignId: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
```

```typescript
// audio-session.schema.ts
import { z } from 'zod';

export const StorageMetadataSchema = z.object({
  storagePath: z.string(),
  downloadUrl: z.string().url(),
  fileSize: z.number().positive(),
  contentType: z.string(),
  uploadedAt: z.string(),
  durationSeconds: z.number().positive().optional()
});

export const TranscriptionSegmentSchema = z.object({
  timeSeconds: z.number().nonnegative(),
  text: z.string(),
  speaker: z.string().optional()
});

export const TranscriptionResultSchema = z.object({
  id: z.string(),
  rawTranscript: z.string(),
  timestamps: z.array(TranscriptionTimestampSchema),
  status: z.enum(['processing', 'completed', 'failed']),
  storageMetadata: StorageMetadataSchema,
  segments: z.array(TranscriptionSegmentSchema).optional(),
  durationSeconds: z.number().positive().optional()
});

export const UnifiedProgressSchema = z.object({
  stage: z.enum([
    'uploading',
    'submitted',
    'downloading',
    'chunking',
    'transcribing',
    'generating-story',
    'completed',
    'failed'
  ]),
  progress: z.number().min(0).max(100),
  currentStep: z.string().optional(),
  failure: z.object({
    stage: z.string(),
    error: z.string(),
    timestamp: z.date(),
    details: z.any().optional()
  }).optional(),
  updatedAt: z.date()
});

export const AudioSessionRecordSchema = z.object({
  // ... complete schema
});

// Validation helper
export function validateAudioSession(data: unknown): AudioSessionRecord {
  return AudioSessionRecordSchema.parse(data);
}
```

**Files to create:**
- `/src/app/core/models/schemas/user.schema.ts`
- `/src/app/core/models/schemas/campaign.schema.ts`
- `/src/app/core/models/schemas/audio-session.schema.ts`
- `/src/app/core/models/schemas/kanka.schema.ts`
- `/src/app/core/models/schemas/index.ts` (re-exports)

**Usage in services:**
```typescript
// In repository or service
const sessionData = await getDoc(sessionRef);
const session = validateAudioSession(sessionData.data());
```

---

### 2. Standardize Timestamp Handling

**Problem:** Mix of `string`, `Date`, and Firestore `Timestamp` types.

**Current inconsistencies:**
- `createdAt?: string` in some interfaces
- `createdAt?: Date` in others
- Firestore stores `Timestamp` objects
- Backend may send ISO strings

**Solution:** Create timestamp utilities and standardize.

Create `/src/app/core/utils/timestamp.util.ts`:

```typescript
import { Timestamp } from 'firebase/firestore';

/**
 * Converts various timestamp formats to Date
 */
export function toDate(value: Date | string | Timestamp | undefined): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  if ('toDate' in value) return value.toDate();
  return undefined;
}

/**
 * Converts Date to Firestore Timestamp
 */
export function toTimestamp(date: Date | string | undefined): Timestamp | undefined {
  if (!date) return undefined;
  const d = typeof date === 'string' ? new Date(date) : date;
  return Timestamp.fromDate(d);
}

/**
 * Converts Date to ISO string
 */
export function toISOString(date: Date | Timestamp | undefined): string | undefined {
  if (!date) return undefined;
  if (date instanceof Date) return date.toISOString();
  if ('toDate' in date) return date.toDate().toISOString();
  return undefined;
}
```

**Standard:** Use `Date` in TypeScript interfaces, convert at boundaries.

---

### 3. Separate Database DTOs from Domain Models

**Problem:** Same interfaces used for database documents and application logic.

**Solution:** Create separate DTO (Data Transfer Object) interfaces.

**Structure:**
```
/src/app/core/models/
  ├── domain/           # Application models (Date types, computed properties)
  │   ├── user.model.ts
  │   ├── campaign.model.ts
  │   └── audio-session.model.ts
  ├── dto/              # Database DTOs (string timestamps, matches Firestore)
  │   ├── user.dto.ts
  │   ├── campaign.dto.ts
  │   └── audio-session.dto.ts
  └── mappers/          # Convert between DTO and domain
      ├── user.mapper.ts
      ├── campaign.mapper.ts
      └── audio-session.mapper.ts
```

**Example:**

```typescript
// dto/audio-session.dto.ts
export interface AudioSessionDTO {
  id: string;
  title: string;
  content: string;
  campaignId: string;
  ownerId: string;
  createdAt: string;        // ISO string in database
  updatedAt: string;        // ISO string in database
  storageMetadata?: StorageMetadataDTO;
  transcription?: TranscriptionResultDTO;
  progress?: UnifiedProgressDTO;
  // ... all fields as stored in Firestore
}

// domain/audio-session.model.ts
export interface AudioSession {
  id: string;
  title: string;
  content: string;
  campaignId: string;
  ownerId: string;
  createdAt: Date;          // Date in domain
  updatedAt: Date;          // Date in domain
  storageMetadata?: StorageMetadata;
  transcription?: TranscriptionResult;
  progress?: UnifiedProgress;
  // ... plus computed properties

  // Computed
  get isProcessing(): boolean;
  get canRetranscribe(): boolean;
  get displayStatus(): string;
}

// mappers/audio-session.mapper.ts
export class AudioSessionMapper {
  static toDomain(dto: AudioSessionDTO): AudioSession {
    return {
      ...dto,
      createdAt: new Date(dto.createdAt),
      updatedAt: new Date(dto.updatedAt),
      storageMetadata: dto.storageMetadata
        ? StorageMetadataMapper.toDomain(dto.storageMetadata)
        : undefined,
      // ... map all nested objects

      get isProcessing() {
        return this.progress?.stage !== 'completed' &&
               this.progress?.stage !== 'failed';
      }
    };
  }

  static toDTO(model: AudioSession): AudioSessionDTO {
    return {
      ...model,
      createdAt: model.createdAt.toISOString(),
      updatedAt: model.updatedAt.toISOString(),
      // ... convert all fields
    };
  }
}
```

**Benefits:**
- Clear separation of concerns
- Type safety at boundaries
- Computed properties in domain models
- Easier to change database schema

---

### 4. Flatten Some Nested Structures (Evaluate)

**Current structure:**
```typescript
session.storageMetadata.downloadUrl
session.storageMetadata.fileSize
session.transcription.rawTranscript
session.transcription.segments
```

**Proposed evaluation:**
- Are these nested objects always loaded together?
- Are they queried independently?
- Does nesting help or hurt?

**Options:**
1. **Keep nested** - if they're optional and independently loaded
2. **Flatten** - if always loaded together

**Example evaluation:**

```typescript
// Current (nested)
interface AudioSessionRecord {
  transcription?: TranscriptionResult;  // Optional nested object
}

// If transcription is ALWAYS present when needed, consider:
interface AudioSessionRecord {
  // Flatten required fields
  transcriptText: string;
  transcriptSegments: TranscriptionSegment[];
  transcriptStatus: 'processing' | 'completed' | 'failed';

  // Keep full object for backward compatibility
  transcription?: TranscriptionResult;  // Deprecated
}
```

**Decision criteria:**
- If 90%+ queries need the nested data → flatten
- If nested data is optional/large → keep nested
- If queried independently → keep separate

**Recommendation:** Keep current nesting - it's clean and optional fields make sense nested.

---

### 5. Add Firestore Indexes

**Problem:** Some queries may be slow without proper indexes.

**Solution:** Document and create indexes for common queries.

Create `/firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "audioSessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "campaignId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "audioSessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "ownerId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "audioSessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "campaignId", "order": "ASCENDING" },
        { "fieldPath": "progress.stage", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

**Common queries to optimize:**
- Get all sessions for a campaign, ordered by date
- Get processing sessions for monitoring
- Get failed sessions for retry
- Get user's sessions across campaigns

---

### 6. Improve TypeScript Types

**Add utility types:**

Create `/src/app/core/models/utils/type-utils.ts`:

```typescript
/**
 * Make specified keys required
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make all nested properties optional
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract only the specified keys
 */
export type PickKeys<T, K extends keyof T> = Pick<T, K>;

/**
 * Firestore document with ID
 */
export type WithId<T> = T & { id: string };

/**
 * Firestore document without ID (for creation)
 */
export type WithoutId<T> = Omit<T, 'id'>;

/**
 * Firestore timestamps
 */
export type WithTimestamps<T> = T & {
  createdAt: Date;
  updatedAt: Date;
};
```

**Usage examples:**

```typescript
// Require certain fields
type CompleteSession = RequireKeys<AudioSessionRecord, 'transcription' | 'storageMetadata'>;

// For updates (partial)
type SessionUpdate = DeepPartial<AudioSessionRecord>;

// For creation (no ID)
type NewSession = WithoutId<AudioSessionRecord>;

// Ensure timestamps
type TimestampedSession = WithTimestamps<AudioSessionRecord>;
```

---

### 7. Document Data Access Patterns

Create `/docs/DATA_ACCESS_PATTERNS.md`:

```markdown
# Data Access Patterns

## Common Queries

### Get Session by ID
```typescript
const sessionRef = doc(db, `campaigns/${campaignId}/audioSessions/${sessionId}`);
const session = await getDoc(sessionRef);
```

### List Campaign Sessions
```typescript
const sessionsRef = collection(db, `campaigns/${campaignId}/audioSessions`);
const q = query(sessionsRef, orderBy('createdAt', 'desc'), limit(20));
const sessions = await getDocs(q);
```

### Monitor Processing Sessions
```typescript
const q = query(
  collection(db, `campaigns/${campaignId}/audioSessions`),
  where('progress.stage', 'in', ['transcribing', 'generating-story']),
  orderBy('updatedAt', 'desc')
);
```

## Update Patterns

### Update Nested Field
```typescript
await updateDoc(sessionRef, {
  'progress.stage': 'transcribing',
  'progress.progress': 60,
  'progress.updatedAt': new Date()
});
```

### Add to Array
```typescript
await updateDoc(sessionRef, {
  podcasts: arrayUnion(newPodcastVersion)
});
```
```

---

## Implementation Steps

### Step 1: Add Zod Validation (Week 1)

1. Install Zod: `npm install zod`
2. Create schema files for all interfaces
3. Add validation to repository/service layer
4. Test with invalid data

### Step 2: Standardize Timestamps (Week 1)

1. Create timestamp utilities
2. Update mappers to use utilities
3. Test date conversions

### Step 3: DTO/Domain Separation (Week 2)

1. Create DTO interfaces matching database schema
2. Create domain models with computed properties
3. Create mappers
4. Update repositories to use DTOs
5. Update components to use domain models

### Step 4: Add Firestore Indexes (Week 2)

1. Document common queries
2. Create `firestore.indexes.json`
3. Deploy indexes: `firebase deploy --only firestore:indexes`
4. Monitor query performance

### Step 5: Add TypeScript Utilities (Week 2)

1. Create utility types
2. Update code to use utilities
3. Add JSDoc comments

### Step 6: Documentation (Week 2)

1. Create DATA_ACCESS_PATTERNS.md
2. Update README with data layer info
3. Add JSDoc comments to all interfaces

## Success Criteria

- [ ] Zod schemas created for all interfaces
- [ ] Runtime validation added to data access layer
- [ ] Timestamps standardized to Date type
- [ ] DTO/Domain separation implemented (optional)
- [ ] Firestore indexes created and deployed
- [ ] TypeScript utility types created
- [ ] Data access patterns documented
- [ ] All tests passing
- [ ] TypeScript compilation with no errors
- [ ] No performance regressions

## Benefits

### Zod Validation
- **Runtime safety** - catch invalid data from external sources
- **Self-documenting** - schemas serve as documentation
- **Type inference** - types derived from schemas stay in sync

### Timestamp Standardization
- **Consistency** - no confusion about date types
- **Type safety** - TypeScript knows it's a Date
- **Easier to work with** - Date methods available

### DTO/Domain Separation
- **Cleaner code** - domain models have business logic
- **Type safety** - clear boundaries
- **Flexibility** - change database without changing domain

### Firestore Indexes
- **Performance** - faster queries
- **Scalability** - handles more data
- **Better UX** - quick page loads

## Testing Checklist

- [ ] Zod validation rejects invalid data
- [ ] Zod validation accepts valid data
- [ ] Timestamp conversions work correctly
- [ ] DTO to domain mapping works
- [ ] Domain to DTO mapping works
- [ ] Firestore queries use indexes (check console)
- [ ] All components still work with new types
- [ ] No performance regressions

## Rollback Plan

All changes are additive:
- Zod validation can be removed without data changes
- Timestamp utilities can be removed
- DTO/Domain can be reverted to single interface
- Indexes can stay (don't hurt)

## Estimated Impact

- **Code quality:** High improvement
- **Developer experience:** High improvement
- **Runtime safety:** High improvement
- **Performance:** Medium improvement (indexes)
- **Complexity:** Medium increase (more files, but cleaner)

## Dependencies

- **#38** - Phase 1 critical duplicates must be cleaned up first
- **#39** - Phase 2 legacy fields should be removed first

## Nice-to-Have (Future)

- Add GraphQL layer for type-safe queries
- Implement domain events for side effects
- Add repository caching layer
- Implement optimistic updates
- Add offline support with conflict resolution
