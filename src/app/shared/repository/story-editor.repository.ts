import { inject, Injectable } from '@angular/core';
import { Firestore, QueryConstraint, where } from 'firebase/firestore';
import { FirestoreRepository } from './firestore-repository';
import { FirebaseService } from '../../core/firebase.service';

/**
 * Someone who has a story open for editing right now. One small document per
 * member and story, kept fresh while the edit form is open and removed when it
 * closes; a document that is no longer refreshed counts as gone.
 */
export interface StoryEditor {
  /** `${target}_${uid}` */
  id: string;
  /** Which story: see `sessionStoryTarget` and `CAMPAIGN_STORY_TARGET` */
  target: string;
  uid: string;
  name: string;
  /** Server time of the last sign of life */
  updatedAt: unknown;
}

/** The members editing one story of a campaign (`campaigns/{id}/storyEditors`). */
export class StoryEditorRepository extends FirestoreRepository<StoryEditor & Record<string, unknown>, 'id'> {
  constructor(firestore: Firestore, campaignId: string, private readonly target: string) {
    super(firestore, `campaigns/${campaignId}/storyEditors`, 'id');
  }

  protected override getConstraints(): QueryConstraint[] {
    return [where('target', '==', this.target)];
  }
}

@Injectable({ providedIn: 'root' })
export class StoryEditorRepositoryFactory {
  private readonly firestore = inject(FirebaseService).requireFirestore();

  create(campaignId: string, target: string): StoryEditorRepository {
    return new StoryEditorRepository(this.firestore, campaignId, target);
  }
}
