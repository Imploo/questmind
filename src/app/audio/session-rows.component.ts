import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** One evening of play in a list of sessions. */
export interface SessionRow {
  id: string;
  /** Where the row leads: the session's page. */
  link: string[];
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

/**
 * A list of sessions, newest first: the play day, the title and the first line of
 * the story, or the progress of one still being processed. On the sessions tab of a
 * campaign and on a shared campaign.
 */
@Component({
  selector: 'app-session-rows',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ul class="flex flex-col" role="list" [attr.aria-label]="'audio.list.ariaLabel' | translate">
      @for (row of rows(); track row.id) {
        <li>
          <a
            [routerLink]="row.link"
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
export class SessionRowsComponent {
  readonly rows = input<SessionRow[]>([]);
}
