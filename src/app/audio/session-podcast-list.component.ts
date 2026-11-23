import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { PodcastVersion } from './services/audio-session.models';
import { PodcastVersionItemComponent } from '../shared/components/podcast-version-item.component';
import { FormattingService } from '../shared/formatting.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** A session with its podcasts, newest version first. */
export interface SessionWithPodcasts {
  sessionId: string;
  sessionTitle: string;
  /** The stored play day (`2026-11-06`); empty when the session has none. */
  sessionDate: string;
  podcasts: PodcastVersion[];
}

/**
 * The podcasts of a campaign per session. Only the newest version of each session
 * shows; a pill opens the older ones. On the podcasts tab and on a shared campaign,
 * where there is no `campaignId`: the podcasts can then be played and downloaded, not shared or deleted.
 */
@Component({
  selector: 'app-session-podcast-list',
  imports: [PodcastVersionItemComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
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
                [shareTarget]="campaignId() ? { campaignId: campaignId() ?? '', sessionId: session.sessionId, podcastVersion: podcast.version } : null"
                [downloadName]="session.sessionTitle"
                [canDelete]="canDelete()"
              />
            }
          </div>
        </section>
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
export class SessionPodcastListComponent {
  protected readonly formatting = inject(FormattingService);

  readonly sessions = input<SessionWithPodcasts[]>([]);
  /** The campaign, for sharing and deleting a podcast; null on a shared campaign. */
  readonly campaignId = input<string | null>(null);
  /** Only the campaign owner may delete podcasts. */
  readonly canDelete = input(false);

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
