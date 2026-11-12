import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface DeathSaves {
  successes: number;
  failures: number;
}

/** Three successes and three failures. Tapping the last filled mark clears it again. */
@Component({
  selector: 'app-death-saves',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="title">Death Saves</span>
    @for (row of rows(); track row.key) {
      <div class="row">
        <span class="row-label" [class.is-fail]="row.key === 'failures'">{{ row.label }}</span>
        @for (mark of row.marks; track mark.index) {
          @if (editable()) {
            <button
              type="button"
              class="mark-button"
              [attr.aria-label]="row.label + ' ' + (mark.index + 1)"
              [attr.aria-pressed]="mark.filled"
              (click)="set(row.key, mark.index)"
            >
              <span class="mark" [class.is-fail]="row.key === 'failures'" [class.is-filled]="mark.filled"></span>
            </button>
          } @else {
            <span class="mark is-static" [class.is-fail]="row.key === 'failures'" [class.is-filled]="mark.filled"></span>
          }
        }
      </div>
    }
    @if (outcome()) {
      <span class="outcome">{{ outcome() }}</span>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 1.5rem;
      padding: 0.6rem 1rem;
      border-radius: 10px;
      background: #fbeeee;
      border: 1px solid #dfb1b5;
    }
    .title {
      font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #8a2732;
    }
    .row { display: flex; align-items: center; min-height: 44px; }
    .row-label { margin-right: 0.35rem; font-size: 0.78rem; font-weight: 600; color: #2f6337; }
    .row-label.is-fail { color: #8a2732; }
    .mark-button {
      width: 40px;
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
    .mark { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #4c8a52; background: var(--paper, #fffdf8); }
    .mark.is-filled { background: #4c8a52; }
    .mark.is-fail { border-radius: 3px; border-color: var(--wine, #9b2f3a); }
    .mark.is-fail.is-filled { background: var(--wine, #9b2f3a); }
    .mark.is-static { margin: 0 0.3rem; }
    .outcome { font-size: 0.85rem; font-weight: 700; color: #8a2732; }
  `]
})
export class DeathSavesComponent {
  successes = input.required<number>();
  failures = input.required<number>();
  editable = input(false);
  savesChange = output<DeathSaves>();

  rows = computed(() => [
    { key: 'successes' as const, label: 'Successes', marks: this.marks(this.successes()) },
    { key: 'failures' as const, label: 'Failures', marks: this.marks(this.failures()) },
  ]);

  outcome = computed(() => {
    if (this.failures() >= 3) return 'Dead';
    if (this.successes() >= 3) return 'Stable';
    return '';
  });

  set(key: keyof DeathSaves, index: number): void {
    const current = key === 'successes' ? this.successes() : this.failures();
    const next = current === index + 1 ? index : index + 1;
    this.savesChange.emit({
      successes: key === 'successes' ? next : this.successes(),
      failures: key === 'failures' ? next : this.failures(),
    });
  }

  private marks(count: number): { index: number; filled: boolean }[] {
    return [0, 1, 2].map(index => ({ index, filled: index < count }));
  }
}
