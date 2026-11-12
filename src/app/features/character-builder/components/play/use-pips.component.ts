import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** Above this many uses the diamonds make way for a counter (Lay on Hands, Sorcery Points). */
const POOL_THRESHOLD = 6;

/**
 * A row of diamonds for something that is spent and regained: spell slots, uses of
 * a feature. Gold is available, hollow is spent. Read-only unless `editable`.
 */
@Component({
  selector: 'app-use-pips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-pool]': 'isPool()' },
  template: `
    @if (isPool()) {
      <span class="pool">
        @if (editable()) {
          <button type="button" class="step" [disabled]="left() <= 0" [attr.aria-label]="'Spend 1 of ' + label()" (click)="spentChange.emit(spent() + 1)">−</button>
        }
        <span class="count"><strong>{{ left() }}</strong> / {{ total() }}</span>
        @if (editable()) {
          <button type="button" class="step" [disabled]="spent() <= 0" [attr.aria-label]="'Restore 1 of ' + label()" (click)="spentChange.emit(spent() - 1)">+</button>
        }
      </span>
    } @else if (editable()) {
      <span class="pips">
        @for (pip of pips(); track pip.index) {
          <button
            type="button"
            class="pip-button"
            [attr.aria-label]="label() + ' ' + (pip.index + 1) + (pip.spent ? ', spent' : ', available')"
            [attr.aria-pressed]="pip.spent"
            (click)="spentChange.emit(pip.spent ? spent() - 1 : spent() + 1)"
          >
            <span class="pip" [class.is-spent]="pip.spent"></span>
          </button>
        }
      </span>
    } @else {
      <span class="pips is-static" role="img" [attr.aria-label]="left() + ' of ' + total() + ' ' + label() + ' available'">
        @for (pip of pips(); track pip.index) {
          <span class="pip" [class.is-spent]="pip.spent"></span>
        }
      </span>
    }
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; }
    .pips { display: inline-flex; align-items: center; }
    .pips.is-static { gap: 0.6rem; padding: 0 0.35rem; }
    .pip-button {
      width: 36px;
      height: 44px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      cursor: pointer;
      touch-action: manipulation;
    }
    .pip {
      width: 15px;
      height: 15px;
      transform: rotate(45deg);
      border-radius: 3px;
      background: var(--gold, #b48a3c);
      border: 2px solid var(--gold, #b48a3c);
      transition: background 0.15s, border-color 0.15s;
    }
    .pip.is-spent { background: transparent; border-color: #a8956c; }
    .pip-button:hover .pip { box-shadow: 0 0 0 3px var(--gold-soft, #f2e6cb); }
    .pip-button:focus-visible { outline: 2px solid var(--gold-deep, #8a6623); outline-offset: -4px; border-radius: 8px; }

    .pool { display: inline-flex; align-items: center; gap: 0.25rem; }
    .count { min-width: 3.6rem; text-align: center; font-size: 0.9rem; color: var(--muted, #7b6e60); font-variant-numeric: tabular-nums; }
    .count strong { color: var(--ink, #2a2320); }
    .step {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      font-size: 1.2rem;
      font-weight: 600;
      line-height: 1;
      color: var(--gold-deep, #8a6623);
      background: var(--paper, #fffdf8);
      border: 1px solid #d9c9a6;
      cursor: pointer;
      touch-action: manipulation;
    }
    .step:hover:not(:disabled) { background: var(--gold-soft, #f2e6cb); }
    .step:disabled { opacity: 0.45; cursor: default; }
  `]
})
export class UsePipsComponent {
  total = input.required<number>();
  spent = input.required<number>();
  /** What is being counted, for screen readers: "Level 1 slot", "Channel Divinity". */
  label = input.required<string>();
  editable = input(false);
  spentChange = output<number>();

  left = computed(() => Math.max(0, this.total() - this.spent()));
  isPool = computed(() => this.total() > POOL_THRESHOLD);
  pips = computed(() => {
    const left = this.left();
    return Array.from({ length: Math.max(0, this.total()) }, (_, index) => ({ index, spent: index >= left }));
  });
}
