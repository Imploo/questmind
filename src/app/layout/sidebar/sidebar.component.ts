import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { SidebarService } from '../sidebar.service';
import { UserService } from '../../core/user.service';
import { SidebarHeaderComponent } from './sidebar-header/sidebar-header.component';
import { SidebarNavComponent } from './sidebar-nav/sidebar-nav.component';
import { SidebarFooterComponent } from './sidebar-footer/sidebar-footer.component';
import { NavItem } from '../nav-item.model';

@Component({
  selector: 'app-sidebar',
  imports: [SidebarHeaderComponent, SidebarNavComponent, SidebarFooterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside [class]="sidebarClasses()" [class.hidden]="isMobile() && !sidebarService.isExpanded()">
      <!-- Zone 1: TOP (Header) -->
      <div class="flex-shrink-0 border-b border-gray-200">
        <app-sidebar-header
          [isCollapsed]="sidebarService.isCollapsed()"
          (toggleCollapse)="sidebarService.toggle()"
        />
      </div>

      <!-- Zone 2: MIDDLE (Nav) -->
      <nav class="flex-1 overflow-y-auto py-4">
        <app-sidebar-nav
          [items]="navItems()"
          [isCollapsed]="sidebarService.isCollapsed()"
          [activeRoute]="activeRoute()"
        />
      </nav>

      <!-- Zone 3: BOTTOM (Footer/Profile) -->
      <div class="flex-shrink-0 border-t border-gray-200">
        <app-sidebar-footer
          [isCollapsed]="sidebarService.isCollapsed()"
        />
      </div>
    </aside>
  `
})
export class SidebarComponent {
  readonly sidebarService = inject(SidebarService);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);

  readonly isMobile = signal(typeof window !== 'undefined' && window.innerWidth < 1024);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        this.isMobile.set(window.innerWidth < 1024);
      });
    }

    // Auto-close sidebar on mobile when route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      if (this.isMobile()) {
        this.sidebarService.collapse();
      }
    });
  }

  private readonly routerEvents = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url)
    )
  );

  readonly activeRoute = computed(() => {
    const url = this.routerEvents() || '';
    // Extract the first segment after campaign ID
    const match = url.match(/\/campaign\/[^/]+\/([^/?]+)/);
    return match ? match[1] : '';
  });

  readonly navItems = computed((): NavItem[] => {
    const items: NavItem[] = [
      { id: 'chat', label: 'Character Chat', route: 'chat', icon: '💬' },
      { id: 'audio', label: 'Audio Transcription', route: 'audio', icon: '🎤' },
      { id: 'podcasts', label: 'Podcast Bibliotheek', route: 'podcasts', icon: '🎵' },
    ];

    if (this.userService.isAdmin()) {
      items.push({ id: 'admin', label: 'Admin', route: 'admin', icon: '⚙️', adminOnly: true });
    }

    return items;
  });

  readonly sidebarClasses = computed(() => {
    const collapsed = this.sidebarService.isCollapsed();
    const mobile = this.isMobile();
    return [
      'fixed left-0 top-0 h-screen',
      'bg-white/90 backdrop-blur shadow-lg',
      'flex flex-col',
      'transition-all duration-300 ease-in-out',
      'z-40',
      mobile ? 'w-64' : (collapsed ? 'w-20' : 'w-64')
    ].join(' ');
  });
}
