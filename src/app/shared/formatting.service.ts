import { Injectable } from '@angular/core';
import { toDate } from './utils/date.utils';

/** Duration in seconds as `m:ss`, or `h:mm:ss` from an hour on (or always, with `withHours`). */
export function formatDuration(seconds?: number, withHours = false): string {
  const total = Math.floor(seconds || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = (total % 60).toString().padStart(2, '0');
  return hours || withHours
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`;
}

/** File size in MB (or KB below 1 MB). */
export function formatFileSize(bytes?: number): string {
  if (!bytes) return 'N/A';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

/** Date and time in Dutch notation; accepts anything `toDate` accepts. */
export function formatDate(date: unknown): string {
  const d = toDate(date);
  if (!d) return '';

  return d.toLocaleDateString('nl-NL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Injectable wrapper around the formatting functions, for use in templates. */
/** A stored session day (`2026-11-06`) as people write it: `6 nov 2026`. Anything else is returned as it is. */
export function formatDay(isoDay?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay ?? '');
  if (!match) return isoDay ?? '';
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return day.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

@Injectable({ providedIn: 'root' })
export class FormattingService {
  formatDuration(seconds?: number): string {
    return formatDuration(seconds);
  }

  formatFileSize(bytes?: number): string {
    return formatFileSize(bytes);
  }

  formatDate(date: unknown): string {
    return formatDate(date);
  }
}
