import { Component, ChangeDetectionStrategy, input, inject } from '@angular/core';
import { AuthService } from '../../../auth/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sidebar-footer',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (authService.isAuthenticated()) {
      <div [class]="footerClasses()">
        <!-- Avatar -->
        @if (authService.currentUser()?.photoURL) {
          <img
            [src]="authService.currentUser()?.photoURL || ''"
            alt="User avatar"
            class="w-10 h-10 rounded-full flex-shrink-0"
          />
        } @else {
          <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span class="text-sm font-semibold text-primary">
              {{ getUserInitials() }}
            </span>
          </div>
        }

        <!-- Name + Sign Out (only when expanded) -->
        @if (!isCollapsed()) {
          <div class="flex-1 min-w-0">
            <div class="font-medium text-sm text-gray-800 truncate">
              {{ authService.currentUser()?.displayName || authService.currentUser()?.email }}
            </div>
          </div>
          <button
            (click)="handleSignOut()"
            class="text-xs text-gray-600 hover:text-gray-800 transition-colors flex-shrink-0"
          >
            Sign Out
          </button>
        }
      </div>
    }
  `
})
export class SidebarFooterComponent {
  readonly isCollapsed = input.required<boolean>();

  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly footerClasses = () => {
    return this.isCollapsed()
      ? 'flex justify-center py-4'
      : 'flex items-center gap-3 px-4 py-4';
  };

  getUserInitials(): string {
    const user = this.authService.currentUser();
    if (user?.displayName) {
      return user.displayName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return '?';
  }

  async handleSignOut(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigate(['/']);
  }
}
