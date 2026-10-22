import { inject, Injectable } from '@angular/core';
import { Firestore, QueryConstraint, orderBy } from 'firebase/firestore';
import { FirestoreRepository } from './firestore-repository';
import { CampaignStoryVersion } from '../../campaign-story/campaign-story.models';
import { FirebaseService } from '../../core/firebase.service';

/** Read-only in practice: campaign story versions are written by the backend (ticket #69). */
export class CampaignStoryRepository extends FirestoreRepository<CampaignStoryVersion & Record<string, unknown>, 'id'> {
  constructor(firestore: Firestore, campaignId: string) {
    super(firestore, `campaigns/${campaignId}/campaignStories`, 'id');
  }

  protected override getConstraints(): QueryConstraint[] {
    return [orderBy('version', 'desc')];
  }
}

@Injectable({ providedIn: 'root' })
export class CampaignStoryRepositoryFactory {
  private readonly firestore = inject(FirebaseService).requireFirestore();

  create(campaignId: string): CampaignStoryRepository {
    return new CampaignStoryRepository(this.firestore, campaignId);
  }
}
