import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, signal, viewChild } from '@angular/core';
import { Coins } from '../../../../shared/models/dnd-character.model';

type CoinKey = keyof Coins;

const COIN_TYPES: { key: CoinKey; name: string; color: string }[] = [
  { key: 'pp', name: 'Platinum', color: '#d9dde3' },
  { key: 'gp', name: 'Gold', color: '#e2b13c' },
  { key: 'ep', name: 'Electrum', color: '#cfc38a' },
  { key: 'sp', name: 'Silver', color: '#b9bec4' },
  { key: 'cp', name: 'Copper', color: '#b8693a' },
];

const MAX_COINS = 9_999_999;

/** The five coin types. When `editable`, a coin turns into a number field on click. */
@Component({
  selector: 'app-coin-purse',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (coin of coinList(); track coin.key) {
      @if (editing() === coin.key) {
        <span class="coin is-editing">
          <span class="dot" [style.background]="coin.color" aria-hidden="true"></span>
          <input
            #amountInput
            type="number"
            min="0"
            inputmode="numeric"
            [attr.aria-label]="coin.name + ' pieces'"
            [value]="coin.amount"
            (blur)="commit(coin.key, $any($event.target).value)"
            (keydown.enter)="$any($event.target).blur()"
            (keydown.escape)="cancel()"
          />
          <span class="unit">{{ coin.key }}</span>
        </span>
      } @else if (editable()) {
        <button type="button" class="coin" [title]="'Change ' + coin.name.toLowerCase()" [attr.aria-label]="coin.amount + ' ' + coin.name.toLowerCase() + ', change'" (click)="editing.set(coin.key)">
          <span class="dot" [style.background]="coin.color" aria-hidden="true"></span>
          <strong>{{ coin.amount }}</strong>
          <span class="unit">{{ coin.key }}</span>
        </button>
      } @else {
        <span class="coin" [title]="coin.name">
          <span class="dot" [style.background]="coin.color" aria-hidden="true"></span>
          <strong>{{ coin.amount }}</strong>
          <span class="unit">{{ coin.key }}</span>
        </span>
      }
    }
  `,
  styles: [`
    :host { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .coin {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 36px;
      padding: 0.25rem 0.7rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
      color: var(--ink, #2a2320);
      background: var(--paper-2, #f8f2e6);
      border: 1px solid var(--line, #e8dcc5);
    }
    button.coin { cursor: pointer; touch-action: manipulation; transition: border-color 0.15s, background 0.15s; }
    button.coin:hover { border-color: var(--gold, #b48a3c); background: var(--gold-soft, #f2e6cb); }
    .coin.is-editing { border-color: var(--gold, #b48a3c); background: var(--paper, #fffdf8); }
    .dot { width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.5); }
    .unit { font-size: 0.7rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted, #7b6e60); }
    input {
      width: 4.5rem;
      padding: 0;
      font-size: 1rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--ink, #2a2320);
      background: transparent;
      border: none;
      outline: none;
    }
  `]
})
export class CoinPurseComponent {
  coins = input.required<Coins>();
  editable = input(false);
  /** The whole purse after one coin type changed. */
  coinsChange = output<Coins>();

  editing = signal<CoinKey | null>(null);
  private readonly amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput');

  coinList = computed(() => {
    const coins = this.coins();
    return COIN_TYPES.map(type => ({ ...type, amount: coins?.[type.key] ?? 0 }));
  });

  constructor() {
    // Put the cursor in the field as soon as a coin is opened for editing.
    effect(() => {
      const field = this.amountInput()?.nativeElement;
      if (field) {
        field.focus();
        field.select();
      }
    });
  }

  commit(key: CoinKey, raw: string): void {
    if (this.editing() !== key) return;
    this.editing.set(null);
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    const amount = Math.max(0, Math.min(MAX_COINS, parsed));
    const purse = Object.fromEntries(this.coinList().map(coin => [coin.key, coin.amount])) as unknown as Coins;
    if (amount === purse[key]) return;
    this.coinsChange.emit({ ...purse, [key]: amount });
  }

  cancel(): void {
    this.editing.set(null);
  }
}
