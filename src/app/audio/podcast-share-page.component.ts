import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PodcastShareService } from './services/podcast-share.service';
import { FormattingService } from '../shared/formatting.service';
import { LogoComponent } from '../shared/components/logo.component';

/** Public player for a shared podcast — no sign-in needed. */
@Component({
  selector: 'app-podcast-share-page',
  imports: [LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-dvh' },
  template: `
    <main class="max-w-xl mx-auto px-4 py-12">
      <div class="mb-6 flex items-center justify-center gap-3">
        <app-logo [size]="44" />
        <div>
          <div class="qm-page-title !text-xl">Questmind</div>
          <div class="qm-page-eyebrow">Podcast</div>
        </div>
      </div>

      @if (share.isLoading()) {
        <div class="text-center py-12" role="status">
          <span class="qm-spinner qm-spinner-lg qm-spinner-light"></span>
          <p class="mt-4 text-white/90">Podcast laden...</p>
        </div>
      } @else if (share.hasValue() && share.value(); as podcast) {
        <article class="qm-panel qm-hero space-y-5">
          <div class="flex items-start gap-4">
            <span class="qm-medallion qm-medallion-brand !w-14 !h-14"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></span>
            <div class="min-w-0">
              <h1 class="qm-display text-2xl leading-tight break-words">{{ podcast.title }}</h1>
              <p class="text-sm qm-muted mt-1">
                {{ podcast.subtitle }}
                @if (podcast.durationSec) {
                  · {{ formatting.formatDuration(podcast.durationSec) }}
                }
              </p>
            </div>
          </div>

          <audio controls preload="metadata" class="w-full" [src]="podcast.audioUrl">
            Je browser ondersteunt het audio element niet.
          </audio>

          <a
            class="qm-btn relative z-[1]"
            [href]="podcast.audioUrl"
            [attr.download]="podcast.title + '.mp3'"
            target="_blank"
            rel="noopener"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" /></svg>
            Download
          </a>
        </article>
      } @else {
        <div class="qm-panel qm-hero qm-empty">
          <span class="qm-medallion qm-medallion-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></span>
          <h1 class="qm-empty-title">Podcast niet gevonden</h1>
          <p class="qm-empty-text">Deze link bestaat niet (meer).</p>
        </div>
      }

      <p class="text-center text-xs text-white/70 mt-8">Gemaakt met QuestMind</p>
    </main>
  `
})
export class PodcastSharePageComponent {
  private readonly shareService = inject(PodcastShareService);
  readonly formatting = inject(FormattingService);

  private readonly shareId = inject(ActivatedRoute).snapshot.paramMap.get('shareId') ?? '';

  readonly share = resource({
    params: () => this.shareId,
    loader: ({ params }) => this.shareService.getShare(params),
  });
}
