import { Routes } from '@angular/router';
import { authGuard, noAuthGuard } from './auth/auth.guard';
import { SignInPageComponent } from './auth/sign-in-page.component';
import { AppShellComponent } from './app-shell.component';
import { campaignGuard } from './campaign/campaign.guard';
import { ChatComponent } from './chat/chat.component';
import { AudioSessionComponent } from './audio/audio-session.component';
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
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'chat',
        pathMatch: 'full'
      },
      {
        path: 'chat',
        component: ChatComponent
      },
      {
        path: 'audio',
        component: AudioSessionComponent
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
        redirectTo: 'chat',
        pathMatch: 'full'
      },
      {
        path: 'chat',
        component: ChatComponent
      },
      {
        path: 'audio',
        component: AudioSessionComponent
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
