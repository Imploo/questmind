import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Feedback after a play action, with an optional undo. It sticks to the bottom of the
 * viewport while the element it is the last child of is in view.
 */
@Component({
  selector: 'app-play-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status' },
  template: `
    <span class="text">{{ message() }}</span>
    <span class="buttons">
      @if (canUndo()) {
        <button type="button" class="btn is-undo" (click)="undo.emit()">Undo</button>
      }
      <button type="button" class="btn" (click)="dismissed.emit()">Dismiss</button>
    </span>
  `,
  styles: [`
    :host {
      position: sticky;
      /* Stay clear of the collapsed chat drawer on narrow screens. */
      bottom: calc(8vh + 0.75rem);
      z-index: 20;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.25rem 1rem;
      padding: 0.35rem 0.5rem 0.35rem 1rem;
      border-radius: 10px;
      font-size: 0.85rem;
      color: #f6efe0;
      background: var(--ink, #2a2320);
      box-shadow: 0 12px 28px -10px rgba(40, 25, 5, 0.55);
    }
    .text { flex: 1 1 12rem; padding: 0.4rem 0; }
    .buttons { display: flex; gap: 0.25rem; flex-shrink: 0; }
    .btn {
      min-height: 40px;
      padding: 0 0.85rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      color: #f6efe0;
      background: transparent;
      border: 1px solid transparent;
      cursor: pointer;
    }
    .btn.is-undo { font-weight: 700; color: #f0cf85; border-color: #6b5a3a; }
  `]
})
export class PlayToastComponent {
  message = input.required<string>();
  canUndo = input(false);
  undo = output<void>();
  dismissed = output<void>();
}
