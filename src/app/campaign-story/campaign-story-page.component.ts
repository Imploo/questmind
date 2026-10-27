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
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="hidden sm:block">
        <app-campaign-selector />
      </div>

      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold m-0">📖 Verhaal</h1>
          <p class="text-gray-600 m-0 mt-2">Het verhaal van de campagne tot nu toe, samengevat uit alle sessies.</p>
        </div>

        <div class="flex items-center gap-2">
          @if (isOwner()) {
            <button
              type="button"
              class="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              [disabled]="isGenerating() || usableSessionCount() === 0"
              (click)="generateStory()"
            >
              @if (isGenerating()) {
                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <span>{{ generatingMessage() }}</span>
              } @else {
                <span>Nieuw verhaal genereren</span>
              }
            </button>
          }
          <button
            type="button"
            class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            title="Versies"
            aria-label="Versies"
            (click)="drawerOpen.set(true)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </button>
        </div>
      </div>

      @if (isOwner() && changedSessionCount() > 0 && !isGenerating()) {
        <p class="text-sm text-gray-500 m-0">
          {{ changedSessionCount() }} {{ changedSessionCount() === 1 ? 'nieuwe/gewijzigde sessie' : 'nieuwe/gewijzigde sessies' }}
          sinds de nieuwste versie.
        </p>
      }

      @if (errorMessage()) {
        <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p class="text-sm text-red-700 m-0">{{ errorMessage() }}</p>
        </div>
      }

      @if (isOwner() && latestFailed(); as failed) {
        <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p class="text-sm text-red-700 m-0">Versie {{ failed.version }} is mislukt: {{ failed.error || 'onbekende fout' }}</p>
        </div>
      }

      @if (storyService.isLoading()) {
        <div class="text-center py-12">
          <div class="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
        </div>
      } @else if (displayedVersion(); as version) {
        <app-campaign-story-view
          [version]="version"
          [isLatest]="version.version === latestCompleted()?.version"
          (backToLatest)="selectedVersion.set(null)"
        />
        <app-campaign-story-podcasts
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
        <div class="text-center py-12 bg-gray-50 rounded-lg">
          <div class="text-5xl mb-4">📖</div>
          @if (usableSessionCount() === 0) {
            <p class="text-gray-600 m-0">Nog geen sessieverhalen om samen te vatten.</p>
          } @else if (isOwner()) {
            <p class="text-gray-600 m-0">Nog geen verhaal. Klik op "Nieuw verhaal genereren" om te beginnen.</p>
          } @else {
            <p class="text-gray-600 m-0">De eigenaar van de campagne heeft nog geen verhaal gegenereerd.</p>
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
