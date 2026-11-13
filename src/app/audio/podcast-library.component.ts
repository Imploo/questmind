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

      <header class="mb-6 sm:mb-8">
        <div class="qm-page-eyebrow">Campaign</div>
        <h1 class="qm-page-title mt-1">Podcast Bibliotheek</h1>
        <p class="qm-page-sub mt-1 max-w-2xl">
          Bekijk alle sessie podcasts. Elke speeldag is een audio sessie met zijn eigen verhaal en
          versioned podcasts.
        </p>
      </header>

      @if (!campaignId()) {
        <div class="qm-panel qm-hero qm-empty">
          <span class="qm-medallion qm-medallion-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-width="1.75" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></svg></span>
          <p class="qm-empty-text">Select a campaign to view its podcasts.</p>
        </div>
      }

      @if (campaignId() && sessions().length === 0) {
        <div class="qm-panel qm-hero qm-empty">
          <span class="qm-medallion qm-medallion-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></span>
          <h2 class="qm-empty-title">Nog geen podcasts gegenereerd.</h2>
          <p class="qm-empty-text">
            Genereer een podcast vanuit een sessie verhaal om deze hier te zien.
          </p>
        </div>
      }

      @if (campaignId() && sessions().length > 0) {
        <div class="space-y-4 sm:space-y-6">
          @for (session of sessions(); track session.sessionId) {
            <section class="qm-panel sm:!p-6">
              <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div class="min-w-0">
                  <div class="qm-eyebrow">Speeldag: {{ session.sessionDate }}</div>
                  <h2 class="qm-display text-xl leading-tight break-words">{{ session.sessionTitle }}</h2>
                </div>
                <span class="qm-badge qm-badge-violet">
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
            </section>
          }
        </div>

        <p class="mt-6 text-center text-sm text-white/80">
          Podcasts worden opgeslagen als MP3 en gebruiken AI-stemmen voor
          Nederlandse audio met natuurlijke intonatie.
        </p>
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
