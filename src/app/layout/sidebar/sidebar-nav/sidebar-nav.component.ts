import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { SidebarNavItemComponent } from './sidebar-nav-item.component';
import { NavItem } from '../../nav-item.model';

@Component({
  selector: 'app-sidebar-nav',
  imports: [SidebarNavItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-1">
      @for (item of items(); track item.id) {
        <app-sidebar-nav-item
          [item]="item"
          [isActive]="activeRoute() === item.route"
          [isCollapsed]="isCollapsed()"
        />
      }
    </div>
  `
})
export class SidebarNavComponent {
  readonly items = input.required<NavItem[]>();
  readonly isCollapsed = input.required<boolean>();
  readonly activeRoute = input.required<string>();
}
