import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../auth/auth.service';
import { UserService } from '../../core/user.service';
import { CampaignContextService } from '../../campaign/campaign-context.service';
import { NavItem } from '../nav-item.model';

@Component({
  selector: 'app-nav-rail',
  imports: [RouterLink, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .nav-rail {
      width: 80px;
      position: fixed;
      top: 0;
      left: 0;
      height: 100vh;
      z-index: 40;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 0;
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-right: 1px solid rgba(255,255,255,0.2);
    }

    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      width: 100%;
      padding: 4px 12px;
      cursor: pointer;
      text-decoration: none;
      position: relative;
    }

    .nav-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 32px;
      border-radius: 16px;
      transition: background 200ms ease;
    }

    .nav-item:hover .nav-indicator {
      background: rgba(255,255,255,0.2);
    }

    .nav-item.active .nav-indicator {
      background: rgba(255,255,255,0.35);
    }

    .nav-label {
      font-size: 12px;
      font-weight: 500;
      color: rgba(255,255,255,0.85);
      text-align: center;
      line-height: 1.2;
    }

    .nav-item.active .nav-label {
      color: white;
      font-weight: 600;
    }

    .nav-icon {
      color: rgba(255,255,255,0.85);
    }

    .nav-item.active .nav-icon {
      color: white;
    }

    .user-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(255,255,255,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      color: white;
      cursor: pointer;
      border: none;
      transition: background 200ms ease;
    }

    .user-avatar:hover {
      background: rgba(255,255,255,0.35);
    }

    .sign-out-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 4px 12px;
      cursor: pointer;
      background: none;
      border: none;
      width: 100%;
    }

    .sign-out-btn .nav-indicator {
      transition: background 200ms ease;
    }

    .sign-out-btn:hover .nav-indicator {
      background: rgba(255,255,255,0.2);
    }
  `],
  template: `
    @if (authService.isAuthenticated()) {
      <nav class="nav-rail">
        <!-- Nav items -->
        <div style="flex: 1; width: 100%; display: flex; flex-direction: column; gap: 4px; padding-top: 16px;">
          @for (item of navItems(); track item.id) {
            <a
              [routerLink]="item.route"
              class="nav-item"
              [class.active]="isItemActive(item)"
            >
              <div class="nav-indicator">
                <lucide-icon [name]="item.icon" class="nav-icon" style="width:20px;height:20px;" />
              </div>
              <span class="nav-label">{{ item.label }}</span>
            </a>
          }
        </div>

        <!-- User / Sign out -->
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; padding-bottom: 8px;">
          @if (authService.currentUser()?.photoURL) {
            <img
              [src]="authService.currentUser()!.photoURL!"
              alt="Avatar"
              style="width:36px;height:36px;border-radius:50%;object-fit:cover;"
            />
          } @else {
            <div class="user-avatar">{{ userInitials() }}</div>
          }
          <button class="sign-out-btn" (click)="signOut()" title="Uitloggen">
            <div class="nav-indicator">
              <lucide-icon name="log-out" class="nav-icon" style="width:20px;height:20px;" />
            </div>
            <span class="nav-label">Uitloggen</span>
          </button>
        </div>
      </nav>
    }
  `
})
export class NavRailComponent {
  readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly campaignContext = inject(CampaignContextService);
  private readonly router = inject(Router);

  private readonly routerEvents = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url)
    )
  );

  readonly activeRoute = computed(() => {
    const url = this.routerEvents() ?? '';
    // Match /campaign/:id/segment → return the segment for comparison
    const campaignMatch = url.match(/^\/campaign\/[^/]+\/([^/?]+)/);
    if (campaignMatch) return campaignMatch[1];
    const rootMatch = url.match(/^\/([^/?]+)/);
    return rootMatch ? `/${rootMatch[1]}` : '';
  });

  readonly navItems = computed((): NavItem[] => {
    const campaignId = this.campaignContext.selectedCampaignId();
    const audioRoute = campaignId ? `/campaign/${campaignId}/audio` : null;
    const podcastsRoute = campaignId ? `/campaign/${campaignId}/podcasts` : null;

    const items: NavItem[] = [
      { id: 'characters', label: 'Characters', route: '/characters', icon: 'users' },
      ...(audioRoute ? [{ id: 'audio', label: 'Audio', route: audioRoute, icon: 'mic' }] : []),
      ...(podcastsRoute ? [{ id: 'podcasts', label: 'Podcasts', route: podcastsRoute, icon: 'music' }] : []),
    ];

    if (this.userService.isAdmin()) {
      items.push({ id: 'admin', label: 'Admin', route: '/admin', icon: 'settings', adminOnly: true });
    }

    return items;
  });

  readonly userInitials = computed((): string => {
    const user = this.authService.currentUser();
    if (user?.displayName) {
      return user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return user?.email?.[0].toUpperCase() ?? '?';
  });

  isItemActive(item: NavItem): boolean {
    const active = this.activeRoute();
    // For campaign-prefixed routes, activeRoute() returns just the segment
    if (item.id === 'audio') return active === 'audio';
    if (item.id === 'podcasts') return active === 'podcasts';
    return active === item.route;
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigate(['/']);
  }
}
