import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { PodcastProgressStep, PodcastVersion } from '../../audio/services/audio-session.models';
import { PodcastShareTarget } from '../../audio/services/podcast-share.service';
import { PodcastShareButtonComponent } from '../../audio/podcast-share-button.component';
import { PodcastDeleteService } from '../../audio/services/podcast-delete.service';
import { isActiveGeneration } from '../../campaign-story/campaign-story.utils';
import { ToastService } from '../services/toast.service';
import { callableErrorMessage, callableErrorReason } from '../utils/callable-error';
import * as logger from '../logger';
import { AudioPlayerComponent, type AudioPlayerLabels } from './audio-player.component';
import { FormattingService, formatDuration, formatFileSize } from '../formatting.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

const PROGRESS_STEPS: readonly PodcastProgressStep[] = ['starting', 'script', 'audio', 'uploading', 'done', 'failed'];

/**
 * One podcast version: the player with a status badge, date/size, download and share,
 * and for the campaign owner a delete button.
 * Used by the session story, the podcast library and the campaign story. Downloading is
 * a plain `<a download>` link, the only download path for podcasts.
 */
@Component({
  selector: 'app-podcast-version-item',
  imports: [AudioPlayerComponent, PodcastShareButtonComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // A block, so the spacing a list puts between its items applies.
  host: { class: 'block' },
  template: `
    <article class="qm-well">
      <app-audio-player [src]="podcast().audioUrl" [labels]="playerLabels()" [duration]="podcast().duration ?? 0">
        <!-- In place of the play button while there is nothing to play. -->
        <span playerSeal class="qm-medallion" [class.text-wine]="podcast().status === 'failed'" aria-hidden="true">
          @if (isInProgress()) {
            <span class="qm-spinner"></span>
          } @else {
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          }
        </span>

        <ng-container ngProjectAs="[playerTitle]">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="font-display text-[0.95rem] font-bold leading-tight">{{ 'podcast.versionTitle' | translate: podcast().version }}</span>
            @switch (podcast().status) {
              @case ('completed') {
                <span class="qm-badge" [class]="podcast().audioUrl ? 'qm-badge-success' : 'qm-badge-quiet'" data-testid="podcast-status">
                  {{ (podcast().audioUrl ? 'podcast.status.ready' : 'podcast.status.audioMissing') | translate }}
                </span>
              }
              @case ('failed') {
                <span class="qm-badge qm-badge-danger" data-testid="podcast-status">{{ 'common.failed' | translate }}</span>
              }
              @default {
                <span class="qm-badge qm-badge-info" data-testid="podcast-status">{{ progressLabel() }}</span>
              }
            }
            @if (isInProgress() && partLabel()) {
              <span class="text-xs qm-muted" data-testid="podcast-part">{{ partLabel() }}</span>
            }
          </div>
          @if (details().length) {
            <p class="mt-1 text-xs qm-muted">{{ details().join(' · ') }}</p>
          }
        </ng-container>

        <ng-container ngProjectAs="[playerActions]">
          @if (podcast().audioUrl) {
            <a
              class="qm-btn qm-btn-sm flex-1 @[30rem]:flex-none"
              [href]="podcast().audioUrl"
              [attr.download]="downloadFileName()"
              target="_blank"
              rel="noopener"
              [title]="'podcast.downloadTitle' | translate"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" /></svg>
              {{ 'common.download' | translate }}
            </a>
            @if (shareTarget(); as target) {
              <app-podcast-share-button class="flex-1 @[30rem]:flex-none" [target]="target" [disabled]="!isReady()" />
            }
          }
          @if (canDeleteNow()) {
            <button
              type="button"
              class="qm-btn qm-btn-sm qm-btn-danger shrink-0 !px-2.5"
              (click)="onDelete()"
              [disabled]="deleting()"
              [title]="'podcast.delete' | translate"
              [attr.aria-label]="'podcast.deleteLabel' | translate: podcast().version"
              data-testid="podcast-delete"
            >
              @if (deleting()) {
                <span class="qm-spinner" aria-hidden="true"></span>
              } @else {
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              }
            </button>
          }
        </ng-container>

        @if (isInProgress() && podcast().progress) {
          <div class="qm-progress mt-3">
            <div class="qm-progress-bar" [style.width.%]="podcast().progress"></div>
          </div>
        }

        @if (podcast().status === 'failed' && podcast().error) {
          <p class="mt-3 text-xs text-wine">{{ 'podcast.generationFailed' | translate }}</p>
          <!-- The stored error is raw exception text: not translated, so folded away. -->
          <details class="mt-1 text-xs text-wine">
            <summary>{{ 'errors.technicalDetails' | translate }}</summary>
            <p class="mt-1 whitespace-pre-wrap break-words" data-testid="podcast-error">{{ podcast().error }}</p>
          </details>
        }

        @if (showScript() && podcast().script?.segments?.length) {
          <details class="mt-3 text-sm">
            <summary class="font-semibold text-gold-deep">{{ 'podcast.script' | translate }}</summary>
            <div class="mt-2 space-y-1">
              @for (segment of podcast().script?.segments; track $index) {
                <p class="text-gray-700">
                  <span class="font-semibold">{{ (segment.speaker === 'host1' ? 'podcast.host1' : 'podcast.host2') | translate }}:</span>
                  {{ segment.text }}
                </p>
              }
            </div>
          </details>
        }
      </app-audio-player>
    </article>
  `
})
export class PodcastVersionItemComponent {
  readonly podcast = input.required<PodcastVersion>();
  /**
   * Which podcast this is, for sharing and deleting; without one, or without audio
   * to share, the share button is hidden.
   */
  readonly shareTarget = input<PodcastShareTarget | null>(null);
  /** The campaign owner may delete the podcast (needs `shareTarget`). */
  readonly canDelete = input(false);
  /** Base name of the downloaded file; the version and `.mp3` are appended. */
  readonly downloadName = input('podcast');
  readonly showScript = input(false);

  private readonly formatting = inject(FormattingService);
  private readonly i18n = inject(I18nService);
  private readonly deleter = inject(PodcastDeleteService);
  private readonly toast = inject(ToastService);

  readonly deleting = signal(false);

  readonly isReady = computed(() => this.podcast().status === 'completed' && !!this.podcast().audioUrl);
  readonly isInProgress = computed(() => !['completed', 'failed'].includes(this.podcast().status));
  /** A finished or failed podcast can go, and so can an abandoned one; one being made cannot. */
  readonly canDeleteNow = computed(() =>
    this.canDelete() && !!this.shareTarget() && !(this.isInProgress() && isActiveGeneration(this.podcast().createdAt))
  );
  readonly downloadFileName = computed(() => `${this.downloadName() || 'podcast'}-v${this.podcast().version}.mp3`);

  /** What the player's controls are called for this podcast, in the active language. */
  readonly playerLabels = computed((): AudioPlayerLabels => {
    const player = this.i18n.t().podcast.player;
    const version = this.podcast().version;
    return { play: player.play(version), pause: player.pause(version), position: player.position(version) };
  });

  /**
   * What a podcast in the making is doing. The step the backend reports decides;
   * an entry without one (written before ticket #72) falls back on its status.
   * The stored `progressMessage` is never shown.
   */
  readonly progressLabel = computed(() => {
    const texts = this.i18n.t();
    const { status, progressStep } = this.podcast();
    if (progressStep && PROGRESS_STEPS.includes(progressStep)) return texts.podcast.steps[progressStep];
    return status === 'script_complete' ? texts.podcast.status.generatingAudio : texts.common.busy;
  });

  /** "Part 2 of 5" while the audio is generated in parts; empty otherwise. */
  readonly partLabel = computed(() => {
    const detail = this.podcast().progressDetail;
    return detail && detail.total > 0 ? this.i18n.t().progress.partCount(detail.current, detail.total) : '';
  });

  /** Date and size under the title; the length sits at the end of the seek bar. */
  readonly details = computed(() => {
    const { createdAt, fileSize, audioUrl, duration } = this.podcast();
    return [
      this.formatting.formatDate(createdAt),
      !audioUrl && duration ? formatDuration(duration) : '',
      fileSize ? formatFileSize(fileSize) : '',
    ].filter(Boolean);
  });

  async onDelete(): Promise<void> {
    const target = this.shareTarget();
    if (!target || this.deleting()) return;
    const texts = this.i18n.t();
    if (!(await this.toast.confirm(texts.podcast.deleteConfirm(this.podcast().version)))) return;

    this.deleting.set(true);
    try {
      await this.deleter.delete(target);
    } catch (error) {
      if (!callableErrorReason(error)) logger.error('Deleting a podcast failed:', error);
      const current = this.i18n.t();
      this.toast.show(callableErrorMessage(error, current.errors, current.podcast.deleteFailed), 'error', 6000);
    } finally {
      this.deleting.set(false);
    }
  }
}
