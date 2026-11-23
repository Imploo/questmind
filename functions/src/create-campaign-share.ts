import { randomBytes } from 'node:crypto';
import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { SHARED_CORS } from './config/cors';
import { assertCampaignMember, assertValidId, requireAuthUid } from './utils/access';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { wrapCallable } from './utils/sentry-error-handler';
import { type Language, parseLanguage } from './utils/language';
import { CAMPAIGN_SHARES_COLLECTION, CampaignShare } from './campaign-share/campaign-share.types';

export interface CreateCampaignShareRequest {
  campaignId: string;
  /** The language the sharer has the app in: the link preview is written in it. Dutch when left out. */
  language?: Language;
}

export interface CreateCampaignShareResponse {
  shareId: string;
}

/**
 * Create (or return the existing) public share link for a campaign. Any member may
 * share, as with a podcast; the share id is a random 128-bit token. One link per
 * campaign: a second sharer gets the same link.
 */
export const createCampaignShare = onCall(
  { cors: SHARED_CORS, memory: '256MiB' },
  wrapCallable<CreateCampaignShareRequest, CreateCampaignShareResponse>('createCampaignShare', async (request) => {
    ensureAuthForTesting(request);

    const uid = requireAuthUid(request);
    const campaignId = assertValidId(request.data?.campaignId, 'campaignId');
    const language = parseLanguage(request.data?.language);

    const db = getFirestore();
    await assertCampaignMember(db, campaignId, uid);

    const shares = db.collection(CAMPAIGN_SHARES_COLLECTION);
    const existing = await shares.where('campaignId', '==', campaignId).limit(1).get();
    if (!existing.empty) {
      return { shareId: existing.docs[0].id };
    }

    const share: CampaignShare = {
      campaignId,
      createdBy: uid,
      createdAt: new Date().toISOString(),
      language,
    };
    const shareId = randomBytes(16).toString('base64url');
    await shares.doc(shareId).create(share);
    return { shareId };
  })
);
