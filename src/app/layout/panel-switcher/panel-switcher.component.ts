import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PanelSwitcherService } from './panel-switcher.service';

/**
 * Two tabs, Sheet and Chat, for a character page that shows them as swipeable panels.
 * The parchment thumb follows the swipe; the labels under it are drawn a second time in
 * ink and clipped by the thumb, so a label that is half covered is half white, half ink.
 */
@Component({
  selector: 'app-panel-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track" role="group" aria-label="Weergave">
      <button type="button" class="tab" [attr.aria-pressed]="active() === 'sheet'" (click)="panels.show('sheet')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>
        Sheet
      </button>
      <button
        type="button"
        class="tab"
        [attr.aria-pressed]="active() === 'chat'"
        [attr.aria-label]="unread() ? 'Chat, nieuw antwoord' : null"
        (click)="panels.show('chat')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
        Chat
        @if (unread()) {
          <span class="dot" aria-hidden="true"></span>
        }
      </button>

      <div class="thumb" aria-hidden="true">
        <div class="ink">
          <span class="tab">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>
            Sheet
          </span>
          <span class="tab">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            Chat
          </span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      max-width: 17.5rem;
    }

    .track {
      position: relative;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      height: 44px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.16);
    }

    .tab {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 44px;
      padding: 0;
      border: 0;
      border-radius: 12px;
      background: none;
      font-family: var(--font-display);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #fff;
    }
    .tab svg { width: 16px; height: 16px; flex-shrink: 0; }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #f0cf7a;
    }

    /* Half the track wide, minus the 4px it keeps clear on each side. */
    .thumb {
      position: absolute;
      top: 4px;
      left: 4px;
      width: calc(50% - 8px);
      height: 36px;
      border-radius: 9px;
      overflow: hidden;
      pointer-events: none;
      background: var(--paper);
      box-shadow: 0 2px 8px -2px rgba(20, 10, 60, 0.6);
      transform: translateX(calc(var(--panel-progress, 0) * (100% + 8px)));
    }

    /* As wide as the track and moving against the thumb, so it stays put under it. */
    .ink {
      position: absolute;
      top: -4px;
      left: -4px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: calc(200% + 16px);
      height: 44px;
      transform: translateX(calc(var(--panel-progress, 0) * -50%));
    }
    .ink .tab { color: var(--ink); }
  `]
})
export class PanelSwitcherComponent {
  readonly panels = inject(PanelSwitcherService);
  readonly active = this.panels.active;
  readonly unread = this.panels.unread;
}
