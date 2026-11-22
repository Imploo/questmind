import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { SessionPodcastListComponent, SessionWithPodcasts } from './session-podcast-list.component';
import { toMillis } from '../shared/utils/date.utils';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

@Component({
  selector: 'app-podcast-library',
  imports: [SessionPodcastListComponent, TranslatePipe],
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
        <app-session-podcast-list [sessions]="sessions()" [campaignId]="campaignId()" [canDelete]="isOwner()" />

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
  /** Only the campaign owner may delete podcasts. */
  readonly isOwner = computed(() => {
    const uid = this.authService.currentUser()?.uid;
    return !!uid && this.campaignContext.selectedCampaign()?.ownerId === uid;
  });
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
        // Newest version first: it is the one shown while the others are folded away.
        podcasts: [...(session.podcasts ?? [])].sort((a, b) => b.version - a.version),
      }))
      .sort((a, b) => toMillis(b.sessionDate) - toMillis(a.sessionDate));
  });
}
