import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { CampaignContextService } from './campaign/campaign-context.service';
import { NavRailComponent } from './layout/nav-rail/nav-rail.component';
import { MobileTopbarComponent } from './layout/mobile-topbar/mobile-topbar.component';
import { AuthService } from './auth/auth.service';
import { PublicTopbarComponent } from './layout/public-topbar/public-topbar.component';
import { PanelSwitcherService } from './layout/panel-switcher/panel-switcher.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, NavRailComponent, MobileTopbarComponent, PublicTopbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="w-full min-h-dvh">
      <app-nav-rail />

      @if (authService.isAuthenticated()) {
        <app-mobile-topbar />
      }

      <div [class]="contentClass()">
        @if (!authService.isAuthenticated()) {
          <!-- A shared character or campaign is the first thing a visitor sees of the app: say where they are. -->
          <app-public-topbar />
        }
        <section>
          <router-outlet />
        </section>
      </div>
    </main>
  `
})
export class AppShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly campaignContext = inject(CampaignContextService);
  readonly authService = inject(AuthService);
  private readonly panels = inject(PanelSwitcherService);

  /** Room for the nav rail and the top bar; a page with panels runs edge to edge below the bar. */
  readonly contentClass = computed(() => {
    if (!this.authService.isAuthenticated()) return 'min-h-dvh p-3 sm:p-6';
    return this.panels.enabled() ? 'sm:ml-20 pt-14 sm:pt-0' : 'sm:ml-20 min-h-dvh p-3 pt-[4.5rem] sm:p-6';
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const campaignId = params.get('campaignId');
      if (campaignId) {
        void this.campaignContext.selectCampaign(campaignId);
      }
    });
  }
}
