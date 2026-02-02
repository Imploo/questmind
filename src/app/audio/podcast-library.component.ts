import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { PodcastAudioService } from './podcast-audio.service';
import { PodcastVersion } from './audio-session.models';

interface SessionWithPodcasts {
  sessionId: string;
  sessionTitle: string;
  sessionDate: string;
  podcasts: PodcastVersion[];
}

@Component({
  selector: 'app-podcast-library',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="mb-8">
        <h1 class="text-3xl font-bold m-0">🎙️ Podcast Bibliotheek</h1>
        <p class="text-gray-600 m-0 mt-2">
          Bekijk alle sessie podcasts. Elke speeldag is een audio sessie met zijn eigen verhaal en
          versioned podcasts.
        </p>
      </div>

      @if (loading()) {
        <div class="text-center py-12">
          <div class="animate-spin h-12 w-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
          <p class="mt-4 text-gray-600 m-0">Podcasts laden...</p>
        </div>
      }

      @if (!loading() && sessions().length === 0) {
        <div class="text-center py-12 bg-gray-50 rounded-lg">
          <div class="text-6xl mb-4">🎙️</div>
          <p class="text-gray-600 m-0">Nog geen podcasts gegenereerd.</p>
          <p class="text-sm text-gray-500 mt-2 m-0">
            Genereer een podcast vanuit een sessie verhaal om deze hier te zien.
          </p>
        </div>
      }

      @if (!loading() && sessions().length > 0) {
        <div class="space-y-6">
          @for (session of sessions(); track session.sessionId) {
            <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h2 class="text-xl font-semibold m-0">{{ session.sessionTitle }}</h2>
                  <p class="text-sm text-gray-500 m-0 mt-1">Speeldag: {{ session.sessionDate }}</p>
                </div>
                <span class="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full">
                  {{ session.podcasts.length }} versie{{ session.podcasts.length > 1 ? 's' : '' }}
                </span>
              </div>

              <div class="space-y-3">
                @for (podcast of session.podcasts; track podcast.version) {
                  <div class="flex items-center gap-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-100">
                    <div class="flex-shrink-0">
                      <span class="inline-flex items-center justify-center w-10 h-10 bg-purple-600 text-white rounded-full font-semibold text-sm">
                        v{{ podcast.version }}
                      </span>
                    </div>

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-gray-900">
                          Podcast versie {{ podcast.version }}
                        </span>
                        @if (podcast.status === 'generating_script') {
                          <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Generating...</span>
                        } @else if (podcast.status === 'failed') {
                          <span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Failed</span>
                        } @else if (podcast.status === 'completed') {
                          <span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Script Ready</span>
                        }
                      </div>
                      <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{{ formatDuration(podcast.duration) }}</span>
                        @if (podcast.fileSize) {
                          <span>•</span>
                          <span>{{ formatFileSize(podcast.fileSize) }}</span>
                        }
                        <span>•</span>
                        <span>{{ formatDate(podcast.createdAt) }}</span>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      @if (isPlayingPodcast() && playingPodcastId() === session.sessionId + '-v' + podcast.version) {
                        <button
                          (click)="stopPodcast()"
                          class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium"
                          title="Stop afspelen"
                        >
                          ⏹️ Stop
                        </button>
                        @if (playProgress()) {
                          <span class="text-xs text-gray-600">{{ playProgress() }}</span>
                        }
                      } @else {
                        <button
                          (click)="playPodcast(podcast, session.sessionId)"
                          [disabled]="isPlayingPodcast()"
                          class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                          title="Podcast afspelen"
                        >
                          ▶️ Afspelen
                        </button>
                      }
                      <button
                        (click)="viewPodcastScript(podcast)"
                        class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-sm font-medium"
                        title="Script bekijken"
                      >
                        📄 Script
                      </button>
                      <button
                        (click)="downloadPodcastScript(podcast, session.sessionTitle)"
                        class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm font-medium"
                        title="Script downloaden"
                      >
                        ⬇️ Download
                      </button>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }

      @if (!loading() && sessions().length > 0) {
        <div class="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p class="text-sm text-blue-700 m-0">
            <strong>💡 Info:</strong> Podcasts gebruiken Google Cloud Text-to-Speech met natuurlijk klinkende Nederlandse WaveNet stemmen.
            <br>
            <span class="text-xs mt-1 inline-block">
              Zorg dat je Google Cloud API key is geconfigureerd in de environment settings.
            </span>
          </p>
        </div>
      }

      @if (errorMessage()) {
        <div class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p class="text-sm text-red-700 m-0">{{ errorMessage() }}</p>
        </div>
      }
    </div>
  `
})
export class PodcastLibraryComponent implements OnInit {
  private readonly firestore;
  private readonly authService = inject(AuthService);
  private readonly podcastAudioService = inject(PodcastAudioService);

  loading = signal(true);
  sessions = signal<SessionWithPodcasts[]>([]);
  isPlayingPodcast = signal(false);
  playingPodcastId = signal<string | null>(null);
  playProgress = signal<string>('');
  errorMessage = signal<string>('');

  constructor() {
    const app = getApp();
    this.firestore = getFirestore(app);
  }

  async ngOnInit() {
    await this.loadPodcasts();
  }

  private async loadPodcasts() {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) {
      this.loading.set(false);
      return;
    }

    try {
      const sessionsRef = collection(this.firestore, 'users', userId, 'audioSessions');
      const snapshot = await getDocs(sessionsRef);
      const sessions: SessionWithPodcasts[] = [];

      snapshot.forEach((doc: any) => {
        const data = doc.data();
        const podcasts = data['podcasts'];
        
        // Only include sessions that have at least one podcast
        if (podcasts && Array.isArray(podcasts) && podcasts.length > 0) {
          sessions.push({
            sessionId: doc.id,
            sessionTitle: data['title'] || 'Untitled Session',
            sessionDate: data['sessionDate'] || 'Unknown',
            podcasts: podcasts.map((p: any) => ({
              ...p,
              createdAt: p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt),
              scriptGeneratedAt: p.scriptGeneratedAt?.toDate ? p.scriptGeneratedAt.toDate() : new Date(p.scriptGeneratedAt),
              audioGeneratedAt: p.audioGeneratedAt?.toDate ? p.audioGeneratedAt.toDate() : (p.audioGeneratedAt ? new Date(p.audioGeneratedAt) : undefined)
            }))
          });
        }
      });

      // Sort by date (most recent first)
      sessions.sort((a, b) => {
        const dateA = new Date(a.sessionDate).getTime();
        const dateB = new Date(b.sessionDate).getTime();
        return dateB - dateA;
      });

      this.sessions.set(sessions);
    } catch (error) {
      console.error('Failed to load podcasts:', error);
    } finally {
      this.loading.set(false);
    }
  }

  async playPodcast(podcast: PodcastVersion, sessionId: string): Promise<void> {
    if (!podcast.script || this.isPlayingPodcast()) {
      return;
    }

    if (!this.podcastAudioService.isTTSConfigured()) {
      this.errorMessage.set('Google Cloud TTS is niet geconfigureerd. Voeg uw API key toe aan de environment configuratie.');
      return;
    }

    const podcastId = `${sessionId}-v${podcast.version}`;
    this.isPlayingPodcast.set(true);
    this.playingPodcastId.set(podcastId);
    this.errorMessage.set('');

    try {
      await this.podcastAudioService.generateAudioFromScript(
        podcast.script,
        (progress) => {
          this.playProgress.set(`${progress}%`);
        }
      );
    } catch (error: any) {
      console.error('Failed to play podcast:', error);
      this.errorMessage.set(error?.message || 'Afspelen mislukt');
    } finally {
      this.isPlayingPodcast.set(false);
      this.playingPodcastId.set(null);
      this.playProgress.set('');
    }
  }

  stopPodcast(): void {
    this.podcastAudioService.stopSpeech();
    this.isPlayingPodcast.set(false);
    this.playingPodcastId.set(null);
    this.playProgress.set('');
  }

  viewPodcastScript(podcast: PodcastVersion): void {
    if (!podcast.script) {
      return;
    }
    const scriptText = podcast.script.segments
      .map(seg => `${seg.speaker === 'host1' ? 'HOST1' : 'HOST2'}: ${seg.text}`)
      .join('\n\n');
    
    alert(`Podcast Script (v${podcast.version})\n\nGeschatte Duur: ${this.formatDuration(podcast.duration || 0)}\n\n${scriptText}`);
  }

  downloadPodcastScript(podcast: PodcastVersion, sessionTitle: string): void {
    if (!podcast.script) {
      return;
    }
    const scriptText = podcast.script.segments
      .map(seg => `${seg.speaker === 'host1' ? 'HOST1' : 'HOST2'}: ${seg.text}`)
      .join('\n\n');
    
    const filename = `${sessionTitle}-v${podcast.version}-script.txt`;
    
    const blob = new Blob([scriptText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  formatDuration(seconds?: number): string {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) {
      return `${mb.toFixed(1)} MB`;
    }
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  }

  formatDate(date: unknown): string {
    if (!date) return '';
    let d: Date | null = null;
    if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'string' || typeof date === 'number') {
      d = new Date(date);
    } else if (typeof date === 'object') {
      const maybeTimestamp = date as { toDate?: () => Date; seconds?: number };
      if (typeof maybeTimestamp.toDate === 'function') {
        d = maybeTimestamp.toDate();
      } else if (typeof maybeTimestamp.seconds === 'number') {
        d = new Date(maybeTimestamp.seconds * 1000);
      }
    }
    if (!d || Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('nl-NL', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
