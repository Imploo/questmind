/**
 * Date conversion for values read from Firestore. A field written as a `Date`
 * comes back as a Firestore `Timestamp`, older documents hold ISO strings, and
 * serialized timestamps arrive as `{ seconds, nanoseconds }`. These helpers
 * accept all of them, so callers never call `new Date()` on a `Timestamp`.
 */

/** Converts a Firestore `Timestamp`, `{ seconds, nanoseconds }`, ISO string, `Date` or epoch millis to a `Date`; `null` when missing or invalid. */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;

  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value);
  } else if (typeof value === 'object') {
    const timestamp = value as { toDate?: unknown; seconds?: unknown; nanoseconds?: unknown };
    if (typeof timestamp.toDate === 'function') {
      date = (timestamp.toDate as () => Date).call(value);
    } else if (typeof timestamp.seconds === 'number') {
      const nanos = typeof timestamp.nanoseconds === 'number' ? timestamp.nanoseconds : 0;
      date = new Date(timestamp.seconds * 1000 + Math.floor(nanos / 1_000_000));
    }
  }

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** Epoch milliseconds of any value `toDate` accepts; 0 when missing or invalid. */
export function toMillis(value: unknown): number {
  return toDate(value)?.getTime() ?? 0;
}
