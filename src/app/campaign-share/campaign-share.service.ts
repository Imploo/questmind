import { Injectable, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../core/firebase.service';
import type { LanguageCode } from '../core/i18n/language-strategy';
import type { SharedCampaign } from './campaign-share.models';

/** The address of a shared campaign, or of a part of it. */
export function campaignShareUrl(shareId: string): string {
  return `${window.location.origin}/share/campaign/${shareId}`;
}

/** Public, auth-free share links for a whole campaign. */
@Injectable({ providedIn: 'root' })
export class CampaignShareService {
  private readonly firebase = inject(FirebaseService);

  /**
   * Create (or reuse) the share link of a campaign. `language` is the sharer's:
   * the link preview in chat apps is written in it.
   */
  async createShareUrl(campaignId: string, language: LanguageCode): Promise<string> {
    const createShare = httpsCallable<{ campaignId: string; language: LanguageCode }, { shareId: string }>(
      this.firebase.requireFunctions(),
      'createCampaignShare'
    );
    const { data } = await createShare({ campaignId, language });
    return campaignShareUrl(data.shareId);
  }

  /** The shared campaign, as anyone with the link may see it; null when the link does not (or no longer) exist. */
  async getSharedCampaign(shareId: string): Promise<SharedCampaign | null> {
    const getShare = httpsCallable<{ shareId: string }, SharedCampaign>(
      this.firebase.requireFunctions(),
      'getCampaignShare'
    );
    try {
      const { data } = await getShare({ shareId });
      return data;
    } catch (error) {
      if ((error as { code?: string })?.code === 'functions/not-found') return null;
      throw error;
    }
  }
}
