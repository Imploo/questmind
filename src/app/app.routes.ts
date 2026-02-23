import { Routes } from '@angular/router';
import { authGuard, noAuthGuard } from './auth/auth.guard';
import { SignInPageComponent } from './auth/sign-in-page.component';
import { AppShellComponent } from './app-shell.component';
import { campaignGuard } from './campaign/campaign.guard';
import { adminGuard } from './auth/admin.guard';

export const routes: Routes = [
  {
    path: 'sign-in',
    component: SignInPageComponent,
    canActivate: [noAuthGuard],
  },
  // Character detail is publicly accessible — no auth guard
  {
    path: 'characters/:characterId',
    component: AppShellComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./features/character-builder/pages/character-builder-page/character-builder-page.component').then(m => m.CharacterBuilderPageComponent)
      }
    ]
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'characters',
        pathMatch: 'full'
      },
      {
        path: 'characters',
        loadComponent: () => import('./features/character-builder/pages/character-list-page/character-list-page.component').then(m => m.CharacterListPageComponent)
      },
      {
        path: 'admin',
        loadComponent: () => import('./admin/admin.component').then(m => m.AdminComponent),
        canActivate: [adminGuard]
      }
    ]
  },
  {
    path: 'campaign/:campaignId',
    component: AppShellComponent,
    canActivate: [authGuard, campaignGuard],
    children: [
      {
        path: '',
        redirectTo: 'audio',
        pathMatch: 'full'
      },
      {
        path: 'audio',
        loadComponent: () => import('./audio/audio-session.component').then(m => m.AudioSessionComponent)
      },
      {
        path: 'audio/new',
        loadComponent: () => import('./audio/audio-upload-page.component').then(m => m.AudioUploadPageComponent)
      },
      {
        path: 'audio/:sessionId',
        loadComponent: () => import('./audio/audio-session.component').then(m => m.AudioSessionComponent)
      },
      {
        path: 'podcasts',
        loadComponent: () => import('./audio/podcast-library.component').then(m => m.PodcastLibraryComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./campaign/campaign-settings.component').then(m => m.CampaignSettingsComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
