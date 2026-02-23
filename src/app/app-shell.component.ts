import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { CampaignContextService } from './campaign/campaign-context.service';
import { NavRailComponent } from './layout/nav-rail/nav-rail.component';
import { MobileTopbarComponent } from './layout/mobile-topbar/mobile-topbar.component';
import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, NavRailComponent, MobileTopbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="w-full min-h-screen bg-gradient-to-br from-primary to-secondary">
      <app-nav-rail />

      @if (authService.isAuthenticated()) {
        <app-mobile-topbar />
      }

      <div [class]="authService.isAuthenticated() ? 'sm:ml-20 min-h-screen p-4 pt-16 sm:pt-4' : 'min-h-screen p-4'">
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

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const campaignId = params.get('campaignId');
      if (campaignId) {
        void this.campaignContext.selectCampaign(campaignId);
      }
    });
  }
}
