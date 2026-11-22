import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { AudioSessionStateService } from '../audio/services/audio-session-state.service';
import { CampaignStoryService } from './campaign-story.service';
import { CampaignStoryViewComponent } from './campaign-story-view.component';
import { CampaignStoryVersionsDrawerComponent } from './campaign-story-versions-drawer.component';
import { CampaignStoryPodcastsComponent } from './campaign-story-podcasts.component';
import {
  countChangedSessions,
  coveredUntil,
  isActiveGeneration,
  isUsableSession,
  latestCompletedVersion,
  storyProgressText,
} from './campaign-story.utils';
import { FormattingService } from '../shared/formatting.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/**
 * The story tab of a campaign (ticket #69): how far the story runs, the newest
 * version of the campaign-wide story, older versions in a drawer, and generation of
 * new versions/podcasts for the owner. Without a story it says what comes first.
 */
@Component({
  selector: 'app-campaign-story-page',
  imports: [
    RouterLink,
    CampaignStoryViewComponent,
    CampaignStoryVersionsDrawerComponent,
    CampaignStoryPodcastsComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4 sm:space-y-5">
      @if (errorMessage()) {
        <div class="qm-alert" role="alert">{{ errorMessage() }}</div>
      }

      @if (isOwner() && latestFailed(); as failed) {
        <div class="qm-alert" role="alert">
          {{ 'campaignStory.versionFailed' | translate: failed.version }}
          @if (failed.error) {
            <details class="mt-1 text-xs">
              <summary class="cursor-pointer">{{ 'errors.technicalDetails' | translate }}</summary>
              <p class="mt-1 break-words">{{ failed.error }}</p>
            </details>
          }
        </div>
      }

      @if (storyService.isLoading()) {
        <div class="text-center py-12" role="status" [attr.aria-label]="'campaignStory.loading' | translate">
          <span class="qm-spinner qm-spinner-lg qm-spinner-light"></span>
        </div>
      } @else if (displayedVersion(); as version) {
        <!-- How far the story runs, with what can be done about it -->
        <div class="qm-panel !py-3.5 flex flex-wrap items-center gap-x-4 gap-y-3" data-testid="story-status">
          <div class="min-w-0 flex-[1_1_18rem]">
            <p class="text-sm font-semibold">{{ coverText() }}</p>
            <p class="text-[13px] qm-muted mt-0.5">
              @if (changedSessionCount() > 0) {
                {{ 'campaignStory.changedSessions' | translate: changedSessionCount() }}
              } @else {
                {{ 'campaignStory.upToDate' | translate }}
              }
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="qm-btn" (click)="drawerOpen.set(true)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              {{ 'campaignStory.versions' | translate }}
            </button>
            @if (isOwner()) {
              <button
                type="button"
                class="qm-btn"
                [class.qm-btn-ink]="changedSessionCount() > 0"
                [disabled]="isGenerating() || usableSessionCount() === 0"
                (click)="generateStory()"
                data-testid="generate-story"
              >
                @if (isGenerating()) {
                  <span class="qm-spinner" aria-hidden="true"></span>
                  <span>{{ generatingMessage() }}</span>
                } @else if (changedSessionCount() > 0) {
                  <span>{{ 'campaignStory.update' | translate }}</span>
                } @else {
                  <span>{{ 'campaignStory.generate' | translate }}</span>
                }
              </button>
            }
          </div>
        </div>

        <app-campaign-story-view
          class="block"
          [version]="version"
          [isLatest]="version.version === latestCompleted()?.version"
          (backToLatest)="selectedVersion.set(null)"
        />
        <app-campaign-story-podcasts
          class="block"
          [campaignId]="campaignId() ?? ''"
          [storyVersion]="version.version"
          [podcasts]="version.podcasts ?? []"
          [canGenerate]="isOwner()"
          [canDelete]="isOwner()"
          [isGenerating]="isPodcastGenerating()"
          [error]="podcastError()"
          [downloadName]="version.title ?? ''"
          (generate)="generatePodcast(version.version)"
        />
      } @else if (isGenerating()) {
        <div class="qm-panel qm-hero qm-empty" role="status">
          <span class="qm-spinner qm-spinner-lg" aria-hidden="true"></span>
          <p class="qm-empty-text mt-4">{{ generatingMessage() }}</p>
        </div>
      } @else {
        <div class="qm-panel qm-hero qm-empty" data-testid="story-empty">
          <span class="qm-medallion qm-medallion-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></span>
          <h2 class="qm-empty-title">{{ 'campaignStory.emptyTitle' | translate }}</h2>
          @if (sessionCount() === 0) {
            <p class="qm-empty-text">{{ 'campaignStory.emptyNoSessions' | translate }}</p>
            <a [routerLink]="['/campaign', campaignId(), 'sessions', 'new']" class="qm-btn qm-btn-primary qm-btn-lg mt-6">
              {{ 'campaignStory.uploadFirst' | translate }}
            </a>
          } @else if (usableSessionCount() === 0) {
            <p class="qm-empty-text">{{ 'campaignStory.emptyWaiting' | translate }}</p>
            <a [routerLink]="['/campaign', campaignId(), 'sessions']" class="qm-btn qm-btn-lg mt-6">
              {{ 'campaignStory.toSessions' | translate }}
            </a>
          } @else if (isOwner()) {
            <p class="qm-empty-text">{{ 'campaignStory.emptyOwner' | translate: usableSessionCount() }}</p>
            <button type="button" class="qm-btn qm-btn-primary qm-btn-lg mt-6" (click)="generateStory()" data-testid="generate-story">
              {{ 'campaignStory.write' | translate }}
            </button>
          } @else {
            <p class="qm-empty-text">{{ 'campaignStory.emptyMember' | translate }}</p>
            <a [routerLink]="['/campaign', campaignId(), 'sessions']" class="qm-btn qm-btn-lg mt-6">
              {{ 'campaignStory.toSessions' | translate }}
            </a>
          }
        </div>
      }

      <app-campaign-story-versions-drawer
        [open]="drawerOpen()"
        [versions]="storyService.versions()"
        [selectedVersion]="displayedVersion()?.version ?? null"
        (selected)="selectVersion($event)"
        (closed)="drawerOpen.set(false)"
      />
    </div>
  `
})
export class CampaignStoryPageComponent {
  readonly storyService = inject(CampaignStoryService);
  private readonly authService = inject(AuthService);
  private readonly campaignContext = inject(CampaignContextService);
  private readonly sessionState = inject(AudioSessionStateService);
  private readonly i18n = inject(I18nService);
  private readonly formatting = inject(FormattingService);

  /** null = show the newest completed version */
  readonly campaignId = this.campaignContext.selectedCampaignId;
  readonly selectedVersion = signal<number | null>(null);
  readonly drawerOpen = signal(false);
  readonly errorMessage = signal('');
  readonly podcastError = signal('');
  private readonly startingStory = signal(false);
  private readonly startingPodcast = signal(false);

  readonly isOwner = computed(() => {
    const campaign = this.campaignContext.selectedCampaign();
    const uid = this.authService.currentUser()?.uid;
    return !!campaign && !!uid && campaign.ownerId === uid;
  });

  readonly latestCompleted = computed(() => latestCompletedVersion(this.storyService.versions()));

  readonly displayedVersion = computed(() => {
    const selected = this.selectedVersion();
    const versions = this.storyService.versions();
    if (selected !== null) {
      const match = versions.find(version => version.version === selected && version.status === 'completed');
      if (match) return match;
    }
    return this.latestCompleted();
  });

  private readonly activeGeneration = computed(() =>
    this.storyService.versions().find(version =>
      version.status === 'generating' && isActiveGeneration(version.createdAt)
    ) ?? null
  );

  readonly isGenerating = computed(() => this.startingStory() || !!this.activeGeneration());

  /** The step the backend is at, in the active language; "busy" until the version document exists. */
  readonly generatingMessage = computed(() => {
    const active = this.activeGeneration();
    const t = this.i18n.t();
    return active ? storyProgressText(active, t) : t.common.busy;
  });

  /** Shown only when the newest version failed and nothing newer is running. */
  readonly latestFailed = computed(() => {
    const newest = this.storyService.versions()[0];
    return newest?.status === 'failed' ? newest : null;
  });

  readonly sessionCount = computed(() => this.sessionState.sessions().length);
  readonly usableSessionCount = computed(() => this.sessionState.sessions().filter(isUsableSession).length);

  /** The first line of the status: the last play day in the story, else the day it was written. */
  readonly coverText = computed(() => {
    const latest = this.latestCompleted();
    const t = this.i18n.t().campaignStory;
    const day = coveredUntil(latest);
    if (day) return t.coversUntil(this.formatting.formatDay(day));
    return t.updatedOn(this.formatting.formatDate(latest?.createdAt));
  });

  readonly changedSessionCount = computed(() =>
    countChangedSessions(this.latestCompleted(), this.sessionState.sessions())
  );

  readonly isPodcastGenerating = computed(() =>
    this.startingPodcast() ||
    (this.displayedVersion()?.podcasts ?? []).some(podcast =>
      podcast.status !== 'completed' && podcast.status !== 'failed' && isActiveGeneration(podcast.createdAt)
    )
  );

  selectVersion(version: number): void {
    this.selectedVersion.set(version);
    this.drawerOpen.set(false);
  }

  async generateStory(): Promise<void> {
    const campaignId = this.campaignContext.selectedCampaignId();
    if (!campaignId) return;

    this.errorMessage.set('');
    this.selectedVersion.set(null);
    this.startingStory.set(true);
    try {
      await this.storyService.generate(campaignId);
    } catch (error) {
      this.errorMessage.set((error as Error).message);
    } finally {
      this.startingStory.set(false);
    }
  }

  async generatePodcast(storyVersion: number): Promise<void> {
    const campaignId = this.campaignContext.selectedCampaignId();
    if (!campaignId) return;

    this.podcastError.set('');
    this.startingPodcast.set(true);
    try {
      await this.storyService.generatePodcast(campaignId, storyVersion);
    } catch (error) {
      this.podcastError.set((error as Error).message);
    } finally {
      this.startingPodcast.set(false);
    }
  }
}
