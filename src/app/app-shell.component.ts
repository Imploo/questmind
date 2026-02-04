import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthButtonComponent } from './auth/auth-button.component';
import { CampaignSelectorComponent } from './campaign/campaign-selector.component';
import { CampaignContextService } from './campaign/campaign-context.service';
import { UserService } from './core/user.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    AuthButtonComponent,
    CampaignSelectorComponent
  ],
  template: `
    <main class="w-full min-h-screen bg-gradient-to-br from-primary to-secondary">
      <div class="w-full min-h-screen max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 p-4">
        <div class="flex items-center justify-between lg:hidden">
          <div class="text-white">
            <p class="m-0 text-xs uppercase tracking-wide text-white/70">Questmind</p>
            <h2 class="m-0 text-lg font-semibold">Navigation</h2>
          </div>
          <div class="flex items-center gap-3">
            <app-auth-button></app-auth-button>
            <button
              type="button"
              class="px-4 py-2 text-sm font-semibold rounded-full bg-white/20 text-white"
              (click)="toggleSidebar()"
            >
              {{ sidebarOpen() ? 'Hide Menu' : 'Show Menu' }}
            </button>
          </div>
        </div>

        <aside
          class="w-full lg:w-64 bg-white/90 backdrop-blur rounded-2xl p-5 shadow-lg h-fit lg:block"
          [class.hidden]="!sidebarOpen()"
        >
          <div class="mb-6 flex items-center justify-between">
            <div>
              <p class="m-0 text-xs uppercase tracking-wide text-gray-400">Questmind</p>
              <h2 class="m-0 text-lg font-semibold text-gray-800">Navigation</h2>
            </div>
            <div class="hidden lg:block">
              <app-auth-button></app-auth-button>
            </div>
          </div>
          <nav class="flex flex-col gap-2">
            <a
              routerLink="chat"
              class="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center gap-3 cursor-pointer"
              [class]="
                isActiveRoute('chat')
                  ? 'bg-primary text-white shadow'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              "
            >
              <span class="text-lg">💬</span>
              <span>Character Chat</span>
            </a>
            <a
              routerLink="audio"
              class="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center gap-3 cursor-pointer"
              [class]="
                isActiveRoute('audio')
                  ? 'bg-primary text-white shadow'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              "
            >
              <span class="text-lg">🎙️</span>
              <span>Audio Transcription</span>
            </a>
            <a
              routerLink="podcasts"
              class="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center gap-3 cursor-pointer"
              [class]="
                isActiveRoute('podcasts')
                  ? 'bg-primary text-white shadow'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              "
            >
              <span class="text-lg">📻</span>
              <span>Podcast Bibliotheek</span>
            </a>
            @if (userService.isAdmin()) {
              <a
                routerLink="admin"
                class="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center gap-3 cursor-pointer"
                [class]="
                  isActiveRoute('admin')
                    ? 'bg-primary text-white shadow'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                "
              >
                <span class="text-lg">⚙️</span>
                <span>Admin</span>
              </a>
            }
          </nav>
        </aside>

        <section class="flex-1">
          <div class="mb-6">
            <app-campaign-selector></app-campaign-selector>
          </div>
          <router-outlet></router-outlet>
        </section>
      </div>
    </main>
  `
})
export class AppShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly campaignContext = inject(CampaignContextService);
  readonly userService = inject(UserService);
  sidebarOpen = signal(true);

  constructor() {
    this.route.paramMap.subscribe(params => {
      const campaignId = params.get('campaignId');
      if (campaignId) {
        void this.campaignContext.selectCampaign(campaignId);
      }
    });
  }

  isActiveRoute(route: string): boolean {
    return this.router.url.includes(`/${route}`);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(open => !open);
  }
}
