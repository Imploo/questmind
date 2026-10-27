/**
 * Convert a Firestore Timestamp, Date, ISO string or epoch millis to a Date.
 * Returns null for missing or unparseable values.
 */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Epoch millis of `value` (see toDate), or null when it isn't a date. */
export function toMillis(value: unknown): number | null {
  return toDate(value)?.getTime() ?? null;
}
