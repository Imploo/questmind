import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';

/**
 * The hit point tile: current / max, temporary hit points and the bar. When
 * `editable`, an amount can be applied as healing, temporary hit points or damage.
 */
@Component({
  selector: 'app-hp-tracker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <div class="value">
        <span class="current" [class.is-down]="current() <= 0">{{ current() }}</span>
        <span class="max">/ {{ max() }}</span>
        @if (temp() > 0) {
          <span class="temp" title="Temporary hit points">
            <svg viewBox="0 0 40 46" aria-hidden="true"><path d="M20 3 L36 9 V22 C36 32 29 39 20 43 C11 39 4 32 4 22 V9 Z" /></svg>
            +{{ temp() }} temp
          </span>
        }
      </div>
      <span class="label">Hit Points</span>
    </div>

    <div class="track" role="progressbar" aria-label="Hit points" [attr.aria-valuenow]="current()" aria-valuemin="0" [attr.aria-valuemax]="max()">
      <div class="fill" [class.is-low]="isLow()" [style.width.%]="hpPercent()"></div>
      <div class="fill-temp" [style.width.%]="tempPercent()"></div>
    </div>

    @if (editable()) {
      <div class="controls">
        <input
          #amountInput
          class="amount"
          type="number"
          min="0"
          inputmode="numeric"
          placeholder="Amount"
          aria-label="Amount"
          [value]="amount()"
          (input)="amount.set($any($event.target).value)"
        />
        <button type="button" class="btn heal" (click)="apply('heal')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
          Heal
        </button>
        <button type="button" class="btn temp-btn" (click)="apply('temp')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 2.6v5.9c0 4.4-3 7.6-7 9.5-4-1.9-7-5.1-7-9.5V5.6z" /></svg>
          Temp
        </button>
      </div>
      <button type="button" class="btn damage" (click)="apply('damage')">Damage</button>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      padding: 0.85rem 1rem;
      border-radius: 10px;
      background: var(--paper-2, #f8f2e6);
      border: 1px solid var(--line, #e8dcc5);
      min-width: 0;
    }
    .head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.25rem 0.75rem; }
    .value { display: flex; align-items: baseline; gap: 0.35rem; }
    .current { font-size: 2.1rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
    .current.is-down { color: #8a2732; }
    .max { font-size: 0.95rem; color: var(--muted, #7b6e60); }
    .temp {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      margin-left: 0.35rem;
      padding: 0.1rem 0.55rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 700;
      color: #24587a;
      background: #e3eef5;
      border: 1px solid #a9c7da;
    }
    .temp svg { width: 11px; height: 12px; fill: none; stroke: currentColor; stroke-width: 5; }
    .label {
      font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
      font-size: 0.62rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted, #7b6e60);
    }

    .track { display: flex; height: 10px; border-radius: 999px; background: #eadfcb; overflow: hidden; }
    .fill { height: 100%; background: var(--wine, #9b2f3a); transition: width 0.3s ease; }
    .fill.is-low { background: #c2571f; }
    .fill-temp { height: 100%; background: #3d7ea6; transition: width 0.3s ease; }

    .controls { display: flex; align-items: center; gap: 0.4rem; }
    .amount {
      flex: 1 1 4.5rem;
      width: 4.5rem;
      min-width: 3rem;
      height: 40px;
      padding: 0 0.4rem;
      text-align: center;
      font-size: 1rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--ink, #2a2320);
      background: var(--paper, #fffdf8);
      border: 1.5px solid var(--gold, #b48a3c);
      border-radius: 8px;
    }
    .amount::placeholder { font-size: 0.78rem; font-weight: 500; color: var(--muted, #7b6e60); }
    .btn {
      min-height: 40px;
      padding: 0 0.7rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      touch-action: manipulation;
      transition: filter 0.15s, background 0.15s;
    }
    .heal, .temp-btn {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      font-size: 0.8rem;
      background: var(--paper, #fffdf8);
    }
    .btn svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linejoin: round; }
    .heal { color: #2f6337; border: 1.5px solid #4c8a52; }
    .heal:hover { background: #edf5ee; }
    .temp-btn { color: #24587a; border: 1.5px solid #3d7ea6; }
    .temp-btn:hover { background: #e3eef5; }
    .damage {
      width: 100%;
      min-height: 46px;
      font-size: 0.95rem;
      letter-spacing: 0.02em;
      color: #fff;
      background: var(--wine, #9b2f3a);
      border: 1.5px solid var(--wine, #9b2f3a);
    }
    .damage:hover { filter: brightness(1.08); }
  `]
})
export class HpTrackerComponent {
  current = input.required<number>();
  max = input.required<number>();
  temp = input(0);
  editable = input(false);

  damage = output<number>();
  heal = output<number>();
  tempChange = output<number>();

  amount = signal('');
  private readonly amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput');

  /** The amount as a whole number, 0 when empty or invalid. */
  value = computed(() => {
    const parsed = Number.parseInt(this.amount(), 10);
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  });

  /** The bar stretches when temporary hit points push the total above the maximum. */
  private scale = computed(() => Math.max(this.max(), this.current() + this.temp(), 1));
  hpPercent = computed(() => (Math.max(0, this.current()) / this.scale()) * 100);
  tempPercent = computed(() => (Math.max(0, this.temp()) / this.scale()) * 100);
  isLow = computed(() => this.max() > 0 && this.current() / this.max() <= 0.25);

  /** Without an amount the buttons point the player to the input; only Temp accepts 0, to clear it. */
  apply(kind: 'damage' | 'heal' | 'temp'): void {
    const value = this.value();
    if (this.amount() === '' || (value === 0 && kind !== 'temp')) {
      this.amountInput()?.nativeElement.focus();
      return;
    }
    if (kind === 'damage') this.damage.emit(value);
    else if (kind === 'heal') this.heal.emit(value);
    else this.tempChange.emit(value);
    this.amount.set('');
  }
}
