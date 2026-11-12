import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Heroic inspiration: a toggle for the player, a plain badge for everyone else. */
@Component({
  selector: 'app-inspiration-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (editable()) {
      <button type="button" class="chip" [class.is-on]="inspired()" [attr.aria-pressed]="inspired()" (click)="inspiredChange.emit(!inspired())">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z" /></svg>
        Inspiration
      </button>
    } @else if (inspired()) {
      <span class="chip is-on">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z" /></svg>
        Inspiration
      </span>
    }
  `,
  styles: [`
    :host { position: relative; z-index: 1; display: inline-flex; }
    :host:empty { display: none; }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 32px;
      padding: 0.2rem 0.75rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--muted, #7b6e60);
      background: var(--paper, #fffdf8);
      border: 1px solid #d9c9a6;
    }
    button.chip { cursor: pointer; touch-action: manipulation; }
    .chip svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; }
    .chip.is-on { color: var(--ink, #2a2320); background: var(--gold, #b48a3c); border-color: var(--gold, #b48a3c); }
    .chip.is-on svg { fill: currentColor; }
  `]
})
export class InspirationToggleComponent {
  inspired = input(false);
  editable = input(false);
  inspiredChange = output<boolean>();
}
