import { Routes } from '@angular/router';
import { authGuard, noAuthGuard } from './auth/auth.guard';
import { SignInPageComponent } from './auth/sign-in-page.component';
import { AppShellComponent } from './app-shell.component';
import { campaignGuard } from './campaign/campaign.guard';

export const routes: Routes = [
  {
    path: 'sign-in',
    component: SignInPageComponent,
    canActivate: [noAuthGuard], // Prevent authenticated users from accessing sign-in
  },
  {
    path: '',
    component: AppShellComponent,
    pathMatch: 'full',
    canActivate: [authGuard], // Protect all app routes with auth guard
  },
  {
    path: 'campaign/:campaignId',
    component: AppShellComponent,
    canActivate: [authGuard, campaignGuard],
  },
  {
    path: '**',
    redirectTo: '', // Redirect any unknown routes to home (which requires auth)
  }
];
