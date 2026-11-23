import { ChangeDetectionStrategy, Component, SecurityContext, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { PodcastVersionItemComponent } from '../shared/components/podcast-version-item.component';
import { FormattingService } from '../shared/formatting.service';
import { markdownToHtml } from '../shared/utils/markdown';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { SharedCampaignStore, shareIdOf } from './shared-campaign.store';
import { SharedCampaignStatusComponent } from './shared-campaign-status.component';
import { toPodcastVersion } from './campaign-share.models';

/** One session of a shared campaign, read-only: its story and its podcasts, and the way to the sessions beside it. */
@Component({
  selector: 'app-shared-session-page',
  imports: [RouterLink, PodcastVersionItemComponent, SharedCampaignStatusComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-4xl mx-auto space-y-4">
      @if (store.campaign(); as campaign) {
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <nav class="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-white" [attr.aria-label]="'audio.page.breadcrumb' | translate">
            <a [routerLink]="store.base()" class="crumb">{{ campaign.name }}</a>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 6l6 6-6 6" /></svg>
            <a [routerLink]="store.base().concat('sessions')" class="crumb">{{ 'campaign.page.tabs.sessions' | translate }}</a>
          </nav>

          @if (session()) {
            <div class="flex gap-2">
              @if (previousSession(); as previous) {
                <a
                  [routerLink]="store.base().concat('sessions', previous.id)"
                  class="qm-btn"
                  [attr.aria-label]="'audio.page.previousLabel' | translate: previous.title"
                  data-testid="previous-session"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 6l-6 6 6 6" /></svg>
                  {{ 'audio.page.previous' | translate }}
                </a>
              }
              @if (nextSession(); as next) {
                <a
                  [routerLink]="store.base().concat('sessions', next.id)"
                  class="qm-btn"
                  [attr.aria-label]="'audio.page.nextLabel' | translate: next.title"
                  data-testid="next-session"
                >
                  {{ 'audio.page.next' | translate }}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 6l6 6-6 6" /></svg>
                </a>
              }
            </div>
          }
        </div>

        @if (session(); as session) {
          <article class="qm-panel sm:!p-9">
            <header class="mb-6">
              <div class="qm-eyebrow">{{ 'audio.story.eyebrow' | translate }}</div>
              <h1 class="qm-display text-2xl sm:text-3xl leading-tight break-words mt-1">{{ session.title || ('audio.defaultStoryTitle' | translate) }}</h1>
              <p class="text-sm qm-muted mt-1">{{ formatting.formatDay(session.sessionDate) || ('audio.noDate' | translate) }}</p>
            </header>
            <div class="prose qm-prose max-w-none" [innerHTML]="renderedStory()" data-testid="session-story"></div>
          </article>

          @if (podcasts().length > 0) {
            <section class="qm-panel sm:!p-6 space-y-3">
              <h2 class="qm-eyebrow">{{ 'podcast.session.listTitle' | translate: podcasts().length }}</h2>
              @for (podcast of podcasts(); track podcast.version) {
                <app-podcast-version-item [podcast]="podcast" [downloadName]="session.title || 'podcast'" />
              }
            </section>
          }
        } @else {
          <div class="qm-panel qm-hero qm-empty" data-testid="session-not-found">
            <p class="qm-empty-text">{{ 'campaign.sharePage.sessionNotFound' | translate }}</p>
            <a [routerLink]="store.base().concat('sessions')" class="qm-btn mt-4">{{ 'campaign.page.tabs.sessions' | translate }}</a>
          </div>
        }
      } @else {
        <app-shared-campaign-status />
      }
    </div>
  `,
  styles: [`
    .crumb {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      color: #fff;
      text-decoration: none;
      text-shadow: 0 1px 6px rgba(34, 16, 80, 0.4);
    }
    .crumb:hover { text-decoration: underline; }
  `],
})
export class SharedSessionPageComponent {
  protected readonly store = inject(SharedCampaignStore);
  protected readonly formatting = inject(FormattingService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly i18n = inject(I18nService);
  private readonly route = inject(ActivatedRoute);

  /** Follows the address: the previous and next buttons stay on this page. */
  private readonly sessionId = toSignal(this.route.paramMap.pipe(map(params => params.get('sessionId') ?? '')), { initialValue: '' });

  private readonly sessions = computed(() => this.store.campaign()?.sessions ?? []);
  readonly session = computed(() => this.sessions().find(session => session.id === this.sessionId()) ?? null);
  readonly podcasts = computed(() => (this.session()?.podcasts ?? []).map(toPodcastVersion));

  readonly renderedStory = computed(() =>
    this.sanitizer.sanitize(SecurityContext.HTML, markdownToHtml(this.session()?.content ?? '')) ?? ''
  );

  /** The sessions are newest first: the previous one is played earlier. */
  readonly previousSession = computed(() => this.neighbour(1));
  readonly nextSession = computed(() => this.neighbour(-1));

  constructor() {
    this.store.select(shareIdOf(this.route));
  }

  private neighbour(offset: number): { id: string; title: string } | null {
    const sessions = this.sessions();
    const index = sessions.findIndex(session => session.id === this.sessionId());
    const neighbour = index < 0 ? null : sessions[index + offset];
    return neighbour ? { id: neighbour.id, title: neighbour.title || this.i18n.t().audio.untitledSession } : null;
  }
}
