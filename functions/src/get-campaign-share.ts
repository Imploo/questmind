import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { SHARED_CORS } from './config/cors';
import { wrapCallable } from './utils/sentry-error-handler';
import { loadCampaignShare, loadSharedCampaign } from './campaign-share/load-shared-campaign';
import { SharedCampaign } from './campaign-share/campaign-share.types';

export interface GetCampaignShareRequest {
  shareId: string;
}

/**
 * The read-only view of a shared campaign, for anyone with the link: no sign-in
 * needed. The campaign documents stay members-only; this hands out only what the
 * share page shows (see `SharedCampaign`).
 */
export const getCampaignShare = onCall(
  { cors: SHARED_CORS, memory: '256MiB' },
  wrapCallable<GetCampaignShareRequest, SharedCampaign>('getCampaignShare', async (request) => {
    const shareId = typeof request.data?.shareId === 'string' ? request.data.shareId : '';
    const db = getFirestore();
    const share = await loadCampaignShare(db, shareId);
    const campaign = share ? await loadSharedCampaign(db, share.campaignId) : null;
    if (!campaign) {
      throw new HttpsError('not-found', 'Shared campaign not found.');
    }
    return campaign;
  })
);
