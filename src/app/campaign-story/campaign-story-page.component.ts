import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { CampaignSelectorComponent } from '../campaign/campaign-selector.component';
import { AudioSessionStateService } from '../audio/services/audio-session-state.service';
import { CampaignStoryService } from './campaign-story.service';
import { CampaignStoryViewComponent } from './campaign-story-view.component';
import { CampaignStoryVersionsDrawerComponent } from './campaign-story-versions-drawer.component';
import { CampaignStoryPodcastsComponent } from './campaign-story-podcasts.component';
import {
  countChangedSessions,
  isActiveGeneration,
  isUsableSession,
  latestCompletedVersion,
} from './campaign-story.utils';

/**
 * Campaign story page (ticket #69): the newest version of the campaign-wide story,
 * older versions in a drawer, and generation of new versions/podcasts for the owner.
 */
@Component({
  selector: 'app-campaign-story-page',
  imports: [
    CampaignSelectorComponent,
    CampaignStoryViewComponent,
    CampaignStoryVersionsDrawerComponent,
    CampaignStoryPodcastsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      <div class="hidden sm:block">
        <app-campaign-selector />
      </div>

      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div class="qm-page-eyebrow">Campaign</div>
          <h1 class="qm-page-title mt-1">Verhaal</h1>
          <p class="qm-page-sub mt-1">Het verhaal van de campagne tot nu toe, samengevat uit alle sessies.</p>
        </div>

        <div class="flex items-center gap-2">
          @if (isOwner()) {
            <button
              type="button"
              class="qm-btn qm-btn-gold"
              [disabled]="isGenerating() || usableSessionCount() === 0"
              (click)="generateStory()"
            >
              @if (isGenerating()) {
                <span class="qm-spinner" aria-hidden="true"></span>
                <span>{{ generatingMessage() }}</span>
              } @else {
                <span>Nieuw verhaal genereren</span>
              }
            </button>
          }
          <button
            type="button"
            class="qm-btn qm-btn-icon !w-10"
            title="Versies"
            aria-label="Versies"
            (click)="drawerOpen.set(true)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </button>
        </div>
      </header>

      @if (isOwner() && changedSessionCount() > 0 && !isGenerating()) {
        <p class="text-sm text-white/85">
          {{ changedSessionCount() }} {{ changedSessionCount() === 1 ? 'nieuwe/gewijzigde sessie' : 'nieuwe/gewijzigde sessies' }}
          sinds de nieuwste versie.
        </p>
      }

      @if (errorMessage()) {
        <div class="qm-alert" role="alert">{{ errorMessage() }}</div>
      }

      @if (isOwner() && latestFailed(); as failed) {
        <div class="qm-alert" role="alert">Versie {{ failed.version }} is mislukt: {{ failed.error || 'onbekende fout' }}</div>
      }

      @if (storyService.isLoading()) {
        <div class="text-center py-12" role="status" aria-label="Verhaal laden">
          <span class="qm-spinner qm-spinner-lg qm-spinner-light"></span>
        </div>
      } @else if (displayedVersion(); as version) {
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
          [isGenerating]="isPodcastGenerating()"
          [error]="podcastError()"
          [downloadName]="version.title || 'campagne-verhaal'"
          (generate)="generatePodcast(version.version)"
        />
      } @else if (!isGenerating()) {
        <div class="qm-panel qm-hero qm-empty">
          <span class="qm-medallion qm-medallion-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></span>
          @if (usableSessionCount() === 0) {
            <p class="qm-empty-text">Nog geen sessieverhalen om samen te vatten.</p>
          } @else if (isOwner()) {
            <p class="qm-empty-text">Nog geen verhaal. Klik op "Nieuw verhaal genereren" om te beginnen.</p>
          } @else {
            <p class="qm-empty-text">De eigenaar van de campagne heeft nog geen verhaal gegenereerd.</p>
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

  readonly generatingMessage = computed(() => this.activeGeneration()?.progressMessage || 'Bezig...');

  /** Shown only when the newest version failed and nothing newer is running. */
  readonly latestFailed = computed(() => {
    const newest = this.storyService.versions()[0];
    return newest?.status === 'failed' ? newest : null;
  });

  readonly usableSessionCount = computed(() => this.sessionState.sessions().filter(isUsableSession).length);

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
