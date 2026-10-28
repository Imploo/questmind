import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { SHARED_CORS } from './config/cors';
import { wrapCallable } from './utils/sentry-error-handler';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { assertCampaignOwner, assertValidId, requireAuthUid } from './utils/access';
import { processSourcesToRecording } from './audio/audio-processing.service';
import { deleteStorageFiles } from './utils/storage-cleanup';

/** Maximum length of the introduction round. */
export const VOICE_INTRO_MAX_DURATION_SEC = 5 * 60;

/** The campaign's voice intro as stored in `settings.voiceIntro` (ticket #68). */
export interface CampaignVoiceIntro {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface ProcessVoiceIntroRequest {
  campaignId: string;
  /** Uploaded source file in the campaign's `voice-intro/source/` folder. */
  sourcePath: string;
}

export function voiceIntroSourcePrefix(campaignId: string): string {
  return `campaigns/${campaignId}/voice-intro/source/`;
}

/**
 * Process an uploaded voice intro with the same pipeline as session audio
 * (ffmpeg: downmix, normalize, encode to 64 kbps mono MP3), set it on the
 * campaign and remove the previous intro. Runs inline: a ≤5 min recording is
 * processed in seconds, so the settings page simply waits for the result.
 */
export const processVoiceIntro = onCall(
  { cors: SHARED_CORS, memory: '1GiB', timeoutSeconds: 300 },
  wrapCallable<ProcessVoiceIntroRequest, CampaignVoiceIntro>(
    'processVoiceIntro',
    async (request) => {
      ensureAuthForTesting(request);
      const uid = requireAuthUid(request);

      const campaignId = assertValidId(request.data?.campaignId, 'campaignId');
      const { sourcePath } = request.data;
      if (typeof sourcePath !== 'string' || !sourcePath) {
        throw new HttpsError('invalid-argument', 'Missing required fields: campaignId, sourcePath');
      }
      if (!sourcePath.startsWith(voiceIntroSourcePrefix(campaignId))) {
        throw new HttpsError('invalid-argument', 'sourcePath does not belong to this campaign');
      }

      // Authorize BEFORE the try/finally: only the owner's own call may clean up
      // the pending upload, so a non-owner can't make us delete it.
      const db = getFirestore();
      const campaign = await assertCampaignOwner(db, campaignId, uid);
      const previous = campaign.settings?.voiceIntro as CampaignVoiceIntro | undefined;
      const campaignRef = db.doc(`campaigns/${campaignId}`);

      try {
        const sourceName = sourcePath.slice(sourcePath.lastIndexOf('/') + 1);
        const fileName = `${sourceName.replace(/\.[^/.]+$/, '')}.mp3`;
        const storagePath = `campaigns/${campaignId}/voice-intro/${fileName}`;
        const { sizeBytes, durationSec } = await processSourcesToRecording([sourcePath], storagePath);

        if (durationSec > VOICE_INTRO_MAX_DURATION_SEC) {
          await deleteStorageFiles([storagePath]);
          throw new HttpsError('invalid-argument', 'The introduction is too long. Keep it under 5 minutes.');
        }

        const voiceIntro: CampaignVoiceIntro = {
          storagePath,
          fileName,
          mimeType: 'audio/mpeg',
          sizeBytes,
          durationSec: Math.round(durationSec),
          uploadedAt: new Date().toISOString(),
          uploadedBy: uid,
        };
        await campaignRef.update({
          'settings.voiceIntro': voiceIntro,
          updatedAt: new Date().toISOString(),
        });

        if (previous?.storagePath && previous.storagePath !== storagePath) {
          await deleteStorageFiles([previous.storagePath]);
        }
        return voiceIntro;
      } finally {
        // The source is only needed for processing — remove it whatever the outcome.
        await deleteStorageFiles([sourcePath]);
      }
    }
  )
);
