import { Injectable, computed, effect, inject, resource } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../core/firebase.service';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { CampaignStoryRepositoryFactory } from '../shared/repository/campaign-story.repository';
import { CampaignStoryEdit, CampaignStoryVersion } from './campaign-story.models';
import { countWords } from './campaign-story.utils';
import * as logger from '../shared/logger';
import { ToastService } from '../shared/services/toast.service';
import { callableErrorCode, callableErrorMessage, isPermissionDenied } from '../shared/utils/callable-error';
import { I18nService } from '../core/i18n/i18n.service';

interface CallableResult {
  success: boolean;
  version: number;
}

/**
 * Campaign story versions (ticket #69) for the selected campaign, plus the
 * callables to generate a new version or a podcast for a version.
 */
@Injectable({ providedIn: 'root' })
export class CampaignStoryService {
  private readonly firebase = inject(FirebaseService);
  private readonly authService = inject(AuthService);
  private readonly campaignContext = inject(CampaignContextService);
  private readonly repoFactory = inject(CampaignStoryRepositoryFactory);
  private readonly toastService = inject(ToastService);
  private readonly i18n = inject(I18nService);

  private readonly repo = resource({
    params: () => {
      const user = this.authService.currentUser();
      const campaignId = this.campaignContext.selectedCampaignId();
      if (!user?.uid || !campaignId) return undefined;
      return { campaignId };
    },
    loader: async ({ params }) => {
      const repo = this.repoFactory.create(params.campaignId);
      await repo.waitForData();
      return repo;
    },
  });

  /** All versions, newest first. */
  readonly versions = computed<CampaignStoryVersion[]>(() => {
    const repo = this.repo.value();
    return repo ? (repo.get() as CampaignStoryVersion[]) : [];
  });

  readonly isLoading = computed(() => this.repo.isLoading());

  constructor() {
    effect((onCleanup) => {
      const repo = this.repo.value();
      if (repo) {
        onCleanup(() => repo.destroy());
      }
    });
  }

  /** Starts a new campaign story version. Resolves once the backend is done (or the client times out). */
  async generate(campaignId: string): Promise<void> {
    const callable = httpsCallable<{ campaignId: string }, CallableResult>(
      this.firebase.requireFunctions(),
      'generateCampaignStory'
    );
    await this.invoke(() => callable({ campaignId }), 'campaign story');
  }

  /**
   * Saves what the owner changed by hand in a version. The version is marked as
   * edited: from then on it goes along when a new version is written, so the
   * improvements stay. The Firestore rules allow this for the owner, on the
   * newest completed version only.
   */
  async saveEdit(version: Pick<CampaignStoryVersion, 'id'>, edit: CampaignStoryEdit): Promise<void> {
    const repo = this.repo.value();
    const uid = this.authService.currentUser()?.uid;
    if (!repo || !uid) {
      throw new Error('No campaign story loaded.');
    }
    const content = edit.content.trim();
    try {
      await repo.patch(version.id, {
        title: edit.title.trim(),
        content,
        wordCount: countWords(content),
        editedAt: new Date(),
        editedBy: uid,
      });
    } catch (error) {
      logger.error('Failed to save campaign story edit:', error);
      throw error;
    }
  }

  /** Starts a podcast for a campaign story version, with the regular podcast settings. */
  async generatePodcast(campaignId: string, storyVersion: number): Promise<void> {
    const callable = httpsCallable<{ campaignId: string; storyVersion: number }, CallableResult>(
      this.firebase.requireFunctions(),
      'generateCampaignStoryPodcast'
    );
    await this.invoke(() => callable({ campaignId, storyVersion }), 'campaign story podcast');
  }

  private async invoke(call: () => Promise<unknown>, label: string): Promise<void> {
    try {
      await call();
    } catch (error) {
      const code = callableErrorCode(error);
      // Long generations outlive the client-side callable timeout while the Cloud
      // Function keeps running; real failures are reported via Firestore.
      if (code === 'deadline-exceeded') {
        logger.debug(`${label} callable timed out client-side; generation continues in background`);
        return;
      }
      if (isPermissionDenied(error)) {
        this.toastService.showCallableError(error);
      } else if (code !== 'failed-precondition') {
        logger.error(`Error starting ${label} generation:`, error);
      }
      // Never the server's own message: its reason or code picks a text in the active language.
      const texts = this.i18n.t();
      throw new Error(callableErrorMessage(error, texts.errors, texts.campaignStory.startFailed));
    }
  }
}
