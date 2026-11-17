import { Injectable, inject } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../../core/firebase.service';
import type { LanguageCode } from '../../core/i18n/language-strategy';

/** Which podcast to share: a session podcast or a campaign story podcast. */
export type PodcastShareTarget =
  | { campaignId: string; sessionId: string; podcastVersion: number }
  | { campaignId: string; storyVersion: number; podcastVersion: number };

/** What createPodcastShare gets: the podcast, and the language for the link preview. */
type CreatePodcastShareRequest = PodcastShareTarget & { language: LanguageCode };

/** Public share document, as written by the createPodcastShare function. */
export interface PodcastShare {
  title: string;
  subtitle: string;
  audioUrl: string;
  durationSec: number | null;
  createdAt: string;
  /** Language of the link preview: that of whoever shared first. Absent on older shares (Dutch). */
  language?: LanguageCode;
}

/** Public, auth-free share links for podcasts. */
@Injectable({
  providedIn: 'root'
})
export class PodcastShareService {
  private readonly firebase = inject(FirebaseService);

  /**
   * Create (or reuse) the share for a podcast and return its public URL.
   * `language` is the sharer's: the link preview is written in it.
   */
  async createShareUrl(target: PodcastShareTarget, language: LanguageCode): Promise<string> {
    const createShare = httpsCallable<CreatePodcastShareRequest, { shareId: string }>(
      this.firebase.requireFunctions(),
      'createPodcastShare'
    );
    const { data } = await createShare({ ...target, language });
    return `${window.location.origin}/share/podcast/${data.shareId}`;
  }

  /** Load a share by id; null when it doesn't exist. */
  async getShare(shareId: string): Promise<PodcastShare | null> {
    const snap = await getDoc(doc(this.firebase.requireFirestore(), 'podcastShares', shareId));
    return snap.exists() ? (snap.data() as PodcastShare) : null;
  }
}
