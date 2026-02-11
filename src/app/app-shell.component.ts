import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { CampaignContextService } from './campaign/campaign-context.service';
import { NavRailComponent } from './layout/nav-rail/nav-rail.component';
import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, NavRailComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="w-full min-h-screen bg-gradient-to-br from-primary to-secondary">
      <app-nav-rail />

      <div [class]="authService.isAuthenticated() ? 'ml-20 min-h-screen p-4' : 'min-h-screen p-4'">
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
    this.route.paramMap.subscribe(params => {
      const campaignId = params.get('campaignId');
      if (campaignId) {
        void this.campaignContext.selectCampaign(campaignId);
      }
    });
  }
}
