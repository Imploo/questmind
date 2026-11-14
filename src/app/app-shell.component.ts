import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { CampaignContextService } from './campaign/campaign-context.service';
import { NavRailComponent } from './layout/nav-rail/nav-rail.component';
import { MobileTopbarComponent } from './layout/mobile-topbar/mobile-topbar.component';
import { AuthService } from './auth/auth.service';
import { LogoComponent } from './shared/components/logo.component';
import { PanelSwitcherService } from './layout/panel-switcher/panel-switcher.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, NavRailComponent, MobileTopbarComponent, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="w-full min-h-dvh">
      <app-nav-rail />

      @if (authService.isAuthenticated()) {
        <app-mobile-topbar />
      }

      <div [class]="contentClass()">
        @if (!authService.isAuthenticated()) {
          <!-- A shared character is the first thing a visitor sees of the app: say where they are. -->
          <header class="max-w-5xl mx-auto mb-4 flex items-center justify-between gap-3">
            <a routerLink="/" class="flex items-center gap-3 no-underline">
              <app-logo [size]="40" />
              <span class="font-display text-lg font-bold tracking-[0.08em] text-white">Questmind</span>
            </a>
            <a routerLink="/sign-in" class="qm-btn qm-btn-gold">Sign in</a>
          </header>
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
