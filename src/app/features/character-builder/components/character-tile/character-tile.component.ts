import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * One character in the character list: a framed portrait with a name plate, like a
 * miniature of the sheet's hero. Opened with a click or Enter.
 */
@Component({
  selector: 'app-character-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'link',
    tabindex: '0',
    '[class.is-archived]': 'archived()',
    '(click)': 'opened.emit()',
    '(keydown.enter)': 'opened.emit()',
  },
  template: `
    <span class="art">
      @if (imageUrl()) {
        <img [src]="imageUrl()" alt="" class="absolute inset-0 w-full h-full object-cover" [class.grayscale]="archived()" />
      } @else {
        <span class="initial" aria-hidden="true">{{ initial() }}</span>
      }
      @if (level(); as level) {
        <span class="level" [attr.aria-label]="'Level ' + level">{{ level }}</span>
      }

      @if (archived()) {
        <!-- An archived character comes back to the list with one click -->
        <button
          type="button"
          class="qm-btn qm-btn-sm absolute top-2 right-2"
          [attr.aria-label]="'Unarchive ' + name()"
          (click)="$event.stopPropagation(); restored.emit()"
          (keydown.enter)="$event.stopPropagation()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-7 9v-5m0 0l-2 2m2-2l2 2" /></svg>
          Unarchive
        </button>
      }
    </span>
    <span class="plate">
      <span class="name">{{ name() }}</span>
      <span class="qm-eyebrow block truncate">{{ subtitle() }}</span>
    </span>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 6px;
      color: var(--ink);
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: var(--panel-shadow);
      cursor: pointer;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    }
    :host(:hover) {
      transform: translateY(-4px);
      border-color: var(--gold);
      box-shadow: 0 22px 40px -18px rgba(24, 12, 60, 0.75);
    }
    /* Put away: the same card, with the colour drained from it. */
    :host(.is-archived) { background: var(--paper-2); }
    :host(.is-archived) .art { background: linear-gradient(135deg, #8d8a9e, #6d6480); }
    :host(.is-archived) .level { background: #6b5f55; }
    :host(.is-archived) .name { color: var(--muted); }

    .art {
      position: relative;
      display: block;
      aspect-ratio: 1;
      border-radius: 9px;
      background: var(--brand-gradient);
      box-shadow: inset 0 0 0 1px rgba(180, 138, 60, 0.35);
    }
    .art > img { border-radius: inherit; }
    .initial {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-size: clamp(2.5rem, 8vw, 4rem);
      font-weight: 700;
      color: rgba(255, 255, 255, 0.92);
      text-shadow: 0 4px 18px rgba(30, 12, 80, 0.5);
    }
    .level {
      position: absolute;
      right: -4px;
      bottom: -10px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 2rem;
      height: 2rem;
      padding: 0 0.4rem;
      border-radius: 999px;
      font-family: var(--font-display);
      font-size: 0.85rem;
      font-weight: 700;
      color: #fff;
      background: var(--wine);
      border: 2px solid var(--paper);
    }
    .plate { display: block; min-width: 0; padding: 0.7rem 0.45rem 0.45rem; }
    .name {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      padding-right: 1.4rem;
      overflow: hidden;
      overflow-wrap: anywhere;
      font-family: var(--font-display);
      font-size: 0.92rem;
      font-weight: 700;
      line-height: 1.3;
    }
    @media (prefers-reduced-motion: reduce) {
      :host(:hover) { transform: none; }
    }
  `]
})
export class CharacterTileComponent {
  name = input.required<string>();
  subtitle = input('');
  imageUrl = input<string | null>(null);
  /** Shown as a badge on the portrait; left out when unknown. */
  level = input<number | null>(null);
  /** An archived tile is greyed out and offers to bring the character back. */
  archived = input(false);
  opened = output<void>();
  restored = output<void>();

  protected initial = computed(() => this.name().trim().charAt(0).toUpperCase() || '?');
}
