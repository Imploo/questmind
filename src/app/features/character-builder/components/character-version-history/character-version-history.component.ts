import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CharacterVersion } from '../../../../core/models/schemas/character.schema';
import { INITIAL_COMMIT_MESSAGE } from '../../../../core/services/character-version.service';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import type { Translations } from '../../../../core/i18n/translations';
import { FormattingService } from '../../../../shared/formatting.service';

type HistoryTexts = Translations['characters']['history'];

/** What the backend writes on a character copied from a share link: "Imported from questmind.app". */
const IMPORTED_FROM = /^Imported from (\S+)$/;

/**
 * A stored commit message in the active language. The app and the backend write a few
 * fixed English ones; anything else (what The Sidekick wrote about its change) is shown
 * as stored.
 */
export function commitMessageText(message: string, texts: HistoryTexts): string {
  if (message === INITIAL_COMMIT_MESSAGE) return texts.commitInitial;
  if (message === 'Updated via AI chat') return texts.commitAi;
  if (message === 'Cloned from a shared character') return texts.commitCloned;
  const imported = IMPORTED_FROM.exec(message);
  return imported ? texts.commitImported(imported[1]) : message;
}

/** Where a version came from, in words; a source the app does not know is shown as stored. */
export function versionSourceText(source: string, texts: HistoryTexts): string {
  if (source === 'ai') return texts.sourceAi;
  if (source === 'manual') return texts.sourceManual;
  if (source === 'restore') return texts.sourceRestore;
  return source;
}

@Component({
  selector: 'app-character-version-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="qm-scrim flex justify-end" (click)="closed.emit()">
      <aside
        class="qm-drawer w-full max-w-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-history-title"
        (click)="$event.stopPropagation()"
      >
        <header class="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
          <div>
            <div class="qm-eyebrow">{{ 'characters.history.eyebrow' | translate }}</div>
            <h2 id="version-history-title" class="qm-display text-xl">{{ 'characters.history.title' | translate }}</h2>
          </div>
          <button type="button" class="qm-btn qm-btn-ghost qm-btn-icon" [attr.aria-label]="'common.close' | translate" (click)="closed.emit()">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>

        <div class="flex-1 overflow-y-auto scrollbar-thin px-5 pb-6">
          <ol class="timeline">
            @for (version of versions(); track version.id) {
              <li
                class="entry"
                [class.is-active]="version.id === activeVersionId()"
                [attr.aria-current]="version.id === activeVersionId() ? 'true' : null"
              >
                <div class="entry-body">
                  <div class="flex items-center justify-between gap-2">
                    <h3 class="font-display text-sm font-bold tracking-wide">{{ 'common.version' | translate: version.versionNumber }}</h3>
                    @if (version.id === activeVersionId()) {
                      <span class="qm-badge qm-badge-brand">{{ 'characters.history.active' | translate }}</span>
                    }
                  </div>
                  <p class="mt-1 text-sm text-gray-800">{{ commitMessage(version) }}</p>
                  <div class="qm-help mt-1.5">
                    {{ formatting.formatDate(version.createdAt.toDate()) }} · {{ source(version) }}
                  </div>

                  @if (version.id !== activeVersionId()) {
                    <button type="button" class="qm-btn qm-btn-sm mt-2.5" (click)="activate.emit(version)">
                      {{ 'characters.history.makeActive' | translate }}
                    </button>
                  }
                </div>
              </li>
            } @empty {
              <li class="py-6 text-center text-sm qm-muted">{{ 'characters.history.empty' | translate }}</li>
            }
          </ol>
        </div>
      </aside>
    </div>
  `,
  styles: [`
    /* A line of diamonds down the margin, newest first. */
    .timeline { margin-left: 4px; border-left: 1px solid #e0d2b6; }
    .entry { position: relative; padding: 0 0 0.6rem 1.1rem; }
    .entry:last-child { padding-bottom: 0; }
    .entry-body { padding: 0.6rem 0.75rem 0.75rem; border: 1px solid transparent; border-radius: 10px; }
    /* The version the character is on: a shade darker than the drawer, next to its chip. */
    .entry.is-active .entry-body { background: var(--paper-2); border-color: var(--line); }
    .entry::before {
      content: '';
      position: absolute;
      left: -5px;
      top: 0.95rem;
      width: 9px;
      height: 9px;
      background: var(--paper);
      border: 1.5px solid var(--gold);
      transform: rotate(45deg);
    }
    .entry.is-active::before { background: var(--gold); }
  `]
})
export class CharacterVersionHistoryComponent {
  private readonly i18n = inject(I18nService);
  protected readonly formatting = inject(FormattingService);

  /** Every version, newest first. */
  versions = input.required<CharacterVersion[]>();
  /** The version the character is on. */
  activeVersionId = input.required<string>();

  closed = output<void>();
  /** The owner picked another version to put the character on. */
  activate = output<CharacterVersion>();

  protected commitMessage(version: CharacterVersion): string {
    return commitMessageText(version.commitMessage, this.i18n.t().characters.history);
  }

  protected source(version: CharacterVersion): string {
    return versionSourceText(version.source, this.i18n.t().characters.history);
  }
}
