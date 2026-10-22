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
        <div class="absolute inset-0 bg-black/30" (click)="closed.emit()" aria-hidden="true"></div>

        <aside
          class="relative w-full max-w-sm h-full bg-white shadow-xl flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Versies van het verhaal"
        >
          <div class="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 class="text-lg font-semibold m-0">Versies</h2>
            <button
              type="button"
              class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              (click)="closed.emit()"
              aria-label="Sluiten"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <ul class="flex-1 overflow-y-auto p-2 space-y-1 list-none m-0">
            @for (version of versions(); track version.id) {
              <li>
                <button
                  type="button"
                  class="w-full text-left p-3 rounded-lg border transition-colors disabled:cursor-not-allowed"
                  [class.border-primary]="version.version === selectedVersion()"
                  [class.bg-blue-50]="version.version === selectedVersion()"
                  [class.border-transparent]="version.version !== selectedVersion()"
                  [class.hover:bg-gray-50]="version.version !== selectedVersion()"
                  [disabled]="version.status !== 'completed'"
                  (click)="selected.emit(version.version)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-semibold text-gray-900">Versie {{ version.version }}</span>
                    @switch (version.status) {
                      @case ('generating') {
                        <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Bezig...</span>
                      }
                      @case ('failed') {
                        <span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Mislukt</span>
                      }
                      @default {
                        @if (version.podcasts?.length) {
                          <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                            🎙️ {{ version.podcasts?.length }}
                          </span>
                        }
                      }
                    }
                  </div>
                  @if (version.title) {
                    <p class="text-sm text-gray-700 m-0 mt-1 truncate">{{ version.title }}</p>
                  }
                  <p class="text-xs text-gray-500 m-0 mt-1">
                    {{ formatting.formatDate(version.createdAt) }} · {{ version.sourceSessions.length }}
                    {{ version.sourceSessions.length === 1 ? 'sessie' : 'sessies' }}
                  </p>
                  @if (version.status === 'failed' && version.error) {
                    <p class="text-xs text-red-600 m-0 mt-1">{{ version.error }}</p>
                  }
                </button>
              </li>
            } @empty {
              <li class="p-4 text-sm text-gray-500">Nog geen versies.</li>
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
