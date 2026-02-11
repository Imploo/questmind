import { Injectable, signal } from '@angular/core';

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
