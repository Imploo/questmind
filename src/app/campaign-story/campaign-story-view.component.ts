import { ChangeDetectionStrategy, Component, SecurityContext, computed, inject, input, output } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';
import { FormattingService } from '../shared/formatting.service';
import { CampaignStoryVersion } from './campaign-story.models';

/** Renders one campaign story version (ticket #69). */
@Component({
  selector: 'app-campaign-story-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="border border-gray-200 rounded-xl bg-white shadow-sm p-6 md:p-8">
      @if (!isLatest()) {
        <div class="mb-4 flex flex-wrap items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <span class="px-2 py-0.5 text-xs font-semibold bg-amber-200 rounded-full">Oudere versie</span>
          <span>Je bekijkt versie {{ version().version }}.</span>
          <button type="button" class="font-semibold underline hover:no-underline" (click)="backToLatest.emit()">
            Terug naar nieuwste
          </button>
        </div>
      }

      <header class="mb-6">
        <h2 class="text-2xl font-bold m-0">{{ version().title || 'Het verhaal tot nu toe' }}</h2>
        <p class="text-sm text-gray-500 m-0 mt-1">{{ meta() }}</p>
      </header>

      <div class="prose prose-gray max-w-none" [innerHTML]="renderedContent()"></div>
    </article>
  `
})
export class CampaignStoryViewComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly formatting = inject(FormattingService);

  readonly version = input.required<CampaignStoryVersion>();
  readonly isLatest = input(true);

  readonly backToLatest = output<void>();

  readonly meta = computed(() => {
    const version = this.version();
    const sessions = version.sourceSessions?.length ?? 0;
    return [
      `Versie ${version.version}`,
      this.formatting.formatDate(version.completedAt ?? version.createdAt),
      `${sessions} ${sessions === 1 ? 'sessie' : 'sessies'}`,
    ].filter(Boolean).join(' · ');
  });

  readonly renderedContent = computed(() => {
    const html = marked.parse(this.version().content ?? '', { async: false, breaks: true, gfm: true }) as string;
    return this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
  });
}
