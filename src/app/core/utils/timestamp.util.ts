import { Timestamp } from 'firebase/firestore';

/**
 * Timestamp conversion utilities for standardizing date handling
 * across Firestore, TypeScript Date, and ISO string formats.
 */

/**
 * Converts various timestamp formats to Date
 * @param value - Date, ISO string, Firestore Timestamp, or undefined
 * @returns Date object or undefined if input is undefined or invalid
 *
 * @example
 * toDate(new Date())                    // Returns the Date as-is
 * toDate('2025-01-15T12:00:00Z')       // Parses ISO string to Date
 * toDate(firestoreTimestamp)           // Converts Timestamp to Date
 * toDate(undefined)                    // Returns undefined
 */
export function toDate(value: Date | string | Timestamp | undefined): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  }
  if ('toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return undefined;
}

/**
 * Converts Date or ISO string to Firestore Timestamp
 * @param date - Date object, ISO string, or undefined
 * @returns Firestore Timestamp or undefined if input is undefined or invalid
 *
 * @example
 * toTimestamp(new Date())              // Converts Date to Timestamp
 * toTimestamp('2025-01-15T12:00:00Z') // Converts ISO string to Timestamp
 * toTimestamp(undefined)               // Returns undefined
 */
export function toTimestamp(date: Date | string | undefined): Timestamp | undefined {
  if (!date) return undefined;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return undefined;
  return Timestamp.fromDate(d);
}

/**
 * Converts Date or Firestore Timestamp to ISO string
 * @param date - Date object, Firestore Timestamp, or undefined
 * @returns ISO 8601 string or undefined if input is undefined or invalid
 *
 * @example
 * toISOString(new Date())              // Returns ISO string
 * toISOString(firestoreTimestamp)      // Converts Timestamp to ISO string
 * toISOString(undefined)               // Returns undefined
 */
export function toISOString(date: Date | Timestamp | undefined): string | undefined {
  if (!date) return undefined;
  if (date instanceof Date) {
    return isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if ('toDate' in date && typeof date.toDate === 'function') {
    const converted = date.toDate();
    return isNaN(converted.getTime()) ? undefined : converted.toISOString();
  }
  return undefined;
}

/**
 * Gets the current timestamp as a Date
 * @returns Current Date
 */
export function now(): Date {
  return new Date();
}

/**
 * Gets the current timestamp as a Firestore Timestamp
 * @returns Current Firestore Timestamp
 */
export function nowTimestamp(): Timestamp {
  return Timestamp.now();
}

/**
 * Checks if a date is valid
 * @param date - Date object to check
 * @returns true if the date is valid, false otherwise
 */
export function isValidDate(date: Date | undefined): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Formats a date for display
 * @param date - Date, ISO string, or Firestore Timestamp
 * @param options - Intl.DateTimeFormatOptions for formatting
 * @returns Formatted date string or empty string if invalid
 *
 * @example
 * formatDate(new Date(), { dateStyle: 'medium' })
 * formatDate(isoString, { timeStyle: 'short' })
 */
export function formatDate(
  date: Date | string | Timestamp | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
): string {
  const d = toDate(date);
  if (!d || !isValidDate(d)) return '';
  return new Intl.DateTimeFormat('en-US', options).format(d);
}
