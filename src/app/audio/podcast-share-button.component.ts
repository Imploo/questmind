import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { PodcastShareService, PodcastShareTarget } from './services/podcast-share.service';
import { ToastService } from '../shared/services/toast.service';
import * as logger from '../shared/logger';

/**
 * Creates a public share link for a podcast and copies it to the clipboard.
 * The link opens a player page that works without signing in.
 */
@Component({
  selector: 'app-podcast-share-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      (click)="share()"
      [disabled]="disabled() || busy()"
      class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
      title="Deelbare link kopiëren"
    >
      {{ busy() ? '⏳ Link maken...' : copied() ? '✓ Link gekopieerd' : '🔗 Delen' }}
    </button>
  `
})
export class PodcastShareButtonComponent {
  private readonly shareService = inject(PodcastShareService);
  private readonly toastService = inject(ToastService);

  readonly target = input.required<PodcastShareTarget>();
  readonly disabled = input(false);

  readonly busy = signal(false);
  readonly copied = signal(false);

  async share(): Promise<void> {
    this.busy.set(true);
    const url = this.shareService.createShareUrl(this.target());
    try {
      await copyToClipboard(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 3000);
      this.toastService.show('Link gekopieerd — iedereen met deze link kan de podcast beluisteren.', 'success');
    } catch {
      const shareUrl = await url.catch((error: unknown) => {
        logger.error('Failed to create podcast share link:', error);
        return null;
      });
      if (shareUrl) {
        // Clipboard blocked (permissions/browser): let the user copy it by hand.
        window.prompt('Kopieer de deelbare link:', shareUrl);
      } else {
        this.toastService.show('Deelbare link maken is mislukt. Probeer het opnieuw.', 'error');
      }
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * Copy text that is still being fetched. Safari only allows clipboard writes
 * inside the click, so the pending text is handed over as a ClipboardItem promise.
 */
async function copyToClipboard(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const blob = text.then(value => new Blob([value], { type: 'text/plain' }));
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
    return;
  }
  await navigator.clipboard.writeText(await text);
}
