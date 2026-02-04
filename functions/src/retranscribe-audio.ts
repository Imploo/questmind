import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { transcribeAudioFile } from './audio/transcription.service';
import { generateStoryFromTranscription } from './story/story-generator.service';
import { AISettings, KankaSearchResult } from './types/audio-session.types';

export interface RetranscribeAudioRequest {
  campaignId: string;
  sessionId: string;
  enableKankaContext?: boolean;
  userCorrections?: string;
  regenerateStoryAfterTranscription?: boolean; // Default: true
}

export type RetranscribeStatus =
  | 'loading_context'
  | 'transcribing'
  | 'transcription_complete'
  | 'generating_story'
  | 'story_complete'
  | 'completed'
  | 'failed';

type CallableRequest<T> = {
  auth?: { uid?: string };
  data: T;
};

// Helper to update progress
async function updateProgress(
  sessionRef: FirebaseFirestore.DocumentReference,
  status: RetranscribeStatus,
  progress: number,
  message: string,
  additionalData: any = {}
) {
  await sessionRef.update({
    retranscribeStatus: status,
    retranscribeProgress: progress,
    retranscribeMessage: message,
    ...additionalData,
    updatedAt: FieldValue.serverTimestamp()
  });
  console.log(`[Retranscribe ${progress}%] ${status}: ${message}`);
}

/**
 * Cloud Function: Retranscribe audio from existing session
 *
 * Fire-and-forget pattern:
 * 1. Validates request
 * 2. Initializes progress tracking
 * 3. Returns immediately
 * 4. Processes in background: transcribe → optionally regenerate story
 */
export const retranscribeAudio = onCall(
  {
    cors: [
      'https://questmind.nl',
      'http://localhost:4200',
      /^https:\/\/.*\.web\.app$/,
      /^https:\/\/.*\.firebaseapp\.com$/
    ],
    secrets: ['GOOGLE_AI_API_KEY'],
    timeoutSeconds: 900, // 15 minutes
    memory: '2GiB'
  },
  async (request: CallableRequest<RetranscribeAudioRequest>) => {
    const { auth, data } = request;

    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const {
      campaignId,
      sessionId,
      enableKankaContext,
      userCorrections,
      regenerateStoryAfterTranscription = true
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
      throw new HttpsError('permission-denied', 'Only the session owner can retranscribe audio.');
    }

    if (!sessionData.audioStorageUrl) {
      throw new HttpsError('failed-precondition', 'No audio file found for this session.');
    }

    // Initialize progress
    await sessionRef.update({
      retranscribeStatus: 'loading_context' as RetranscribeStatus,
      retranscribeProgress: 0,
      retranscribeMessage: 'Starting retranscription...',
      retranscribeError: null,
      retranscribeStartedAt: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // RETURN IMMEDIATELY - Processing continues in background
    retranscribeInBackground(
      campaignId,
      sessionId,
      sessionData.audioStorageUrl,
      sessionData.audioFileName || 'audio.wav',
      sessionData.sessionTitle || 'Untitled Session',
      sessionData.sessionDate,
      enableKankaContext,
      userCorrections,
      regenerateStoryAfterTranscription,
      sessionRef
    ).catch(error => {
      console.error('Background retranscription failed:', error);
    });

    return {
      success: true,
      message: 'Retranscription started'
    };
  }
);

/**
 * Background processing function for retranscription
 */
async function retranscribeInBackground(
  campaignId: string,
  sessionId: string,
  audioStorageUrl: string,
  audioFileName: string,
  sessionTitle: string,
  sessionDate: string | undefined,
  enableKankaContext: boolean | undefined,
  userCorrections: string | undefined,
  regenerateStoryAfterTranscription: boolean,
  sessionRef: FirebaseFirestore.DocumentReference
) {
  const db = getFirestore();

  try {
    // STEP 1: Load AI settings and context (0-5%)
    await updateProgress(sessionRef, 'loading_context', 1, 'Loading AI settings...');

    const settingsSnap = await db.doc('settings/ai').get();
    const aiSettings = settingsSnap.data() as AISettings | undefined;

    if (!aiSettings) {
      throw new Error('AI settings not configured in database');
    }

    // Get feature-specific configs or fall back to defaults
    const transcriptionConfig = aiSettings.features?.transcription || {
      model: aiSettings.defaultModel,
      temperature: 0.3,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 128000
    };

    const storyConfig = aiSettings.features?.storyGeneration || {
      model: aiSettings.defaultModel,
      temperature: 0.8,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 32000
    };

    console.log(`Using models: transcription=${transcriptionConfig.model}, story=${storyConfig.model}`);

    // Load Kanka context if enabled
    let kankaContext: KankaSearchResult | undefined;
    if (enableKankaContext) {
      await updateProgress(sessionRef, 'loading_context', 3, 'Loading campaign context...');
      kankaContext = await loadKankaContext(db, campaignId);
    }

    await updateProgress(sessionRef, 'loading_context', 5, 'Context loaded');

    // STEP 2: Transcribe audio (5-80%)
    await updateProgress(sessionRef, 'transcribing', 5, 'Transcribing audio...');

    const { transcriptionText, timestamps } = await transcribeAudioFile(
      audioStorageUrl,
      audioFileName,
      transcriptionConfig,
      kankaContext
    );

    // CHECKPOINT: Save transcription
    const transcriptionId = `retranscription_${Date.now()}`;

    await updateProgress(
      sessionRef,
      'transcription_complete',
      80,
      'Transcription complete',
      {
        transcription: transcriptionText,
        activeTranscriptionId: transcriptionId,
        modelsUsed: {
          transcription: transcriptionConfig.model
        }
      }
    );

    console.log(`Retranscription complete: ${timestamps.length} segments`);

    // STEP 3: Generate story if requested (80-95%)
    if (regenerateStoryAfterTranscription) {
      await updateProgress(sessionRef, 'generating_story', 85, `Generating story with ${storyConfig.model}...`);

      const storyContent = await generateStoryFromTranscription(
        transcriptionText,
        sessionTitle,
        sessionDate,
        storyConfig,
        kankaContext,
        userCorrections
      );

      // CHECKPOINT: Save story
      await updateProgress(
        sessionRef,
        'story_complete',
        95,
        'Story generation complete',
        {
          content: storyContent,
          storyRegeneratedAt: new Date().toISOString(),
          storyRegenerationCount: FieldValue.increment(1),
          modelsUsed: {
            transcription: transcriptionConfig.model,
            storyGeneration: storyConfig.model
          }
        }
      );

      console.log(`Story generated: ${storyContent.length} characters`);
    }

    // FINAL: Mark as completed
    await updateProgress(
      sessionRef,
      'completed',
      100,
      regenerateStoryAfterTranscription
        ? 'Retranscription and story generation complete!'
        : 'Retranscription complete!',
      {
        retranscribeCompletedAt: new Date().toISOString()
      }
    );

  } catch (error: any) {
    console.error('Error retranscribing audio:', error);

    await updateProgress(
      sessionRef,
      'failed',
      0,
      'Retranscription failed',
      {
        retranscribeError: error?.message || 'Unknown error'
      }
    );
  }
}

// Helper function
async function loadKankaContext(db: FirebaseFirestore.Firestore, campaignId: string): Promise<KankaSearchResult> {
  // This would load from Kanka integration - simplified for now
  // In real implementation, this would call Kanka API or load from cache
  return {};
}
