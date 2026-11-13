import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  selector: 'app-toast-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex w-[calc(100%-2rem)] max-w-sm flex-col items-center gap-2 pointer-events-none">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="toast pointer-events-auto animate-fade-in"
          [class]="toastClasses(toast)"
          [attr.role]="toast.type === 'error' ? 'alert' : 'status'"
        >
          <span class="mark" aria-hidden="true"></span>
          <span class="flex-1">{{ toast.message }}</span>
          @if (toast.actions) {
            <div class="flex gap-1.5 shrink-0">
              <button type="button" class="btn" (click)="toast.actions[0].resolve(false)">{{ toast.actions[0].label }}</button>
              <button type="button" class="btn is-confirm" (click)="toast.actions[1].resolve(true)">{{ toast.actions[1].label }}</button>
            </div>
          } @else {
            <button
              type="button"
              class="opacity-60 hover:opacity-100 transition-opacity"
              (click)="toastService.dismiss(toast.id)"
              aria-label="Sluiten"
            >✕</button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in { animation: fade-in 0.15s ease-out; }

    /* Ink on the table, like the undo bar of the sheet; a diamond in the type's colour says what kind. */
    .toast {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.7rem 0.9rem;
      border-radius: 12px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #f6efe0;
      background: var(--ink);
      border: 1px solid #5a4c3c;
      box-shadow: 0 16px 36px -14px rgba(20, 10, 50, 0.8);
    }
    .mark { width: 8px; height: 8px; flex-shrink: 0; transform: rotate(45deg); background: #c9bda9; }
    .is-success .mark { background: #8fc27d; }
    .is-error { border-color: #b5505a; }
    .is-error .mark { background: #f08a93; }
    .is-warning .mark { background: #f0cf85; }
    .btn {
      min-height: 32px;
      padding: 0 0.7rem;
      border-radius: 8px;
      font-size: 0.78rem;
      font-weight: 600;
      color: #f6efe0;
      border: 1px solid transparent;
    }
    .btn:hover { border-color: #6b5a3a; }
    .btn.is-confirm { color: #f0cf85; border-color: #6b5a3a; }
  `]
})
export class ToastContainerComponent {
  toastService = inject(ToastService);

  toastClasses(toast: Toast): string {
    return `is-${toast.type}`;
  }
}
