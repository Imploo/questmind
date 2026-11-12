import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CONDITIONS, MAX_EXHAUSTION } from '../../../../shared/utils/character-play-state';

/**
 * Active conditions, exhaustion and the spell being concentrated on. When `editable`,
 * conditions are toggled from a picker and concentration can be dropped.
 */
@Component({
  selector: 'app-conditions-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <span class="title">Conditions</span>

      @if (!conditions().length && !exhaustion()) {
        <span class="none">None</span>
      }

      @for (condition of conditions(); track condition) {
        @if (editable()) {
          <button type="button" class="chip is-active" [attr.aria-label]="'Remove ' + condition" (click)="conditionToggle.emit(condition)">
            {{ condition }}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        } @else {
          <span class="chip is-active is-static">{{ condition }}</span>
        }
      }

      @if (exhaustion()) {
        <span class="chip is-exhaustion is-static">Exhaustion {{ exhaustion() }}</span>
      }

      @if (editable()) {
        <button type="button" class="chip is-add" [attr.aria-expanded]="pickerOpen()" (click)="pickerOpen.set(!pickerOpen())">
          @if (!pickerOpen()) {
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          }
          {{ pickerOpen() ? 'Done' : 'Add' }}
        </button>
      }

      @if (concentration(); as spell) {
        @if (editable()) {
          <button type="button" class="chip is-concentration" [attr.aria-label]="'Stop concentrating on ' + spell" (click)="concentrationEnd.emit()">
            <svg class="conc-ring" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle class="dot" cx="12" cy="12" r="2.5" /></svg>
            Concentrating · {{ spell }}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        } @else {
          <span class="chip is-concentration is-static">
            <svg class="conc-ring" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle class="dot" cx="12" cy="12" r="2.5" /></svg>
            Concentrating · {{ spell }}
          </span>
        }
      }
    </div>

    @if (editable() && pickerOpen()) {
      <div class="picker">
        <div class="options">
          @for (option of options(); track option.name) {
            <button type="button" class="chip" [class.is-active]="option.active" [attr.aria-pressed]="option.active" (click)="conditionToggle.emit(option.name)">
              {{ option.name }}
            </button>
          }
        </div>
        <div class="exhaustion">
          <span class="exhaustion-label">Exhaustion</span>
          <button type="button" class="step" aria-label="Lower exhaustion" [disabled]="exhaustion() <= 0" (click)="exhaustionChange.emit(exhaustion() - 1)">−</button>
          <span class="exhaustion-value">{{ exhaustion() }}</span>
          <button type="button" class="step" aria-label="Raise exhaustion" [disabled]="exhaustion() >= maxExhaustion" (click)="exhaustionChange.emit(exhaustion() + 1)">+</button>
          <span class="hint">Level 0–{{ maxExhaustion }} · a long rest removes one level</span>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 0.75rem; }
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .title {
      margin-right: 0.25rem;
      font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--gold-deep, #8a6623);
    }
    .none { font-size: 0.82rem; font-style: italic; color: var(--muted, #7b6e60); }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      min-height: 40px;
      padding: 0 0.85rem;
      border-radius: 999px;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--ink, #2a2320);
      background: var(--paper, #fffdf8);
      border: 1.5px solid #d9c9a6;
      touch-action: manipulation;
    }
    button.chip { cursor: pointer; }
    .chip.is-static { min-height: 32px; }
    .chip svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; }
    /* Not "ring": that is a Tailwind utility. */
    .chip .conc-ring { width: 14px; height: 14px; stroke-width: 2.2; }
    .chip .conc-ring .dot { fill: currentColor; stroke: none; }
    .chip.is-active { color: #fff; background: var(--wine, #9b2f3a); border-color: var(--wine, #9b2f3a); }
    .chip.is-exhaustion { color: #8a2732; background: #fbeeee; border-color: var(--wine, #9b2f3a); }
    .chip.is-add { color: var(--gold-deep, #8a6623); border-style: dashed; border-color: var(--gold, #b48a3c); }
    .chip.is-add:hover { background: var(--gold-soft, #f2e6cb); }
    .chip.is-concentration { margin-left: auto; color: #24587a; background: #e3eef5; border-color: #3d7ea6; }

    .picker {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 0.85rem;
      border-radius: 10px;
      background: var(--paper-2, #f8f2e6);
      border: 1px solid var(--line, #e8dcc5);
    }
    .options { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .exhaustion { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .exhaustion-label { font-size: 0.82rem; font-weight: 600; }
    .exhaustion-value { min-width: 1.75rem; text-align: center; font-size: 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .hint { font-size: 0.78rem; color: var(--muted, #7b6e60); }
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
    }
    .step:disabled { opacity: 0.45; cursor: default; }
  `]
})
export class ConditionsBarComponent {
  conditions = input.required<string[]>();
  exhaustion = input(0);
  concentration = input<string | null>(null);
  editable = input(false);

  conditionToggle = output<string>();
  exhaustionChange = output<number>();
  concentrationEnd = output<void>();

  pickerOpen = signal(false);
  readonly maxExhaustion = MAX_EXHAUSTION;

  options = computed(() => {
    const active = new Set(this.conditions());
    return CONDITIONS.map(name => ({ name, active: active.has(name) }));
  });
}
