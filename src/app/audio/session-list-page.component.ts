import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { AudioSessionRecord } from './services/audio-session.models';
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

interface SessionRow {
  id: string;
  title: string;
  day: string;
  month: string;
  excerpt: string;
  hasPodcast: boolean;
  isMine: boolean;
  failed: boolean;
  /** Set while the session is uploaded or processed. */
  busy: { label: string; percent: number } | null;
}

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
  imports: [RouterLink, TranslatePipe],
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
        <ul class="flex flex-col" role="list" [attr.aria-label]="'audio.list.ariaLabel' | translate">
          @for (row of rows(); track row.id) {
            <li>
              <a
                [routerLink]="['/campaign', campaignId(), 'sessions', row.id]"
                class="session-row"
                [class.is-busy]="row.busy"
                data-testid="session-row"
              >
                <span class="session-day" aria-hidden="true">
                  <span class="session-day-number">{{ row.day }}</span>
                  <span class="session-day-month">{{ row.month }}</span>
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-[15px] font-semibold">{{ row.title }}</span>
                  @if (row.busy; as busy) {
                    <span class="mt-2 flex items-center gap-2.5">
                      <span class="session-progress" role="progressbar" [attr.aria-valuenow]="busy.percent" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="busy.label">
                        <span [style.width.%]="busy.percent"></span>
                      </span>
                      <span class="shrink-0 text-[13px] font-semibold text-[#3f4aa6]">{{ busy.label }} · {{ busy.percent }}%</span>
                    </span>
                  } @else if (row.excerpt) {
                    <span class="block truncate font-prose text-[17px] leading-snug text-gray-700 mt-0.5">{{ row.excerpt }}</span>
                  }
                </span>
                <span class="flex items-center gap-2">
                  @if (row.failed) {
                    <span class="qm-badge qm-badge-danger">{{ 'common.failed' | translate }}</span>
                  }
                  @if (row.hasPodcast) {
                    <span class="qm-badge qm-badge-violet hidden sm:inline-flex">{{ 'audio.list.podcast' | translate }}</span>
                  }
                  @if (row.isMine) {
                    <span class="qm-badge qm-badge-quiet hidden sm:inline-flex">{{ 'audio.list.you' | translate }}</span>
                  }
                  <svg class="w-[18px] h-[18px] text-gold-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </a>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    .session-row {
      display: grid;
      grid-template-columns: 3rem minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.85rem;
      padding: 0.8rem 0.6rem;
      border: 1px solid transparent;
      border-bottom: 1px dashed #e0d2b6;
      color: var(--ink);
      text-decoration: none;
      transition: background 0.15s;
    }
    li:last-child .session-row { border-bottom-color: transparent; }
    .session-row:hover { background: var(--paper-2); }
    .session-row.is-busy {
      border-radius: 10px;
      border-color: rgba(102, 126, 234, 0.32);
      background: rgba(102, 126, 234, 0.08);
    }
    .session-day {
      display: flex;
      flex-direction: column;
      align-items: center;
      line-height: 1.1;
      font-family: var(--font-display);
    }
    .session-day-number { font-size: 1.3rem; font-weight: 700; }
    .session-day-month {
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #5f5347;
    }
    .session-progress {
      display: block;
      flex: 1;
      max-width: 22rem;
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: #dfe3fb;
    }
    .session-progress > span {
      display: block;
      height: 100%;
      border-radius: 999px;
      background: var(--color-primary-dark);
    }
    @media (min-width: 640px) {
      .session-row { grid-template-columns: 3.5rem minmax(0, 1fr) auto; gap: 1rem; padding-inline: 0.75rem; }
    }
  `],
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
        title: session.title || t.audio.untitledSession,
        day,
        month,
        excerpt: excerpt(session.content),
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

/** The day and the short month of a stored play day (`2026-11-20` → `20`, `nov`); dashes without one. */
function dayParts(isoDay: string | undefined, locale: string): { day: string; month: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay ?? '');
  if (!match) return { day: '–', month: '' };
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return {
    day: String(date.getDate()),
    month: date.toLocaleDateString(locale, { month: 'short' }).replace(/\.$/, ''),
  };
}

/** The first line of prose of a session story, without its markdown. */
function excerpt(content: AudioSessionRecord['content'] | undefined): string {
  const line = (content ?? '')
    .split('\n')
    .map(text => text.trim())
    .find(text => text && !text.startsWith('#') && !/^[-*_]{3,}$/.test(text));
  return (line ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .trim();
}
