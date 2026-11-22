import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { CampaignShareService } from './campaign-share.service';
import { ToastService } from '../shared/services/toast.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { callableErrorMessage } from '../shared/utils/callable-error';
import { copyPendingText } from '../shared/utils/clipboard';
import * as logger from '../shared/logger';

/**
 * Copies the share link of a campaign. The link opens the campaign read-only,
 * without signing in, and gives chat apps a preview of it.
 */
@Component({
  selector: 'app-campaign-share-button',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <button
      type="button"
      class="qm-btn qm-btn-lg qm-btn-icon"
      (click)="share()"
      [disabled]="busy()"
      [attr.aria-label]="'campaign.share.button' | translate"
      [title]="'campaign.share.button' | translate"
      data-testid="share-campaign"
    >
      @if (busy()) {
        <span class="qm-spinner" aria-hidden="true"></span>
      } @else if (copied()) {
        <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      } @else {
        <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <circle cx="18" cy="5" r="2.5" stroke-width="2" />
          <circle cx="6" cy="12" r="2.5" stroke-width="2" />
          <circle cx="18" cy="19" r="2.5" stroke-width="2" />
          <path stroke-linecap="round" stroke-width="2" d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
        </svg>
      }
    </button>
  `,
})
export class CampaignShareButtonComponent {
  private readonly shareService = inject(CampaignShareService);
  private readonly toastService = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly campaignId = input.required<string>();

  readonly busy = signal(false);
  readonly copied = signal(false);

  async share(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const url = this.shareService.createShareUrl(this.campaignId(), this.i18n.language());
    try {
      await copyPendingText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 3000);
      this.toastService.show(this.i18n.t().campaign.share.copied, 'success');
    } catch {
      let shareError: unknown = null;
      const shareUrl = await url.catch((error: unknown) => {
        shareError = error;
        logger.error('Failed to create campaign share link:', error);
        return null;
      });
      const texts = this.i18n.t();
      if (shareUrl) {
        // Clipboard blocked (permissions/browser): let the user copy it by hand.
        window.prompt(texts.campaign.share.copyPrompt, shareUrl);
      } else {
        this.toastService.showCallableError(shareError, callableErrorMessage(shareError, texts.errors, texts.campaign.share.failed));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
