import { Routes } from '@angular/router';
import { authGuard, noAuthGuard } from './auth/auth.guard';
import { SignInPageComponent } from './auth/sign-in-page.component';
import { AppShellComponent } from './app-shell.component';
import { campaignGuard } from './campaign/campaign.guard';
import { AudioSessionComponent } from './audio/audio-session.component';
import { AudioUploadPageComponent } from './audio/audio-upload-page.component';
import { PodcastLibraryComponent } from './audio/podcast-library.component';
import { AdminComponent } from './admin/admin.component';
import { adminGuard } from './auth/admin.guard';
import { CampaignSettingsComponent } from './campaign/campaign-settings.component';

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
        path: 'audio',
        component: AudioSessionComponent
      },
      {
        path: 'audio/new',
        component: AudioUploadPageComponent
      },
      {
        path: 'audio/:sessionId',
        component: AudioSessionComponent
      },
      {
        path: 'podcasts',
        component: PodcastLibraryComponent
      },
      {
        path: 'characters',
        loadComponent: () => import('./features/character-builder/pages/character-list-page/character-list-page.component').then(m => m.CharacterListPageComponent)
      },
      {
        path: 'admin',
        component: AdminComponent,
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
        redirectTo: 'characters',
        pathMatch: 'full'
      },
      {
        path: 'audio',
        component: AudioSessionComponent
      },
      {
        path: 'audio/new',
        component: AudioUploadPageComponent
      },
      {
        path: 'audio/:sessionId',
        component: AudioSessionComponent
      },
      {
        path: 'podcasts',
        component: PodcastLibraryComponent
      },
      {
        path: 'characters',
        loadComponent: () => import('./features/character-builder/pages/character-list-page/character-list-page.component').then(m => m.CharacterListPageComponent)
      },
      {
        path: 'characters/:characterId',
        loadComponent: () => import('./features/character-builder/pages/character-builder-page/character-builder-page.component').then(m => m.CharacterBuilderPageComponent)
      },
      {
        path: 'settings',
        component: CampaignSettingsComponent
      },
      {
        path: 'admin',
        component: AdminComponent,
        canActivate: [adminGuard]
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
