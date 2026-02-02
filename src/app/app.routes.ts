import { Routes } from '@angular/router';
import { authGuard, noAuthGuard } from './auth/auth.guard';
import { SignInPageComponent } from './auth/sign-in-page.component';
import { AppShellComponent } from './app-shell.component';

export const routes: Routes = [
  {
    path: 'sign-in',
    component: SignInPageComponent,
    canActivate: [noAuthGuard], // Prevent authenticated users from accessing sign-in
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard], // Protect all app routes with auth guard
  },
  {
    path: '**',
    redirectTo: '', // Redirect any unknown routes to home (which requires auth)
  }
];
