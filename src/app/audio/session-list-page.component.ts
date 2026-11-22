import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { isActiveStage, toDisplayProgress } from './services/session-progress.utils';
import { STAGE_TITLE_KEYS } from './session-progress-card.component';
import { CampaignStoryService } from '../campaign-story/campaign-story.service';
import {
  countChangedSessions,
  coveredUntil,
  isUsableSession,
  latestCompletedVersion,
} from '../campaign-story/campaign-story.utils';
import { FormattingService } from '../shared/formatting.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { SessionRow, SessionRowsComponent } from './session-rows.component';
import { dayParts, storyExcerpt } from './session-row.utils';

/** The note above the list that the campaign story lags behind its sessions. */
interface StoryNote {
  title: string;
  text: string;
  action: string;
}

/**
 * The sessions tab of a campaign: every evening of play, newest first, with the
 * ones still being processed marked by their progress.
 */
@Component({
  selector: 'app-session-list-page',
  imports: [RouterLink, SessionRowsComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="qm-panel !p-3 sm:!p-5 space-y-4">
      @if (storyNote(); as note) {
        <div class="qm-well flex flex-wrap items-center gap-x-4 gap-y-3" data-testid="story-note">
          <span class="qm-medallion qm-medallion-sm" aria-hidden="true">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 7v14M3 18a1 1 0 01-1-1V4a1 1 0 011-1h5a4 4 0 014 4 4 4 0 014-4h5a1 1 0 011 1v13a1 1 0 01-1 1h-6a3 3 0 00-3 3 3 3 0 00-3-3z" /></svg>
          </span>
          <div class="min-w-0 flex-[1_1_16rem]">
            <p class="text-sm font-semibold">{{ note.title }}</p>
            <p class="text-[13px] text-gray-600 mt-0.5">{{ note.text }}</p>
          </div>
          <a [routerLink]="['/campaign', campaignId(), 'story']" class="qm-btn">{{ note.action }}</a>
        </div>
      }

      @if (rows().length === 0) {
        <div class="qm-empty py-10">
          <span class="qm-medallion qm-medallion-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></span>
          <h2 class="qm-empty-title">{{ 'audio.list.emptyTitle' | translate }}</h2>
          <p class="qm-empty-text">{{ 'audio.list.emptyText' | translate }}</p>
          <a [routerLink]="['/campaign', campaignId(), 'sessions', 'new']" class="qm-btn qm-btn-primary qm-btn-lg mt-6">
            {{ 'audio.list.uploadFirst' | translate }}
          </a>
        </div>
      } @else {
        <app-session-rows [rows]="rows()" />
      }
    </section>
  `,
})
export class SessionListPageComponent {
  private readonly authService = inject(AuthService);
  private readonly campaignContext = inject(CampaignContextService);
  private readonly sessionState = inject(AudioSessionStateService);
  private readonly storyService = inject(CampaignStoryService);
  private readonly formatting = inject(FormattingService);
  private readonly i18n = inject(I18nService);

  readonly campaignId = this.campaignContext.selectedCampaignId;

  readonly rows = computed<SessionRow[]>(() => {
    const userId = this.authService.currentUser()?.uid;
    const t = this.i18n.t();
    const locale = this.i18n.locale();
    return this.sessionState.sortedSessions().map(session => {
      const { day, month } = dayParts(session.sessionDate, locale);
      const progress = toDisplayProgress(session);
      const busy = isActiveStage(progress?.stage) && progress
        ? { label: t.progress.stages[STAGE_TITLE_KEYS[progress.stage]], percent: Math.round(progress.progress ?? 0) }
        : null;
      return {
        id: session.id,
        link: ['/campaign', this.campaignId() ?? '', 'sessions', session.id],
        title: session.title || t.audio.untitledSession,
        day,
        month,
        excerpt: storyExcerpt(session.content),
        hasPodcast: (session.podcasts ?? []).some(podcast => !!podcast.audioUrl),
        isMine: !!userId && session.ownerId === userId,
        failed: !busy && session.status === 'failed',
        busy,
      };
    });
  });

  /** Only for the owner, who can do something about it: the story lags behind the sessions. */
  readonly storyNote = computed<StoryNote | null>(() => {
    const campaign = this.campaignContext.selectedCampaign();
    const userId = this.authService.currentUser()?.uid;
    if (!campaign || !userId || campaign.ownerId !== userId) return null;

    const t = this.i18n.t().campaignStory;
    const sessions = this.sessionState.sessions();
    const latest = latestCompletedVersion(this.storyService.versions());
    if (latest) {
      const changed = countChangedSessions(latest, sessions);
      if (changed === 0) return null;
      const day = coveredUntil(latest);
      return {
        title: day ? t.coversUntil(this.formatting.formatDay(day)) : t.updatedOn(this.formatting.formatDate(latest.createdAt)),
        text: t.changedSessions(changed),
        action: t.update,
      };
    }
    const usable = sessions.filter(isUsableSession).length;
    if (usable === 0 || this.storyService.isLoading()) return null;
    return { title: t.noStory, text: t.readySessions(usable), action: t.write };
  });
}

