import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { SHARED_CORS } from './index';
import { generateStoryFromTranscription } from './story/story-generator.service';
import { AISettings, KankaSearchResult } from './types/audio-session.types';

export interface RegenerateStoryRequest {
  campaignId: string;
  sessionId: string;
  enableKankaContext?: boolean;
  userCorrections?: string;
}

export type RegenerateStoryStatus =
  | 'loading_context'
  | 'generating_story'
  | 'completed'
  | 'failed';

type CallableRequest<T> = {
  auth?: { uid?: string };
  data: T;
};

// Helper to update progress
async function updateProgress(
  sessionRef: FirebaseFirestore.DocumentReference,
  status: RegenerateStoryStatus,
  progress: number,
  message: string,
  additionalData: any = {}
) {
  await sessionRef.update({
    regenerateStoryStatus: status,
    regenerateStoryProgress: progress,
    regenerateStoryMessage: message,
    ...additionalData,
    updatedAt: FieldValue.serverTimestamp()
  });
  console.log(`[RegenerateStory ${progress}%] ${status}: ${message}`);
}

/**
 * Cloud Function: Regenerate story from existing transcription
 *
 * Fire-and-forget pattern:
 * 1. Validates request
 * 2. Initializes progress tracking
 * 3. Returns immediately
 * 4. Processes in background: generate story
 */
export const regenerateStory = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY'],
    timeoutSeconds: 600, // 10 minutes
    memory: '1GiB'
  },
  async (request: CallableRequest<RegenerateStoryRequest>) => {
    const { auth, data } = request;

    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const {
      campaignId,
      sessionId,
      enableKankaContext,
      userCorrections
    } = data;

    // Validations
    if (!campaignId || typeof campaignId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing campaignId.');
    }
    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing sessionId.');
    }

    const googleAiKey = process.env.GOOGLE_AI_API_KEY;
    if (!googleAiKey) {
      throw new HttpsError('failed-precondition', 'Google AI API key not configured.');
    }

    const db = getFirestore();
    const campaignRef = db.doc(`campaigns/${campaignId}`);
    const campaignSnap = await campaignRef.get();

    if (!campaignSnap.exists) {
      throw new HttpsError('not-found', 'Campaign not found.');
    }

    const campaignData = campaignSnap.data() || {};
    if (!campaignData.members || !campaignData.members[auth.uid]) {
      throw new HttpsError('permission-denied', 'User is not a campaign member.');
    }

    const sessionRef = db.doc(`campaigns/${campaignId}/audioSessions/${sessionId}`);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      throw new HttpsError('not-found', 'Session not found.');
    }

    const sessionData = sessionSnap.data() || {};
    if (sessionData.ownerId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Only the session owner can regenerate story.');
    }

    if (!sessionData.transcription) {
      throw new HttpsError('failed-precondition', 'No transcription found for this session.');
    }

    // Initialize progress
    await sessionRef.update({
      regenerateStoryStatus: 'loading_context' as RegenerateStoryStatus,
      regenerateStoryProgress: 0,
      regenerateStoryMessage: 'Starting story regeneration...',
      regenerateStoryError: null,
      regenerateStoryStartedAt: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // RETURN IMMEDIATELY - Processing continues in background
    regenerateStoryInBackground(
      sessionData.transcription,
      enableKankaContext,
      userCorrections,
      sessionRef
    ).catch(error => {
      console.error('Background story regeneration failed:', error);
    });

    return {
      success: true,
      message: 'Story regeneration started'
    };
  }
);

/**
 * Background processing function for story regeneration
 */
async function regenerateStoryInBackground(
  transcription: string,
  enableKankaContext: boolean | undefined,
  userCorrections: string | undefined,
  sessionRef: FirebaseFirestore.DocumentReference
) {
  const db = getFirestore();

  try {
    // STEP 1: Load AI settings and context (0-10%)
    await updateProgress(sessionRef, 'loading_context', 1, 'Loading AI settings...');

    const settingsSnap = await db.doc('settings/ai').get();
    const aiSettings = settingsSnap.data() as AISettings | undefined;

    if (!aiSettings) {
      throw new Error('AI settings not configured in database');
    }

    // Get feature-specific config or fall back to defaults
    const storyConfig = aiSettings.features?.storyGeneration || {
      model: aiSettings.defaultModel,
      temperature: 0.8,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 32000
    };

    console.log(`Using model: story=${storyConfig.model}`);

    // Load Kanka context if enabled
    let kankaContext: KankaSearchResult | undefined;
    if (enableKankaContext) {
      await updateProgress(sessionRef, 'loading_context', 5, 'Loading campaign context...');
      kankaContext = await loadKankaContext();
    }

    await updateProgress(sessionRef, 'loading_context', 10, 'Context loaded');

    // STEP 2: Generate story (10-90%)
    await updateProgress(sessionRef, 'generating_story', 15, `Generating story with ${storyConfig.model}...`);

    const storyContent = await generateStoryFromTranscription(
      transcription,
      storyConfig,
      kankaContext,
      userCorrections
    );

    // FINAL: Save story and mark as completed
    await updateProgress(
      sessionRef,
      'completed',
      100,
      'Story regeneration complete!',
      {
        content: storyContent,
        storyRegeneratedAt: new Date().toISOString(),
        storyRegenerationCount: FieldValue.increment(1),
        regenerateStoryCompletedAt: new Date().toISOString(),
        modelsUsed: {
          storyGeneration: storyConfig.model
        }
      }
    );

    console.log(`Story generated: ${storyContent.length} characters`);

  } catch (error: any) {
    console.error('Error regenerating story:', error);

    await updateProgress(
      sessionRef,
      'failed',
      0,
      'Story regeneration failed',
      {
        regenerateStoryError: error?.message || 'Unknown error'
      }
    );
  }
}

// Helper function
async function loadKankaContext(): Promise<KankaSearchResult> {
  // This would load from Kanka integration - simplified for now
  // In real implementation, this would call Kanka API or load from cache
  return {};
}
