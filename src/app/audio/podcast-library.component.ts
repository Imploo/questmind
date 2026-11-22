import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { PodcastVersion } from './services/audio-session.models';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { PodcastVersionItemComponent } from '../shared/components/podcast-version-item.component';
import { toMillis } from '../shared/utils/date.utils';
import { FormattingService } from '../shared/formatting.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

interface SessionWithPodcasts {
  sessionId: string;
  sessionTitle: string;
  /** The stored play day (`2026-11-06`); empty when the session has none. */
  sessionDate: string;
  podcasts: PodcastVersion[];
}

@Component({
  selector: 'app-podcast-library',
  imports: [PodcastVersionItemComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      @if (sessions().length > 0) {
        <p class="mb-4 text-sm text-white/85">{{ 'podcast.library.intro' | translate }}</p>
      }

      @if (campaignId() && sessions().length === 0) {
        <div class="qm-panel qm-hero qm-empty">
          <span class="qm-medallion qm-medallion-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></span>
          <h2 class="qm-empty-title">{{ 'podcast.library.emptyTitle' | translate }}</h2>
          <p class="qm-empty-text">
            {{ 'podcast.library.emptyText' | translate }}
          </p>
        </div>
      }

      @if (campaignId() && sessions().length > 0) {
        <div class="space-y-4 sm:space-y-6">
          @for (session of sessions(); track session.sessionId) {
            <section class="qm-panel sm:!p-6">
              <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div class="min-w-0">
                  <div class="qm-eyebrow">
                    @if (session.sessionDate) {
                      {{ 'podcast.library.playDay' | translate: formatting.formatDay(session.sessionDate) }}
                    } @else {
                      {{ 'podcast.library.playDayUnknown' | translate }}
                    }
                  </div>
                  <h2 class="qm-display text-xl leading-tight break-words">{{ session.sessionTitle }}</h2>
                </div>
                <span class="qm-badge qm-badge-violet">
                  {{ 'podcast.library.versionCount' | translate: session.podcasts.length }}
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
          {{ 'podcast.library.footer' | translate }}
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
  protected readonly formatting = inject(FormattingService);
  private readonly i18n = inject(I18nService);

  /** Sessions with at least one podcast, newest play date first. */
  readonly sessions = computed<SessionWithPodcasts[]>(() => {
    if (!this.campaignId() || !this.authService.currentUser()?.uid) return [];
    const untitled = this.i18n.t().audio.untitledSession;

    return this.sessionStateService.sessions()
      .filter(session => Array.isArray(session.podcasts) && session.podcasts.length > 0)
      .map(session => ({
        sessionId: session.id,
        sessionTitle: session.title || untitled,
        sessionDate: session.sessionDate || '',
        podcasts: session.podcasts ?? [],
      }))
      .sort((a, b) => toMillis(b.sessionDate) - toMillis(a.sessionDate));
  });
}
