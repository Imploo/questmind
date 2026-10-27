import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { PodcastVersion } from './services/audio-session.models';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { CampaignSelectorComponent } from '../campaign/campaign-selector.component';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { PodcastVersionItemComponent } from '../shared/components/podcast-version-item.component';
import { toMillis } from '../shared/utils/date.utils';

interface SessionWithPodcasts {
  sessionId: string;
  sessionTitle: string;
  sessionDate: string;
  podcasts: PodcastVersion[];
}

@Component({
  selector: 'app-podcast-library',
  imports: [CampaignSelectorComponent, PodcastVersionItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-5xl mx-auto">
      <div class="mb-6 hidden sm:block">
        <app-campaign-selector />
      </div>

      <div class="mb-8">
        <h1 class="text-3xl font-bold m-0">🎙️ Podcast Bibliotheek</h1>
        <p class="text-gray-600 m-0 mt-2">
          Bekijk alle sessie podcasts. Elke speeldag is een audio sessie met zijn eigen verhaal en
          versioned podcasts.
        </p>
      </div>

      @if (!campaignId()) {
        <div class="text-center py-12 bg-gray-50 rounded-lg">
          <div class="text-5xl mb-4">🧭</div>
          <p class="text-gray-600 m-0">Select a campaign to view its podcasts.</p>
        </div>
      }

      @if (campaignId() && sessions().length === 0) {
        <div class="text-center py-12 bg-gray-50 rounded-lg">
          <div class="text-6xl mb-4">🎙️</div>
          <p class="text-gray-600 m-0">Nog geen podcasts gegenereerd.</p>
          <p class="text-sm text-gray-500 mt-2 m-0">
            Genereer een podcast vanuit een sessie verhaal om deze hier te zien.
          </p>
        </div>
      }

      @if (campaignId() && sessions().length > 0) {
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
                  <app-podcast-version-item
                    [podcast]="podcast"
                    [shareTarget]="{ campaignId: campaignId() ?? '', sessionId: session.sessionId, podcastVersion: podcast.version }"
                    [downloadName]="session.sessionTitle"
                  />
                }
              </div>
            </div>
          }
        </div>

        <div class="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p class="text-sm text-blue-700 m-0">
            <strong>💡 Info:</strong> Podcasts worden opgeslagen als MP3 en gebruiken AI-stemmen voor
            Nederlandse audio met natuurlijke intonatie.
          </p>
        </div>
      }
    </div>
  `
})
export class PodcastLibraryComponent {
  private readonly authService = inject(AuthService);
  private readonly campaignContext = inject(CampaignContextService);
  private readonly sessionStateService = inject(AudioSessionStateService);

  readonly campaignId = this.campaignContext.selectedCampaignId;

  /** Sessions with at least one podcast, newest play date first. */
  readonly sessions = computed<SessionWithPodcasts[]>(() => {
    if (!this.campaignId() || !this.authService.currentUser()?.uid) return [];

    return this.sessionStateService.sessions()
      .filter(session => Array.isArray(session.podcasts) && session.podcasts.length > 0)
      .map(session => ({
        sessionId: session.id,
        sessionTitle: session.title || 'Untitled Session',
        sessionDate: session.sessionDate || 'Unknown',
        podcasts: session.podcasts ?? [],
      }))
      .sort((a, b) => toMillis(b.sessionDate) - toMillis(a.sessionDate));
  });
}
