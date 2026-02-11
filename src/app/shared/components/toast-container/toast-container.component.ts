import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  selector: 'app-toast-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium min-w-64 max-w-sm animate-fade-in"
          [class]="toastClasses(toast)"
        >
          <span class="flex-1">{{ toast.message }}</span>
          @if (toast.actions) {
            <div class="flex gap-2 shrink-0">
              <button
                class="px-2 py-1 rounded text-xs font-semibold opacity-80 hover:opacity-100 transition-opacity"
                (click)="toast.actions[0].resolve(false)"
              >{{ toast.actions[0].label }}</button>
              <button
                class="px-2 py-1 rounded text-xs font-semibold bg-white/20 hover:bg-white/30 transition-colors"
                (click)="toast.actions[1].resolve(true)"
              >{{ toast.actions[1].label }}</button>
            </div>
          } @else {
            <button
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
  `]
})
export class ToastContainerComponent {
  toastService = inject(ToastService);

  toastClasses(toast: Toast): string {
    const base = 'text-white';
    switch (toast.type) {
      case 'success': return `${base} bg-green-600`;
      case 'error':   return `${base} bg-red-600`;
      case 'warning': return `${base} bg-amber-600`;
      default:        return `${base} bg-neutral-700`;
    }
  }
}
