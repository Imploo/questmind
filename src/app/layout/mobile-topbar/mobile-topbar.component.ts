import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { CampaignSelectorComponent } from '../../campaign/campaign-selector.component';
import { LogoComponent } from '../../shared/components/logo.component';
import { PanelSwitcherComponent } from '../panel-switcher/panel-switcher.component';
import { PanelSwitcherService } from '../panel-switcher/panel-switcher.service';

@Component({
  selector: 'app-mobile-topbar',
  imports: [CampaignSelectorComponent, LogoComponent, PanelSwitcherComponent],
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

    .topbar-content {
      flex: 1;
      min-width: 0;
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
    } @else if (onCampaignRoute()) {
      <div class="topbar-content">
        <app-campaign-selector [isCollapsed]="false" />
      </div>
    } @else {
      <span class="wordmark"><app-logo [size]="32" />Questmind</span>
    }
  `
})
export class MobileTopbarComponent {
  private readonly router = inject(Router);
  readonly panels = inject(PanelSwitcherService);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url)
    )
  );

  readonly onCampaignRoute = computed(() => {
    const url = this.currentUrl() ?? '';
    return url.startsWith('/campaign/');
  });
}
