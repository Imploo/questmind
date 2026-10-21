import { getStorage } from 'firebase-admin/storage';
import * as logger from '../utils/logger';
import { captureException } from '../utils/sentry-error-handler';

/**
 * Campaign voice-intro (ticket #68): a short recording in which everyone at the
 * table introduces themselves (player name + character, and the DM as DM). It is
 * sent along with every transcription call as a voice reference for speaker
 * attribution.
 */
export interface CampaignVoiceIntroSettings {
  storagePath: string;
  mimeType: string;
}

/** Audio reference passed inline to Gemini alongside each session segment. */
export interface VoiceIntroAudio {
  mimeType: string;
  /** Base64-encoded audio bytes. */
  data: string;
}

/**
 * Upper bound for the inline payload. The intro is compressed client-side to
 * ~64 kbps mono (5 min ≈ 2.4 MB), so anything larger is unexpected. Base64 adds
 * a third, so 10 MB raw stays well under Gemini's ~20 MB inline request limit.
 */
const MAX_VOICE_INTRO_BYTES = 10 * 1024 * 1024;

/**
 * Download the campaign's voice-intro from Firebase Storage as inline audio.
 * Never throws: a missing or failing intro must not sink the transcription,
 * so failures are reported to Sentry and `null` is returned.
 */
export async function loadVoiceIntroAudio(
  campaignId: string,
  voiceIntro: CampaignVoiceIntroSettings | undefined
): Promise<VoiceIntroAudio | null> {
  if (!voiceIntro?.storagePath) {
    return null;
  }

  try {
    const [buffer] = await getStorage().bucket().file(voiceIntro.storagePath).download();

    if (buffer.length === 0) {
      throw new Error('Voice intro file is empty');
    }
    if (buffer.length > MAX_VOICE_INTRO_BYTES) {
      throw new Error(
        `Voice intro too large for inline use (${buffer.length} bytes, max ${MAX_VOICE_INTRO_BYTES})`
      );
    }

    return {
      mimeType: voiceIntro.mimeType || 'audio/mpeg',
      data: buffer.toString('base64'),
    };
  } catch (error) {
    logger.warn(
      `[Voice Intro] Could not load voice intro for campaign ${campaignId}, continuing without it`,
      error
    );
    captureException(error instanceof Error ? error : new Error(String(error)), {
      feature: 'voiceIntro',
      campaignId,
      storagePath: voiceIntro.storagePath,
    });
    return null;
  }
}
