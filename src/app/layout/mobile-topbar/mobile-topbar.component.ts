import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CampaignSelectorComponent } from '../../campaign/campaign-selector.component';

@Component({
  selector: 'app-mobile-topbar',
  imports: [CampaignSelectorComponent],
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
      padding-left: 48px;
      padding-right: 48px;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
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
  `],
  template: `
    <div class="topbar-content">
      <app-campaign-selector [isCollapsed]="false" />
    </div>
  `
})
export class MobileTopbarComponent {}
