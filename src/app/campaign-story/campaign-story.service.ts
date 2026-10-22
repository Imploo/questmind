import { Injectable, computed, effect, inject, resource } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../core/firebase.service';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { CampaignStoryRepositoryFactory } from '../shared/repository/campaign-story.repository';
import { CampaignStoryVersion } from './campaign-story.models';
import * as logger from '../shared/logger';

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
      const code = (error as { code?: string })?.code;
      // Long generations outlive the client-side callable timeout while the Cloud
      // Function keeps running; real failures are reported via Firestore.
      if (code === 'functions/deadline-exceeded') {
        logger.debug(`${label} callable timed out client-side; generation continues in background`);
        return;
      }
      if (code === 'functions/failed-precondition') {
        throw new Error((error as Error).message);
      }
      logger.error(`Error starting ${label} generation:`, error);
      throw new Error('Genereren kon niet gestart worden. Probeer het opnieuw.');
    }
  }
}
