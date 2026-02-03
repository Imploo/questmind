import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FormattingService {
  formatDuration(seconds?: number): string {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) {
      return `${mb.toFixed(1)} MB`;
    }
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  }

  formatDate(date: unknown): string {
    if (!date) return '';
    let d: Date | null = null;

    if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'string' || typeof date === 'number') {
      d = new Date(date);
    } else if (typeof date === 'object') {
      const maybeTimestamp = date as { toDate?: () => Date; seconds?: number };
      if (typeof maybeTimestamp.toDate === 'function') {
        d = maybeTimestamp.toDate();
      } else if (typeof maybeTimestamp.seconds === 'number') {
        d = new Date(maybeTimestamp.seconds * 1000);
      }
    }

    if (!d || Number.isNaN(d.getTime())) return '';

    return d.toLocaleDateString('nl-NL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
