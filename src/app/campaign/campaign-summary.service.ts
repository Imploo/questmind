import { Injectable, inject } from '@angular/core';
import { collection, getCountFromServer, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { FirebaseService } from '../core/firebase.service';

/** What a campaign card shows of the campaign's sessions. */
export interface CampaignSummary {
  sessionCount: number;
  /** The latest play day (`2026-11-20`), or null when no session has a date. */
  lastPlayed: string | null;
  /** Sessions still being uploaded or processed. */
  processingCount: number;
}

/**
 * Counts for the campaign list. Three small queries per campaign, so the list does
 * not have to load the sessions (and their transcripts) of every campaign.
 */
@Injectable({ providedIn: 'root' })
export class CampaignSummaryService {
  private readonly firebase = inject(FirebaseService);

  async summary(campaignId: string): Promise<CampaignSummary> {
    const sessions = collection(this.firebase.requireFirestore(), 'campaigns', campaignId, 'audioSessions');

    const [count, latest, processing] = await Promise.all([
      getCountFromServer(sessions),
      getDocs(query(sessions, orderBy('sessionDate', 'desc'), limit(1))),
      getCountFromServer(query(sessions, where('status', 'in', ['uploading', 'processing']))),
    ]);

    const lastPlayed = latest.docs[0]?.get('sessionDate');
    return {
      sessionCount: count.data().count,
      lastPlayed: typeof lastPlayed === 'string' && lastPlayed ? lastPlayed : null,
      processingCount: processing.data().count,
    };
  }
}
