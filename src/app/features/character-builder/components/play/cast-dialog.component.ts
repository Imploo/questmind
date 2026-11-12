import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, input, linkedSignal, output } from '@angular/core';

/** One way to pay for a cast: a slot level, a use of the spell's own tracker, or nothing. */
export interface CastOption {
  id: string;
  label: string;
  /** What is left: "3 slots left". */
  detail: string;
  disabled: boolean;
  /** The spell's own level, highlighted as the default choice. */
  primary: boolean;
  slotLevel?: number;
  usesKey?: string;
}

export interface CastChoice {
  option: CastOption;
  concentrate: boolean;
}

/**
 * Small dialog next to a spell's Cast button: pick the slot level to cast at and
 * decide whether the spell takes over concentration.
 */
@Component({
  selector: 'app-cast-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="'Cast ' + spellName()">
      <div class="title">Cast {{ spellName() }}</div>
      <div class="hint">Choose the slot level to cast at.</div>

      @for (option of options(); track option.id) {
        <button
          type="button"
          class="option"
          [class.is-primary]="option.primary"
          [disabled]="option.disabled"
          (click)="cast.emit({ option, concentrate: concentrate() })"
        >
          <span>{{ option.label }}</span>
          <span class="detail">{{ option.detail }}</span>
        </button>
      }

      <label class="concentrate">
        <input type="checkbox" [checked]="concentrate()" (change)="concentrate.set($any($event.target).checked)" />
        <span>
          Starts concentration
          @if (concentrate() && currentConcentration() && currentConcentration() !== spellName()) {
            — {{ currentConcentration() }} ends
          }
        </span>
      </label>

      <button type="button" class="cancel" (click)="closed.emit()">Cancel</button>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .backdrop { position: fixed; inset: 0; z-index: 40; }
    .dialog {
      position: absolute;
      right: 0;
      top: 100%;
      z-index: 41;
      width: 290px;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 1rem;
      border-radius: 12px;
      background: var(--paper, #fffdf8);
      border: 1px solid #d9c9a6;
      box-shadow: 0 16px 36px -12px rgba(60, 40, 10, 0.45);
      text-align: left;
    }
    .title { font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif; font-size: 0.95rem; font-weight: 700; color: var(--ink, #2a2320); }
    .hint { margin-bottom: 0.1rem; font-size: 0.78rem; color: var(--muted, #7b6e60); }
    .option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      min-height: 44px;
      padding: 0 0.85rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--ink, #2a2320);
      background: var(--paper, #fffdf8);
      border: 1.5px solid #d9c9a6;
      cursor: pointer;
      touch-action: manipulation;
    }
    .option.is-primary { background: var(--gold-soft, #f2e6cb); border-color: var(--gold, #b48a3c); }
    .option:hover:not(:disabled) { border-color: var(--gold-deep, #8a6623); }
    .option:disabled { color: var(--muted, #7b6e60); background: var(--paper-2, #f8f2e6); border-color: var(--line, #e8dcc5); cursor: default; }
    .detail { font-size: 0.78rem; font-weight: 500; }
    .concentrate { display: flex; align-items: center; gap: 0.5rem; min-height: 36px; font-size: 0.8rem; font-weight: 500; color: #24587a; cursor: pointer; }
    .concentrate input { width: 1rem; height: 1rem; accent-color: #2f6b8f; }
    .cancel {
      align-self: flex-end;
      min-height: 40px;
      padding: 0 0.75rem;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--ink, #2a2320);
      background: transparent;
      border: 1px solid transparent;
      cursor: pointer;
    }
    .cancel:hover { border-color: var(--line, #e8dcc5); }
  `]
})
export class CastDialogComponent {
  spellName = input.required<string>();
  options = input.required<CastOption[]>();
  /** Whether the spell is known to need concentration; the player can still change it. */
  needsConcentration = input(false);
  currentConcentration = input<string | null>(null);

  cast = output<CastChoice>();
  closed = output<void>();

  concentrate = linkedSignal(() => this.needsConcentration());

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  constructor() {
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLButtonElement>('.option:not(:disabled)')?.focus();
    });
  }
}
