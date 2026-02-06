import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { NavItem } from '../../nav-item.model';

@Component({
  selector: 'app-sidebar-nav-item',
  imports: [RouterLink, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      [routerLink]="item().route"
      [class]="itemClasses()"
      [title]="isCollapsed() ? item().label : ''"
    >
      <lucide-icon [name]="item().icon" [class]="iconClasses()" />
      @if (!isCollapsed()) {
        <span>{{ item().label }}</span>
      }
    </a>
  `
})
export class SidebarNavItemComponent {
  readonly item = input.required<NavItem>();
  readonly isActive = input.required<boolean>();
  readonly isCollapsed = input.required<boolean>();

  readonly itemClasses = computed(() => {
    const base = 'flex items-center rounded-xl text-sm font-semibold transition-colors cursor-pointer';
    const layout = this.isCollapsed() ? 'justify-center p-3 mx-2' : 'gap-3 px-4 py-3 mx-3';
    const active = this.isActive()
      ? 'bg-primary text-white shadow'
      : 'text-gray-600 hover:bg-gray-100';

    return `${base} ${layout} ${active}`;
  });

  readonly iconClasses = computed(() => {
    const size = this.isCollapsed() ? 'w-6 h-6' : 'w-5 h-5';
    return `shrink-0 ${size}`;
  });
}
