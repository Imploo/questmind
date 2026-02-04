import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { CampaignContextService } from './campaign/campaign-context.service';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import { SidebarService } from './layout/sidebar.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    SidebarComponent
  ],
  template: `
    <main class="w-full min-h-screen bg-gradient-to-br from-primary to-secondary">
      <!-- Sticky Sidebar Component -->
      <app-sidebar />

      <!-- Mobile Backdrop -->
      @if (isMobile() && sidebarService.isExpanded()) {
        <div
          class="fixed inset-0 bg-black/50 z-30 lg:hidden"
          (click)="sidebarService.collapse()"
        ></div>
      }

      <!-- Main Content with Dynamic Margin -->
      <div [class]="contentClasses()">
        <!-- Mobile Toggle (lg:hidden) -->
        <div class="lg:hidden mb-4">
          <button
            (click)="sidebarService.toggle()"
            class="px-4 py-2 bg-white/20 backdrop-blur text-white rounded-lg font-semibold"
          >
            {{ sidebarService.isExpanded() ? 'Hide Menu' : 'Show Menu' }}
          </button>
        </div>

        <!-- Router Outlet -->
        <section class="flex-1">
          <router-outlet></router-outlet>
        </section>
      </div>
    </main>
  `
})
export class AppShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly campaignContext = inject(CampaignContextService);
  readonly sidebarService = inject(SidebarService);

  readonly isMobile = signal(typeof window !== 'undefined' && window.innerWidth < 1024);

  readonly contentClasses = computed(() => {
    const collapsed = this.sidebarService.isCollapsed();
    const marginLeft = this.isMobile() ? '' : (collapsed ? 'ml-20' : 'ml-64');
    return `min-h-screen ${marginLeft} transition-all duration-300 p-4`;
  });

  constructor() {
    this.route.paramMap.subscribe(params => {
      const campaignId = params.get('campaignId');
      if (campaignId) {
        void this.campaignContext.selectCampaign(campaignId);
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        this.isMobile.set(window.innerWidth < 1024);
      });
    }
  }
}
