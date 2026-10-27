import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PodcastShareService } from './services/podcast-share.service';
import { FormattingService } from '../shared/formatting.service';

/** Public player for a shared podcast — no sign-in needed. */
@Component({
  selector: 'app-podcast-share-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-screen bg-gradient-to-br from-purple-50 to-pink-50' },
  template: `
    <main class="max-w-xl mx-auto px-4 py-12">
      @if (share.isLoading()) {
        <div class="text-center py-12">
          <div class="animate-spin h-12 w-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
          <p class="mt-4 text-gray-600 m-0">Podcast laden...</p>
        </div>
      } @else if (share.hasValue() && share.value(); as podcast) {
        <article class="bg-white border border-purple-200 rounded-2xl shadow-sm p-6 space-y-5">
          <div class="flex items-start gap-4">
            <span class="flex-shrink-0 inline-flex items-center justify-center w-14 h-14 bg-purple-600 text-white rounded-full text-2xl">🎙️</span>
            <div class="min-w-0">
              <h1 class="text-2xl font-bold text-gray-900 m-0">{{ podcast.title }}</h1>
              <p class="text-sm text-gray-500 m-0 mt-1">
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
            class="inline-block text-sm font-medium text-purple-700 hover:underline"
            [href]="podcast.audioUrl"
            [attr.download]="podcast.title + '.mp3'"
            target="_blank"
            rel="noopener"
          >
            ⬇️ Download
          </a>
        </article>
      } @else {
        <div class="text-center py-12 bg-white rounded-2xl border border-gray-200">
          <div class="text-5xl mb-4">🔇</div>
          <h1 class="text-xl font-semibold text-gray-800 m-0">Podcast niet gevonden</h1>
          <p class="text-gray-600 m-0 mt-2">Deze link bestaat niet (meer).</p>
        </div>
      }

      <p class="text-center text-xs text-gray-400 mt-8 m-0">Gemaakt met QuestMind</p>
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
