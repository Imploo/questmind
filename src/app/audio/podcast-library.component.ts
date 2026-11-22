import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
                @if (session.podcasts.length > 1) {
                  <!-- Only the newest version shows; the pill opens the older ones. -->
                  <button
                    type="button"
                    class="qm-badge qm-badge-violet version-toggle"
                    [attr.aria-expanded]="isExpanded(session.sessionId)"
                    (click)="toggle(session.sessionId)"
                    data-testid="version-toggle"
                  >
                    {{ 'podcast.library.versionCount' | translate: session.podcasts.length }}
                    <svg
                      class="w-3.5 h-3.5 transition-transform duration-200"
                      [class.rotate-180]="isExpanded(session.sessionId)"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                }
              </div>

              <div class="space-y-3">
                @for (podcast of visiblePodcasts(session); track podcast.version) {
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
  `,
  styles: [`
    .version-toggle {
      min-height: 32px;
      padding-inline: 0.7rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .version-toggle:hover { background: rgba(118, 75, 162, 0.2); }
    .version-toggle[aria-expanded='true'] { border-color: rgba(118, 75, 162, 0.55); }
    @media (pointer: coarse) {
      .version-toggle { min-height: 40px; }
    }
  `]
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
        // Newest version first: it is the one shown while the others are folded away.
        podcasts: [...(session.podcasts ?? [])].sort((a, b) => b.version - a.version),
      }))
      .sort((a, b) => toMillis(b.sessionDate) - toMillis(a.sessionDate));
  });

  /** Sessions whose older podcast versions are open. */
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  isExpanded(sessionId: string): boolean {
    return this.expanded().has(sessionId);
  }

  toggle(sessionId: string): void {
    this.expanded.update(open => {
      const next = new Set(open);
      if (!next.delete(sessionId)) next.add(sessionId);
      return next;
    });
  }

  visiblePodcasts(session: SessionWithPodcasts): PodcastVersion[] {
    return this.isExpanded(session.sessionId) ? session.podcasts : session.podcasts.slice(0, 1);
  }
}
