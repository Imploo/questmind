import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CharacterVersion } from '../../../../core/models/schemas/character.schema';

@Component({
  selector: 'app-character-version-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
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
            <div class="qm-eyebrow">Character</div>
            <h2 id="version-history-title" class="qm-display text-xl">Version History</h2>
          </div>
          <button type="button" class="qm-btn qm-btn-ghost qm-btn-icon" aria-label="Close" (click)="closed.emit()">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>

        <div class="flex-1 overflow-y-auto scrollbar-thin px-5 pb-6">
          <ol class="timeline">
            @for (version of versions(); track version.id) {
              <li class="entry" [class.is-active]="version.id === activeVersionId()">
                <div class="flex items-center justify-between gap-2">
                  <h3 class="font-display text-sm font-bold tracking-wide">Version {{ version.versionNumber }}</h3>
                  @if (version.id === activeVersionId()) {
                    <span class="qm-badge qm-badge-brand">Active</span>
                  }
                </div>
                <p class="mt-1 text-sm text-gray-800">{{ version.commitMessage }}</p>
                <div class="qm-help mt-1.5">
                  {{ version.createdAt.toDate() | date:'medium' }} · {{ version.source }}
                </div>

                @if (version.id !== activeVersionId()) {
                  <button type="button" class="qm-btn qm-btn-sm mt-2.5" (click)="restore.emit(version)">
                    Restore
                  </button>
                }
              </li>
            } @empty {
              <li class="py-6 text-center text-sm qm-muted">No history available.</li>
            }
          </ol>
        </div>
      </aside>
    </div>
  `,
  styles: [`
    /* A line of diamonds down the margin, newest first. */
    .timeline { margin-left: 4px; border-left: 1px solid #e0d2b6; }
    .entry { position: relative; padding: 0 0 1.4rem 1.4rem; }
    .entry:last-child { padding-bottom: 0; }
    .entry::before {
      content: '';
      position: absolute;
      left: -5px;
      top: 0.35rem;
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
  versions = input.required<CharacterVersion[]>();
  activeVersionId = input.required<string>();
  
  closed = output<void>();
  restore = output<CharacterVersion>();
}
