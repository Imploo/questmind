import { Injectable, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../../core/firebase.service';
import type { PodcastShareTarget } from './podcast-share.service';

/** Deletes podcasts through the deletePodcast function, which only lets the campaign owner. */
@Injectable({ providedIn: 'root' })
export class PodcastDeleteService {
  private readonly firebase = inject(FirebaseService);

  /**
   * Delete a podcast version with its audio and share links. The list it was in
   * follows by itself: the entry disappears from the document it is listened to on.
   */
  async delete(target: PodcastShareTarget): Promise<void> {
    const deletePodcast = httpsCallable<PodcastShareTarget, { deleted: boolean }>(
      this.firebase.requireFunctions(),
      'deletePodcast'
    );
    await deletePodcast(target);
  }
}
