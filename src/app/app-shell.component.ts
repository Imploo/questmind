import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ChatComponent } from './chat/chat.component';
import { AudioSessionComponent } from './audio/audio-session.component';
import { PodcastLibraryComponent } from './audio/podcast-library.component';
import { AuthButtonComponent } from './auth/auth-button.component';
import { CampaignSelectorComponent } from './campaign/campaign-selector.component';
import { CampaignContextService } from './campaign/campaign-context.service';
import { AdminComponent } from './admin/admin.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    ChatComponent,
    AudioSessionComponent,
    PodcastLibraryComponent,
    AuthButtonComponent,
    CampaignSelectorComponent,
    AdminComponent
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
            <button
              type="button"
              class="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center gap-3"
              [class]="
                activeView() === 'chat'
                  ? 'bg-primary text-white shadow'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              "
              (click)="setActiveView('chat')"
            >
              <span class="text-lg">💬</span>
              <span>Character Chat</span>
            </button>
            <button
              type="button"
              class="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center gap-3"
              [class]="
                activeView() === 'audio'
                  ? 'bg-primary text-white shadow'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              "
              (click)="setActiveView('audio')"
            >
              <span class="text-lg">🎙️</span>
              <span>Audio Transcription</span>
            </button>
            <button
              type="button"
              class="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center gap-3"
              [class]="
                activeView() === 'podcasts'
                  ? 'bg-primary text-white shadow'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              "
              (click)="setActiveView('podcasts')"
            >
              <span class="text-lg">📻</span>
              <span>Podcast Bibliotheek</span>
            </button>
            <button
              type="button"
              class="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center gap-3"
              [class]="
                activeView() === 'admin'
                  ? 'bg-primary text-white shadow'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              "
              (click)="setActiveView('admin')"
            >
              <span class="text-lg">⚙️</span>
              <span>Admin</span>
            </button>
          </nav>
        </aside>

        <section class="flex-1">
          <div class="mb-6">
            <app-campaign-selector></app-campaign-selector>
          </div>
          @if (activeView() === 'chat') {
            <app-chat></app-chat>
          } @else if (activeView() === 'audio') {
            <app-audio-session></app-audio-session>
          } @else if (activeView() === 'podcasts') {
            <app-podcast-library></app-podcast-library>
          } @else if (activeView() === 'admin') {
            <app-admin></app-admin>
          }
        </section>
      </div>
    </main>
  `
})
export class AppShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly campaignContext = inject(CampaignContextService);
  activeView = signal<'chat' | 'audio' | 'podcasts' | 'admin'>('chat');
  sidebarOpen = signal(true);

  constructor() {
    this.route.paramMap.subscribe(params => {
      const campaignId = params.get('campaignId');
      if (campaignId) {
        void this.campaignContext.selectCampaign(campaignId);
      }
    });
  }

  setActiveView(view: 'chat' | 'audio' | 'podcasts' | 'admin'): void {
    this.activeView.set(view);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(open => !open);
  }
}
