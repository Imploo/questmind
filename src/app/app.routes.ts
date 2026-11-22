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
  // Shared podcast links are public — no auth guard and no app shell
  {
    path: 'share/podcast/:shareId',
    loadComponent: () => import('./audio/podcast-share-page.component').then(m => m.PodcastSharePageComponent)
  },
  // Shared character links: the server adds a link preview to this address (see the
  // characterSharePage function); in the browser it simply leads to the character page.
  { path: 'share/character/:characterId', redirectTo: '/characters/:characterId' },
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
        path: 'campaigns',
        loadComponent: () => import('./campaign/campaign-list-page.component').then(m => m.CampaignListPageComponent)
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
        path: 'sessions/new',
        loadComponent: () => import('./audio/audio-upload-page.component').then(m => m.AudioUploadPageComponent)
      },
      {
        path: 'sessions/:sessionId',
        loadComponent: () => import('./audio/audio-session.component').then(m => m.AudioSessionComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./campaign/campaign-settings.component').then(m => m.CampaignSettingsComponent)
      },
      // Addresses from before the campaign page, kept working for old links and bookmarks.
      { path: 'audio', redirectTo: 'sessions', pathMatch: 'full' },
      { path: 'audio/new', redirectTo: 'sessions/new' },
      { path: 'audio/:sessionId', redirectTo: 'sessions/:sessionId' },
      {
        path: '',
        loadComponent: () => import('./campaign/campaign-page.component').then(m => m.CampaignPageComponent),
        children: [
          { path: '', redirectTo: 'story', pathMatch: 'full' },
          {
            path: 'story',
            loadComponent: () => import('./campaign-story/campaign-story-page.component').then(m => m.CampaignStoryPageComponent)
          },
          {
            path: 'sessions',
            loadComponent: () => import('./audio/session-list-page.component').then(m => m.SessionListPageComponent)
          },
          {
            path: 'podcasts',
            loadComponent: () => import('./audio/podcast-library.component').then(m => m.PodcastLibraryComponent)
          }
        ]
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
