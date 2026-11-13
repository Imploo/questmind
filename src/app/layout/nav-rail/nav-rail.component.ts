import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../auth/auth.service';
import { UserService } from '../../core/user.service';
import { CampaignContextService } from '../../campaign/campaign-context.service';
import { NavItem } from '../nav-item.model';
import { LogoComponent } from '../../shared/components/logo.component';

@Component({
  selector: 'app-nav-rail',
  imports: [RouterLink, LucideAngularModule, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .hamburger-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      position: fixed;
      top: 8px;
      left: 8px;
      z-index: 50;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: transparent;
      border: none;
      color: white;
    }
    .hamburger-btn:hover { background: rgba(255, 255, 255, 0.15); }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 39;
      background: rgba(28, 16, 62, 0.55);
      backdrop-filter: blur(2px);
    }

    /* A strip of night sky down the side: the gradient, a shade deeper. */
    .nav-rail {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 40;
      display: flex;
      flex-direction: column;
      width: 248px;
      height: 100dvh;
      padding: 64px 0 14px;
      color: rgba(255, 255, 255, 0.82);
      background: linear-gradient(180deg, rgba(36, 24, 92, 0.94), rgba(58, 28, 104, 0.96));
      border-right: 1px solid rgba(229, 199, 127, 0.28);
      transform: translateX(-100%);
      transition: transform 280ms ease;
    }
    .nav-rail.is-open { transform: translateX(0); box-shadow: 24px 0 60px -20px rgba(16, 8, 48, 0.8); }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 18px 14px;
      text-decoration: none;
    }
    .brand-name {
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #fff;
    }
    .rule {
      align-self: center;
      width: 7px;
      height: 7px;
      margin: 2px 0 12px;
      background: #e5c77f;
      transform: rotate(45deg);
      opacity: 0.85;
      flex-shrink: 0;
    }

    .nav-items { flex: 1; width: 100%; display: flex; flex-direction: column; gap: 4px; }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 5px 14px;
      color: inherit;
      text-decoration: none;
      background: none;
      border: none;
    }
    .nav-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 36px;
      border-radius: 12px;
      border: 1px solid transparent;
      flex-shrink: 0;
      transition: background 200ms ease, color 200ms ease, border-color 200ms ease;
    }
    .nav-item:hover .nav-indicator { background: rgba(255, 255, 255, 0.14); }

    /* The page you are on is a tab of parchment sticking out of the rail. */
    .nav-item.active .nav-indicator {
      color: var(--gold-deep);
      background: var(--paper);
      border-color: #e5c77f;
      box-shadow: 0 8px 16px -8px rgba(10, 4, 40, 0.8);
    }
    .nav-label {
      font-family: var(--font-display);
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      line-height: 1.2;
    }
    .nav-item.active .nav-label { color: #fff; font-weight: 700; }
    .nav-icon { width: 20px; height: 20px; }

    .user {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
    }
    .user-row { display: flex; align-items: center; gap: 12px; padding: 4px 14px 2px 22px; }
    .user-avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      font-family: var(--font-display);
      font-size: 13px;
      font-weight: 700;
      color: var(--gold-deep);
      background: radial-gradient(circle at 35% 30%, #fff8e8, var(--gold-soft));
      border: 1.5px solid #e5c77f;
    }
    .user-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; color: #fff; }

    @media (min-width: 640px) {
      .hamburger-btn { display: none; }
      .backdrop { display: none !important; }
      .nav-rail {
        width: 80px;
        align-items: center;
        padding-top: 14px;
        background: linear-gradient(180deg, rgba(36, 24, 92, 0.46), rgba(58, 28, 104, 0.56));
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border-right-color: rgba(255, 255, 255, 0.16);
        transform: translateX(0);
        transition: none;
      }
      .brand { padding: 0 0 10px; }
      .brand-name, .user-name { display: none; }
      .nav-item { flex-direction: column; gap: 4px; padding: 4px 4px; }
      .nav-label { font-size: 10.5px; text-align: center; }
      .user { align-items: center; }
      .user-row { padding: 2px 0; }
    }
  `],
  template: `
    @if (authService.isAuthenticated()) {
      <!-- Hamburger button (mobile only) -->
      <button class="hamburger-btn" (click)="toggleMenu()" [attr.aria-label]="isMenuOpen() ? 'Menu sluiten' : 'Menu openen'">
        <lucide-icon [name]="isMenuOpen() ? 'x' : 'menu'" style="width:20px;height:20px;" />
      </button>

      <!-- Backdrop (mobile only) -->
      @if (isMenuOpen()) {
        <div class="backdrop" (click)="closeMenu()"></div>
      }

      <nav class="nav-rail" [class.is-open]="isMenuOpen()" aria-label="Hoofdnavigatie">
        <a routerLink="/characters" class="brand" aria-label="Questmind" (click)="closeMenu()">
          <app-logo [size]="44" />
          <span class="brand-name">Questmind</span>
        </a>
        <span class="rule" aria-hidden="true"></span>

        <div class="nav-items">
          @for (item of navItems(); track item.id) {
            <a
              [routerLink]="item.route"
              class="nav-item"
              [class.active]="isItemActive(item)"
              [attr.aria-current]="isItemActive(item) ? 'page' : null"
              (click)="closeMenu()"
            >
              <span class="nav-indicator">
                <lucide-icon [name]="item.icon" class="nav-icon" />
              </span>
              <span class="nav-label">{{ item.label }}</span>
            </a>
          }
        </div>

        <!-- User / Sign out -->
        <div class="user">
          <div class="user-row">
            @if (authService.currentUser()?.photoURL) {
              <img [src]="authService.currentUser()!.photoURL!" alt="" class="user-avatar" />
            } @else {
              <span class="user-avatar" aria-hidden="true">{{ userInitials() }}</span>
            }
            <span class="user-name">{{ authService.currentUser()?.displayName || authService.currentUser()?.email }}</span>
          </div>
          <button type="button" class="nav-item" (click)="signOut()" title="Uitloggen">
            <span class="nav-indicator">
              <lucide-icon name="log-out" class="nav-icon" />
            </span>
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

  readonly isMenuOpen = signal(false);

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
    const storyRoute = campaignId ? `/campaign/${campaignId}/story` : null;
    const podcastsRoute = campaignId ? `/campaign/${campaignId}/podcasts` : null;

    const items: NavItem[] = [
      { id: 'characters', label: 'Characters', route: '/characters', icon: 'users' },
      ...(audioRoute ? [{ id: 'audio', label: 'Audio', route: audioRoute, icon: 'mic' }] : []),
      ...(storyRoute ? [{ id: 'story', label: 'Verhaal', route: storyRoute, icon: 'book-open' }] : []),
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
    if (item.id === 'story') return active === 'story';
    if (item.id === 'podcasts') return active === 'podcasts';
    return active === item.route;
  }

  toggleMenu(): void {
    this.isMenuOpen.update(v => !v);
  }

  closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigate(['/']);
  }
}
