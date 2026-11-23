import { inject, Injectable } from '@angular/core';
import { I18nService } from '../core/i18n/i18n.service';
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

/** File size in MB (or KB below 1 MB); `unknown` when there is no size. */
export function formatFileSize(bytes?: number, unknown = ''): string {
  if (!bytes) return unknown;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

/** Date and time in the notation of `locale`; accepts anything `toDate` accepts. */
export function formatDate(date: unknown, locale: string): string {
  const d = toDate(date);
  if (!d) return '';

  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** A stored session day (`2026-11-06`) as people write it: `6 nov 2026`. Anything else is returned as it is. */
export function formatDay(isoDay: string | null | undefined, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay ?? '');
  if (!match) return isoDay ?? '';
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return day.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A number with the grouping of `locale`: `12.500` in Dutch, `12,500` in English. */
export function formatNumber(value: number, locale: string): string {
  return value.toLocaleString(locale);
}

/**
 * The formatting functions in the active language. Called from a template or a
 * `computed`, the result follows the language: each call reads the locale signal.
 */
@Injectable({ providedIn: 'root' })
export class FormattingService {
  private readonly i18n = inject(I18nService);

  formatDuration(seconds?: number): string {
    return formatDuration(seconds);
  }

  formatFileSize(bytes?: number): string {
    return formatFileSize(bytes, this.i18n.t().common.notAvailable);
  }

  formatDate(date: unknown): string {
    return formatDate(date, this.i18n.locale());
  }

  formatDay(isoDay?: string | null): string {
    return formatDay(isoDay, this.i18n.locale());
  }

  formatNumber(value: number): string {
    return formatNumber(value, this.i18n.locale());
  }
}
