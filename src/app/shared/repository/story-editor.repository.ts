import { inject, Injectable } from '@angular/core';
import { Firestore, QueryConstraint, where } from 'firebase/firestore';
import { FirestoreRepository } from './firestore-repository';
import { FirebaseService } from '../../core/firebase.service';

/**
 * The member who is editing a story right now: the lock on that story. One
 * document per story, taken when the edit form opens, kept fresh while the
 * member is at work and removed when the form closes. A lock that is no longer
 * refreshed has expired and can be taken over (see firestore.rules).
 */
export interface StoryEditor {
  /** The story: see `sessionStoryTarget` and `CAMPAIGN_STORY_TARGET`. Equal to `target`. */
  id: string;
  target: string;
  uid: string;
  name: string;
  /** Server time of the last sign of life */
  updatedAt: unknown;
}

/** The lock on one story of a campaign (`campaigns/{id}/storyEditors/{target}`). */
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
