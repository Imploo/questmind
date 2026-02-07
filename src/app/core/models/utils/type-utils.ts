/**
 * TypeScript utility types for working with domain models and Firestore documents
 */

/**
 * Makes specified keys required in a type
 * Useful when you need to ensure certain optional fields are present
 *
 * @example
 * interface Session {
 *   id: string;
 *   transcription?: TranscriptionResult;
 *   storageMetadata?: StorageMetadata;
 * }
 *
 * type CompleteSession = RequireKeys<Session, 'transcription' | 'storageMetadata'>;
 * // Now transcription and storageMetadata are required
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Makes all nested properties optional recursively
 * Useful for partial updates of nested objects
 *
 * @example
 * type SessionUpdate = DeepPartial<AudioSessionRecord>;
 * // All fields including nested ones are optional
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extracts only the specified keys from a type
 * Alias for Pick to maintain consistency with other utilities
 *
 * @example
 * type SessionBasic = PickKeys<AudioSessionRecord, 'id' | 'title' | 'content'>;
 */
export type PickKeys<T, K extends keyof T> = Pick<T, K>;

/**
 * Adds an id field to a type
 * Ensures the type has a string id field
 *
 * @example
 * type SessionWithId = WithId<SessionData>;
 * // Guarantees the type has id: string
 */
export type WithId<T> = T & { id: string };

/**
 * Removes the id field from a type
 * Useful for creating new documents where id is auto-generated
 *
 * @example
 * type NewSession = WithoutId<AudioSessionRecord>;
 * // Use for creating new sessions before Firestore assigns an ID
 */
export type WithoutId<T> = Omit<T, 'id'>;

/**
 * Adds createdAt and updatedAt timestamp fields
 * Ensures the type has Date-typed timestamp fields
 *
 * @example
 * type TimestampedSession = WithTimestamps<SessionData>;
 * // Adds createdAt: Date and updatedAt: Date
 */
export type WithTimestamps<T> = T & {
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Adds optional createdAt and updatedAt timestamp fields
 * For types where timestamps might not always be present
 *
 * @example
 * type MaybeTimestamped = WithOptionalTimestamps<SessionData>;
 */
export type WithOptionalTimestamps<T> = T & {
  createdAt?: Date;
  updatedAt?: Date;
};

/**
 * Makes specified keys optional in a type
 * Opposite of RequireKeys
 *
 * @example
 * type PartialSession = OptionalKeys<AudioSessionRecord, 'transcription' | 'storageMetadata'>;
 */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Creates a readonly version of a type recursively
 * Useful for immutable domain models
 *
 * @example
 * type ImmutableSession = DeepReadonly<AudioSessionRecord>;
 * // All fields and nested fields are readonly
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Extracts the type of array elements
 * Useful for working with array fields
 *
 * @example
 * type Podcast = ArrayElement<AudioSessionRecord['podcasts']>;
 * // Extracts PodcastVersion type
 */
export type ArrayElement<T> = T extends (infer U)[] ? U : never;

/**
 * Creates a type with all properties of T except those in U
 * More expressive name for Exclude utility
 *
 * @example
 * type PublicFields = Without<AudioSessionRecord, 'ownerId' | 'ownerEmail'>;
 */
export type Without<T, U extends keyof T> = Omit<T, U>;

/**
 * Makes all properties non-nullable (removes null and undefined)
 * Useful when you know certain fields will be populated
 *
 * @example
 * type NonNullableSession = DeepNonNullable<AudioSessionRecord>;
 */
export type DeepNonNullable<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

/**
 * Type for Firestore document data (without metadata)
 * Used when reading/writing to Firestore
 *
 * @example
 * type SessionDTO = FirestoreDocument<AudioSessionRecord>;
 */
export type FirestoreDocument<T> = WithId<T>;

/**
 * Type for creating new Firestore documents
 * Excludes id and makes timestamps optional (auto-generated)
 *
 * @example
 * type NewSessionDTO = FirestoreCreate<AudioSessionRecord>;
 */
export type FirestoreCreate<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & {
  createdAt?: Date;
  updatedAt?: Date;
};

/**
 * Type for updating Firestore documents
 * All fields optional except id
 *
 * @example
 * type SessionUpdateDTO = FirestoreUpdate<AudioSessionRecord>;
 */
export type FirestoreUpdate<T> = WithId<DeepPartial<Omit<T, 'id'>>>;
