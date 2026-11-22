import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { PodcastShareService, PodcastShareTarget } from './services/podcast-share.service';
import { ToastService } from '../shared/services/toast.service';
import * as logger from '../shared/logger';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { callableErrorMessage } from '../shared/utils/callable-error';
import { copyPendingText } from '../shared/utils/clipboard';

/**
 * Creates a public share link for a podcast and copies it to the clipboard.
 * The link opens a player page that works without signing in.
 */
@Component({
  selector: 'app-podcast-share-button',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The button fills its host, so a parent can stretch the host to size it.
  host: { class: 'inline-flex' },
  template: `
    <button
      type="button"
      (click)="share()"
      [disabled]="disabled() || busy()"
      class="qm-btn qm-btn-sm w-full"
      [title]="'podcast.share.copyLinkTitle' | translate"
    >
      @if (busy()) {
        <span class="qm-spinner" aria-hidden="true"></span>
      } @else if (copied()) {
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
      } @else {
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
      }
      {{ label() }}
    </button>
  `
})
export class PodcastShareButtonComponent {
  private readonly shareService = inject(PodcastShareService);
  private readonly toastService = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly target = input.required<PodcastShareTarget>();
  readonly disabled = input(false);

  readonly busy = signal(false);
  readonly copied = signal(false);

  /** What the button says: making the link, just copied, or simply "Share". */
  readonly label = computed(() => {
    const texts = this.i18n.t();
    if (this.busy()) return texts.podcast.share.creating;
    return this.copied() ? texts.podcast.share.copied : texts.common.share;
  });

  async share(): Promise<void> {
    this.busy.set(true);
    const url = this.shareService.createShareUrl(this.target(), this.i18n.language());
    try {
      await copyPendingText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 3000);
      this.toastService.show(this.i18n.t().podcast.share.copiedToast, 'success');
    } catch {
      let shareError: unknown = null;
      const shareUrl = await url.catch((error: unknown) => {
        shareError = error;
        logger.error('Failed to create podcast share link:', error);
        return null;
      });
      if (shareUrl) {
        // Clipboard blocked (permissions/browser): let the user copy it by hand.
        window.prompt(this.i18n.t().podcast.share.copyPrompt, shareUrl);
      } else {
        // A refusal with a reason ("not ready to share yet") says so; anything else is the general text.
        const texts = this.i18n.t();
        this.toastService.showCallableError(
          shareError,
          callableErrorMessage(shareError, texts.errors, texts.podcast.share.failed)
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}
