import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { LogoComponent } from '../../shared/components/logo.component';
import { PanelSwitcherComponent } from '../panel-switcher/panel-switcher.component';
import { PanelSwitcherService } from '../panel-switcher/panel-switcher.service';

@Component({
  selector: 'app-mobile-topbar',
  imports: [LogoComponent, PanelSwitcherComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 56px;
      z-index: 45;
      display: flex;
      align-items: center;
      justify-content: center;
      padding-left: 52px;
      padding-right: 52px;
      background: linear-gradient(90deg, rgba(36, 24, 92, 0.5), rgba(58, 28, 104, 0.56));
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.16);
      /* A page with panels sets this while a keyboard pushes the visible part down. */
      transform: translateY(var(--vv-top, 0px));
    }

    @media (min-width: 640px) {
      :host {
        display: none;
      }
    }

    .wordmark {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #fff;
    }
  `],
  template: `
    @if (panels.enabled()) {
      <!-- A character page with a chat: the bar switches between its two panels. -->
      <app-panel-switcher />
    } @else {
      <span class="wordmark" data-no-i18n><app-logo [size]="32" />Questmind</span>
    }
  `
})
export class MobileTopbarComponent {
  readonly panels = inject(PanelSwitcherService);
}
