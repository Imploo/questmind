import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';

/**
 * The QuestMind mark: the d20 with the brain. On its own it needs a light surface,
 * so by default it comes on a parchment seal that holds on the gradient and on the
 * navigation alike; `plain` leaves the seal off for use on a panel.
 */
@Component({
  selector: 'app-logo',
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-plain]': 'plain()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  template: `<img ngSrc="icons/icon.svg" [width]="markSize()" [height]="markSize()" alt="" />`,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #ffffff, var(--paper) 60%, var(--gold-soft));
      box-shadow: 0 0 0 2px #e5c77f, 0 8px 18px -8px rgba(16, 8, 48, 0.75);
    }
    :host(.is-plain) { border-radius: 0; background: none; box-shadow: none; }
  `]
})
export class LogoComponent {
  /** Outer size in pixels. */
  size = input(44);
  plain = input(false);

  protected markSize = computed(() => (this.plain() ? this.size() : Math.round(this.size() * 0.74)));
}
