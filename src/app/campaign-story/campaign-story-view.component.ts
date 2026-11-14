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
    <article class="qm-panel qm-hero sm:!p-9">
      @if (!isLatest()) {
        <div class="qm-alert qm-alert-warn relative z-[1] mb-5 flex flex-wrap items-center gap-3">
          <span class="qm-badge">Oudere versie</span>
          <span>Je bekijkt versie {{ version().version }}.</span>
          <button type="button" class="font-semibold underline underline-offset-2 hover:no-underline" (click)="backToLatest.emit()">
            Terug naar nieuwste
          </button>
        </div>
      }

      <header class="mb-6 text-center">
        <div class="qm-eyebrow">{{ meta() }}</div>
        <h2 class="qm-display text-2xl sm:text-3xl leading-tight mt-1.5">{{ version().title || 'Het verhaal tot nu toe' }}</h2>
        <div class="flourish" aria-hidden="true"><span></span></div>
      </header>

      <div class="prose qm-prose qm-dropcap max-w-none" [innerHTML]="renderedContent()"></div>
    </article>
  `,
  styles: [`
    .flourish {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      margin-top: 1rem;
    }
    .flourish::before, .flourish::after { content: ''; width: 5rem; height: 1px; }
    .flourish::before { background: linear-gradient(to left, var(--gold), transparent); }
    .flourish::after { background: linear-gradient(to right, var(--gold), transparent); }
    .flourish > span { width: 7px; height: 7px; background: var(--gold); transform: rotate(45deg); }
  `]
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
