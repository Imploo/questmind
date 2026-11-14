import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RestPreviewRow } from '../../../../shared/utils/character-play-state';

/** Confirmation for a long rest, listing what it is about to change. */
@Component({
  selector: 'app-rest-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'cancelled.emit()' },
  template: `
    <div class="backdrop" (click)="cancelled.emit()">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rest-dialog-title" (click)="$event.stopPropagation()">
        <h2 id="rest-dialog-title">Take a long rest?</h2>

        @if (rows().length) {
          <dl>
            @for (row of rows(); track row.label) {
              <div class="row">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            }
          </dl>
        } @else {
          <p class="note">Everything is already at full strength.</p>
        }

        <p class="note">Conditions stay as they are. You can undo the rest right afterwards.</p>

        <div class="actions">
          <button type="button" class="btn" (click)="cancelled.emit()">Cancel</button>
          <button type="button" class="btn is-primary" (click)="confirmed.emit()">Take long rest</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(42, 35, 32, 0.45);
    }
    .dialog {
      width: 100%;
      max-width: 26rem;
      max-height: 100%;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      padding: 1.5rem;
      border-radius: 14px;
      color: var(--ink, #2a2320);
      background: var(--paper, #fffdf8);
      border: 1px solid var(--line, #e8dcc5);
      box-shadow: 0 24px 48px -16px rgba(60, 40, 10, 0.5);
    }
    h2 { margin: 0; font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; }
    dl { margin: 0; }
    .row { display: flex; justify-content: space-between; gap: 0.75rem; padding: 0.45rem 0; font-size: 0.875rem; border-bottom: 1px dashed #efe6d4; }
    .row:last-child { border-bottom: none; }
    dd { margin: 0; font-weight: 700; text-align: right; }
    .note { margin: 0; font-size: 0.78rem; color: var(--muted, #7b6e60); }
    .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .btn {
      min-height: 44px;
      padding: 0 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--ink, #2a2320);
      background: var(--paper, #fffdf8);
      border: 1px solid #d9c9a6;
      cursor: pointer;
    }
    .btn.is-primary { font-weight: 700; color: #f6efe0; background: var(--ink, #2a2320); border-color: var(--ink, #2a2320); }
  `]
})
export class RestDialogComponent {
  rows = input.required<RestPreviewRow[]>();
  confirmed = output<void>();
  cancelled = output<void>();
}
