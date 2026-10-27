import { Injectable, inject } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../../core/firebase.service';

/** Which podcast to share: a session podcast or a campaign story podcast. */
export type PodcastShareTarget =
  | { campaignId: string; sessionId: string; podcastVersion: number }
  | { campaignId: string; storyVersion: number; podcastVersion: number };

/** Public share document, as written by the createPodcastShare function. */
export interface PodcastShare {
  title: string;
  subtitle: string;
  audioUrl: string;
  durationSec: number | null;
  createdAt: string;
}

/** Public, auth-free share links for podcasts. */
@Injectable({
  providedIn: 'root'
})
export class PodcastShareService {
  private readonly firebase = inject(FirebaseService);

  /** Create (or reuse) the share for a podcast and return its public URL. */
  async createShareUrl(target: PodcastShareTarget): Promise<string> {
    const createShare = httpsCallable<PodcastShareTarget, { shareId: string }>(
      this.firebase.requireFunctions(),
      'createPodcastShare'
    );
    const { data } = await createShare(target);
    return `${window.location.origin}/share/podcast/${data.shareId}`;
  }

  /** Load a share by id; null when it doesn't exist. */
  async getShare(shareId: string): Promise<PodcastShare | null> {
    const snap = await getDoc(doc(this.firebase.requireFirestore(), 'podcastShares', shareId));
    return snap.exists() ? (snap.data() as PodcastShare) : null;
  }
}
