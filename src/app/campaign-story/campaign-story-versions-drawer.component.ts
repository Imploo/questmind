import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormattingService } from '../shared/formatting.service';
import { CampaignStoryVersion } from './campaign-story.models';

/** Slide-over listing all campaign story versions (ticket #69). Deliberately tucked away. */
@Component({
  selector: 'app-campaign-story-versions-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex justify-end">
        <div class="qm-scrim" (click)="closed.emit()" aria-hidden="true"></div>

        <aside
          class="qm-drawer relative z-50 w-full max-w-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Versies van het verhaal"
        >
          <div class="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
            <div>
              <div class="qm-eyebrow">Verhaal</div>
              <h2 class="qm-display text-xl">Versies</h2>
            </div>
            <button
              type="button"
              class="qm-btn qm-btn-ghost qm-btn-icon"
              (click)="closed.emit()"
              aria-label="Sluiten"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <ul class="flex-1 overflow-y-auto scrollbar-thin px-3 pb-4 space-y-1 list-none m-0">
            @for (version of versions(); track version.id) {
              <li>
                <button
                  type="button"
                  class="qm-item"
                  [class.is-active]="version.version === selectedVersion()"
                  [disabled]="version.status !== 'completed'"
                  (click)="selected.emit(version.version)"
                >
                  <span class="flex items-center justify-between gap-2">
                    <span class="font-display text-sm font-bold tracking-wide">Versie {{ version.version }}</span>
                    @switch (version.status) {
                      @case ('generating') {
                        <span class="qm-badge qm-badge-info">Bezig...</span>
                      }
                      @case ('failed') {
                        <span class="qm-badge qm-badge-danger">Mislukt</span>
                      }
                      @default {
                        @if (version.podcasts?.length) {
                          <span class="qm-badge qm-badge-violet">
                            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                            {{ version.podcasts?.length }}
                          </span>
                        }
                      }
                    }
                  </span>
                  @if (version.title) {
                    <span class="block text-sm text-gray-800 mt-1 truncate">{{ version.title }}</span>
                  }
                  <span class="block text-xs qm-muted mt-1">
                    {{ formatting.formatDate(version.createdAt) }} · {{ version.sourceSessions.length }}
                    {{ version.sourceSessions.length === 1 ? 'sessie' : 'sessies' }}
                  </span>
                  @if (version.status === 'failed' && version.error) {
                    <span class="block text-xs text-wine mt-1">{{ version.error }}</span>
                  }
                </button>
              </li>
            } @empty {
              <li class="p-4 text-sm qm-muted">Nog geen versies.</li>
            }
          </ul>
        </aside>
      </div>
    }
  `
})
export class CampaignStoryVersionsDrawerComponent {
  readonly formatting = inject(FormattingService);

  readonly open = input(false);
  readonly versions = input<CampaignStoryVersion[]>([]);
  readonly selectedVersion = input<number | null>(null);

  readonly selected = output<number>();
  readonly closed = output<void>();

  onEscape(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }
}
