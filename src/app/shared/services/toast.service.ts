import { Injectable, signal } from '@angular/core';
import { isPermissionDenied, PERMISSION_DENIED_MESSAGE } from '../utils/callable-error';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastAction {
  label: string;
  resolve: (confirmed: boolean) => void;
}

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  actions?: ToastAction[];
  timeoutId?: ReturnType<typeof setTimeout>;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  toasts = signal<Toast[]>([]);

  show(message: string, type: ToastType = 'info', duration = 4000): void {
    const id = this.nextId++;
    const timeoutId = setTimeout(() => this.dismiss(id), duration);
    this.toasts.update(list => [...list, { id, message, type, timeoutId }]);
  }

  /**
   * Error toast for a failed Cloud Function call. A `permission-denied` error
   * always gets a clear rights message; other errors only get a toast when a
   * `fallback` message is given. Returns whether a toast was shown.
   */
  showCallableError(error: unknown, fallback?: string): boolean {
    const message = isPermissionDenied(error) ? PERMISSION_DENIED_MESSAGE : fallback;
    if (!message) return false;
    this.show(message, 'error', 6000);
    return true;
  }

  confirm(message: string): Promise<boolean> {
    return new Promise(resolve => {
      const id = this.nextId++;
      const actions: ToastAction[] = [
        { label: 'Annuleren', resolve: (v) => { this.dismiss(id); resolve(v); } },
        { label: 'Bevestigen', resolve: (v) => { this.dismiss(id); resolve(v); } },
      ];
      this.toasts.update(list => [...list, { id, message, type: 'warning', actions }]);
    });
  }

  dismiss(id: number): void {
    this.toasts.update(list => {
      const toast = list.find(t => t.id === id);
      if (toast?.timeoutId) clearTimeout(toast.timeoutId);
      return list.filter(t => t.id !== id);
    });
  }
}
