import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** A small ring on a concentration spell; a filled pill while concentrating on it. */
@Component({
  selector: 'app-concentration-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (active()) {
      <span class="pill">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle class="dot" cx="12" cy="12" r="2.5" /></svg>
        Concentrating
      </span>
    } @else {
      <svg viewBox="0 0 24 24" role="img" aria-label="Concentration spell"><circle cx="12" cy="12" r="8" /><circle class="dot" cx="12" cy="12" r="2.5" /></svg>
    }
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; flex-shrink: 0; color: #2f6b8f; }
    svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.4; }
    .dot { fill: currentColor; stroke: none; }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.05rem 0.5rem;
      border-radius: 999px;
      font-size: 0.68rem;
      font-weight: 600;
      color: #fff;
      background: #2f6b8f;
    }
    .pill svg { width: 11px; height: 11px; }
  `]
})
export class ConcentrationMarkComponent {
  /** Whether the character is concentrating on this spell right now. */
  active = input(false);
}
