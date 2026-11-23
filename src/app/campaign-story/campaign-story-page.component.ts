import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { AudioSessionStateService } from '../audio/services/audio-session-state.service';
import { CampaignStoryService } from './campaign-story.service';
import { CampaignStoryViewComponent } from './campaign-story-view.component';
import { CampaignStoryVersionsDrawerComponent } from './campaign-story-versions-drawer.component';
import { CampaignStoryPodcastsComponent } from './campaign-story-podcasts.component';
import { CampaignStoryEditSave, CampaignStoryVersion } from './campaign-story.models';
import { CAMPAIGN_STORY_TARGET, StoryEditLockService } from '../shared/services/story-edit-lock.service';
import {
  countChangedSessions,
  coveredUntil,
  isActiveGeneration,
  isUsableSession,
  latestCompletedVersion,
  storyProgressText,
} from './campaign-story.utils';
import { FormattingService } from '../shared/formatting.service';
import { ToastService } from '../shared/services/toast.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/**
 * The story tab of a campaign (ticket #69): how far the story runs, the newest
 * version of the campaign-wide story, older versions in a drawer, and generation of
 * new versions/podcasts for the owner. Every member can edit the newest version
 * by hand. Without a story it says what comes first.
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
  providers: [StoryEditLockService],
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
            @if (canEdit()) {
              <button type="button" class="qm-btn" [disabled]="isEditing() || !!editLock.heldBy()" (click)="startEdit()" data-testid="edit-story">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
                {{ 'campaignStory.edit.button' | translate }}
              </button>
            }
            @if (isOwner()) {
              <button
                type="button"
                class="qm-btn"
                [class.qm-btn-ink]="changedSessionCount() > 0"
                [disabled]="isGenerating() || !canWrite() || isEditing()"
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
          [editing]="isEditing() && version.version === latestCompleted()?.version"
          [saving]="isSaving()"
          [locked]="isGenerating()"
          [changedBy]="changedBy()"
          [lockedBy]="editLock.heldBy()"
          (backToLatest)="selectedVersion.set(null)"
          (saved)="saveEdit(version, $event)"
          (cancelled)="isEditing.set(false)"
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
          @if (isOwner() && kankaLinked() && usableSessionCount() === 0) {
            <p class="qm-empty-text">{{ 'campaignStory.emptyKanka' | translate }}</p>
            <button type="button" class="qm-btn qm-btn-primary qm-btn-lg mt-6" (click)="generateStory()" data-testid="generate-story">
              {{ 'campaignStory.write' | translate }}
            </button>
          } @else if (sessionCount() === 0) {
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
  private readonly toastService = inject(ToastService);
  protected readonly editLock = inject(StoryEditLockService);

  /** null = show the newest completed version */
  readonly campaignId = this.campaignContext.selectedCampaignId;
  readonly selectedVersion = signal<number | null>(null);
  readonly drawerOpen = signal(false);
  readonly errorMessage = signal('');
  readonly podcastError = signal('');
  private readonly startingStory = signal(false);
  private readonly startingPodcast = signal(false);
  /** This member is rewriting the newest version by hand: they hold the lock on the story. */
  readonly isEditing = signal(false);
  readonly isSaving = signal(false);

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

  /**
   * Every member can start editing the newest completed version: that is the one
   * that goes along when the next version is written. Not while a new version is
   * on its way; a form that is already open then stays, with saving held back.
   */
  readonly canEdit = computed(() => {
    const displayed = this.displayedVersion();
    return !this.isGenerating() && !!displayed && displayed.version === this.latestCompleted()?.version;
  });

  /** The member whose edit is on the newest version, when that is someone else. */
  readonly changedBy = computed(() => {
    const latest = this.latestCompleted();
    const uid = this.authService.currentUser()?.uid;
    return latest?.editedBy && latest.editedBy !== uid ? (latest.editedByName ?? '') : '';
  });

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

  /** Kanka is linked: its journals (written reports) are a source too, even without a session story. */
  readonly kankaLinked = computed(() => {
    const settings = this.campaignContext.selectedCampaign()?.settings;
    return settings?.kankaEnabled === true && !!settings.kankaCampaignId;
  });
  readonly canWrite = computed(() => this.usableSessionCount() > 0 || this.kankaLinked());

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

  constructor() {
    // One member edits the campaign story at a time: follow its lock, and give it back when the form closes.
    effect(() => {
      this.editLock.watch(this.campaignId(), CAMPAIGN_STORY_TARGET);
      if (!this.isEditing()) {
        this.editLock.release();
      }
    });
  }

  selectVersion(version: number): void {
    this.selectedVersion.set(version);
    this.drawerOpen.set(false);
    this.isEditing.set(false);
  }

  /** Open the edit form, once this member holds the lock on the story. */
  async startEdit(): Promise<void> {
    if (!this.canEdit()) return;
    this.errorMessage.set('');
    if (await this.takeEditLock()) {
      this.isEditing.set(true);
    }
  }

  /** Take the lock on the story for this member; says why when that does not work. */
  private async takeEditLock(): Promise<boolean> {
    if (await this.editLock.acquire()) return true;
    const texts = this.i18n.t().storyEdit;
    const editor = this.editLock.heldBy();
    this.toastService.show(editor ? texts.lockedBy(editor) : texts.startFailed, 'warning', 6000);
    return false;
  }

  /**
   * Saves the member's edit. The form stays open, with the text in it, when the
   * member no longer holds the lock, when the save fails, or when the story
   * changed in the meantime (the form then offers the choice between both texts).
   */
  async saveEdit(version: CampaignStoryVersion, edit: CampaignStoryEditSave): Promise<void> {
    this.isSaving.set(true);
    try {
      if (!(await this.takeEditLock())) return;
      if (await this.storyService.saveEdit(version, edit)) {
        this.isEditing.set(false);
      }
    } catch {
      // A toast: the form is long, a message at the top of the page would be out of sight.
      this.toastService.show(this.i18n.t().storyEdit.saveFailed, 'error', 6000);
    } finally {
      this.isSaving.set(false);
    }
  }

  async generateStory(): Promise<void> {
    const campaignId = this.campaignContext.selectedCampaignId();
    if (!campaignId) return;

    // Someone else is editing: what they have not saved would not go along.
    const editor = this.editLock.heldBy();
    if (editor && !(await this.toastService.confirm(this.i18n.t().storyEdit.confirmGenerate(editor)))) {
      return;
    }

    this.errorMessage.set('');
    this.selectedVersion.set(null);
    this.isEditing.set(false);
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
