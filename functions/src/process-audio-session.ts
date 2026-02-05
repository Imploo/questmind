import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { GoogleGenAI } from '@google/genai';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';

import { SHARED_CORS } from './index';
import { PODCAST_SCRIPT_GENERATOR_PROMPT } from './prompts/podcast-script-generator.prompt';
import { transcribeAudioFile } from './audio/transcription.service';
import { generateStoryFromTranscription } from './story/story-generator.service';
import {
  ProcessAudioSessionRequest,
  AISettings,
  KankaSearchResult,
  CompleteProcessingStatus
} from './types/audio-session.types';

const DEFAULT_HOST_VOICES: Record<'host1' | 'host2', string> = {
  host1: process.env.ELEVENLABS_HOST1_VOICE ?? '',
  host2: process.env.ELEVENLABS_HOST2_VOICE ?? ''
};

interface PodcastSegment {
  speaker: 'host1' | 'host2';
  text: string;
  emotion?: 'neutral' | 'excited' | 'curious' | 'amused';
}

interface PodcastScript {
  segments: PodcastSegment[];
  estimatedDuration: number;
}

type CallableRequest<T> = {
  auth?: { uid?: string };
  data: T;
};

// Helper to update progress
async function updateProgress(
  sessionRef: FirebaseFirestore.DocumentReference,
  status: CompleteProcessingStatus,
  progress: number,
  message: string,
  additionalData: any = {}
) {
  await sessionRef.update({
    completeProcessingStatus: status,
    completeProcessingProgress: progress,
    completeProcessingMessage: message,
    ...additionalData,
    updatedAt: FieldValue.serverTimestamp()
  });
  console.log(`[${progress}%] ${status}: ${message}`);
}

/**
 * Main Cloud Function: Process complete audio session
 *
 * Fire-and-forget pattern:
 * 1. Validates request
 * 2. Initializes progress tracking
 * 3. Returns immediately
 * 4. Processes in background: transcribe → story → script → audio
 */
export const processAudioSession = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY', 'ELEVENLABS_API_KEY'],
    timeoutSeconds: 3600, // 60 minutes for large files
    memory: '2GiB'
  },
  async (request: CallableRequest<ProcessAudioSessionRequest>) => {
    const { auth, data } = request;

    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const {
      campaignId,
      sessionId,
      storageUrl,
      audioFileName,
      audioFileSize,
      sessionTitle,
      sessionDate,
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
    if (!storageUrl || typeof storageUrl !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing storageUrl.');
    }
    if (!sessionTitle || typeof sessionTitle !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing sessionTitle.');
    }

    const googleAiKey = process.env.GOOGLE_AI_API_KEY;
    const elevenlabsKey = process.env.ELEVENLABS_API_KEY;

    if (!googleAiKey) {
      throw new HttpsError('failed-precondition', 'Google AI API key not configured.');
    }
    if (!elevenlabsKey) {
      throw new HttpsError('failed-precondition', 'ElevenLabs API key not configured.');
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
      throw new HttpsError('permission-denied', 'Only the session owner can process audio.');
    }

    // Initialize progress and save storage URL for future retranscription
    await sessionRef.update({
      storageUrl,
      audioFileName,
      audioFileSize,
      completeProcessingStatus: 'loading_context' as CompleteProcessingStatus,
      completeProcessingProgress: 0,
      completeProcessingMessage: 'Starting audio processing...',
      completeProcessingError: null,
      processingStartedAt: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // RETURN IMMEDIATELY - Processing continues in background
    processAudioInBackground(
      campaignId,
      sessionId,
      storageUrl,
      audioFileName,
      sessionTitle,
      sessionDate,
      enableKankaContext,
      userCorrections,
      sessionRef,
      auth.uid
    ).catch(error => {
      console.error('Background processing failed:', error);
    });

    return {
      success: true,
      message: 'Audio processing started'
    };
  }
);

/**
 * Background processing function
 */
async function processAudioInBackground(
  campaignId: string,
  sessionId: string,
  storageUrl: string,
  audioFileName: string,
  sessionTitle: string,
  sessionDate: string | undefined,
  enableKankaContext: boolean | undefined,
  userCorrections: string | undefined,
  sessionRef: FirebaseFirestore.DocumentReference,
  userId: string
) {
  const googleAiKey = process.env.GOOGLE_AI_API_KEY;
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY;

  if (!googleAiKey || !elevenlabsKey) {
    await updateProgress(sessionRef, 'failed', 0, 'API keys not configured', {
      completeProcessingError: 'Required API keys are not configured'
    });
    return;
  }

  const db = getFirestore();
  const storage = getStorage().bucket();
  const googleAi = new GoogleGenAI({ apiKey: googleAiKey });
  const elevenlabs = new ElevenLabsClient({ apiKey: elevenlabsKey });

  try {
    // Fetch current session data for podcast versioning
    const sessionSnap = await sessionRef.get();
    const sessionData = sessionSnap.data() || {};

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

    const podcastConfig = aiSettings.features?.podcastScript || {
      model: aiSettings.defaultModel,
      temperature: 0.9,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192
    };
    const hostVoices = resolveHostVoices(aiSettings);

    console.log(`Using models: transcription=${transcriptionConfig.model}, story=${storyConfig.model}, podcast=${podcastConfig.model}`);

    // Load Kanka context if enabled
    let kankaContext: KankaSearchResult | undefined;
    if (enableKankaContext) {
      await updateProgress(sessionRef, 'loading_context', 3, 'Loading campaign context...');
      kankaContext = await loadKankaContext();
    }

    await updateProgress(sessionRef, 'loading_context', 5, 'Context loaded');

    // STEP 2: Transcribe audio (5-40%)
    await updateProgress(sessionRef, 'transcribing', 5, 'Transcribing audio...');

    const { transcriptionText, timestamps } = await transcribeAudioFile(
      storageUrl,
      audioFileName,
      transcriptionConfig,
      kankaContext
    );

    // CHECKPOINT: Save transcription
    await updateProgress(
      sessionRef,
      'transcription_complete',
      40,
      'Transcription complete',
      {
        transcription: transcriptionText,
        modelsUsed: {
          transcription: transcriptionConfig.model
        }
      }
    );

    console.log(`Transcription complete: ${timestamps.length} segments`);

    // STEP 3: Generate story (40-60%)
    await updateProgress(sessionRef, 'generating_story', 45, `Generating story with ${storyConfig.model}...`);

    const storyContent = await generateStoryFromTranscription(
      transcriptionText,
      storyConfig,
      kankaContext,
      userCorrections
    );

    // CHECKPOINT: Save story
    await updateProgress(
      sessionRef,
      'story_complete',
      60,
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

    // STEP 4: Generate podcast script (60-75%)
    await updateProgress(sessionRef, 'generating_script', 65, `Generating podcast script with ${podcastConfig.model}...`);

    const scriptPrompt = `${PODCAST_SCRIPT_GENERATOR_PROMPT}\n\nSESSION TITLE: ${sessionTitle}\nSESSION DATE: ${
      sessionDate || 'Unknown'
    }\n\nSESSION STORY:\n${storyContent}\n\nGenereer een podcast script met natuurlijke dialoog tussen HOST1 (man) en HOST2 (vrouw).`;

    const scriptResponse = await googleAi.models.generateContent({
      model: podcastConfig.model,
      contents: [{ role: 'user', parts: [{ text: scriptPrompt }] }],
      config: {
        temperature: podcastConfig.temperature,
        topP: podcastConfig.topP,
        topK: podcastConfig.topK,
        maxOutputTokens: podcastConfig.maxOutputTokens
      }
    });

    if (!scriptResponse.text) {
      throw new Error('No script generated by AI');
    }

    const podcastScript = parseScriptResponse(scriptResponse.text);

    if (podcastScript.segments.length === 0) {
      throw new Error('Failed to parse script segments');
    }

    // Validate character limit
    const totalCharacters = podcastScript.segments.reduce((sum, seg) => sum + seg.text.length, 0);
    console.log(`Generated script: ${totalCharacters} characters (limit: 5000)`);

    if (totalCharacters > 5000) {
      throw new Error(
        `Script too long (${totalCharacters} chars). Maximum is 5000. Try a shorter story.`
      );
    }

    // CHECKPOINT: Save script
    const version = (sessionData.latestPodcastVersion || 0) + 1;
    const existingPodcasts = Array.isArray(sessionData.podcasts) ? sessionData.podcasts : [];

    await updateProgress(
      sessionRef,
      'script_complete',
      75,
      'Podcast script complete',
      {
        podcasts: upsertPodcast(existingPodcasts, {
          version,
          createdAt: new Date(),
          storyVersion: sessionData.storyRegenerationCount || 1,
          status: 'script_complete',
          progress: 75,
          progressMessage: 'Script generated',
          script: podcastScript,
          scriptGeneratedAt: new Date(),
          duration: podcastScript.estimatedDuration,
          modelUsed: podcastConfig.model
        }),
        latestPodcastVersion: version,
        modelsUsed: {
          transcription: transcriptionConfig.model,
          storyGeneration: storyConfig.model,
          podcastScript: podcastConfig.model
        }
      }
    );

    console.log(`Script: ${podcastScript.segments.length} segments, ~${podcastScript.estimatedDuration}s`);

    // STEP 5: Generate audio (75-90%)
    await updateProgress(sessionRef, 'generating_audio', 80, 'Generating audio with ElevenLabs...');

    const dialogueInputs = podcastScript.segments.map(seg => ({
      text: seg.text,
      voiceId: hostVoices[seg.speaker as 'host1' | 'host2'] || hostVoices.host1
    }));

    const audioStream = await elevenlabs.textToDialogue.convert({
      inputs: dialogueInputs
    });

    await updateProgress(sessionRef, 'generating_audio', 85, 'Receiving audio stream...');

    const chunks_audio: Buffer[] = [];
    const readable = Readable.from(audioStream as any);

    for await (const chunk of readable) {
      chunks_audio.push(Buffer.from(chunk));
    }

    const audioBuffer = Buffer.concat(chunks_audio);

    if (audioBuffer.length === 0) {
      throw new Error('Empty audio buffer from text-to-dialogue');
    }

    console.log(`Generated podcast: ${audioBuffer.length} bytes`);

    // STEP 6: Upload to storage (90-100%)
    await updateProgress(sessionRef, 'uploading', 90, 'Uploading podcast to storage...');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
    const outputPath = path.join(tempDir, `podcast-${sessionId}-v${version}.mp3`);
    fs.writeFileSync(outputPath, audioBuffer);

    const storagePath = `campaigns/${campaignId}/podcasts/${sessionId}/v${version}.mp3`;
    const downloadToken = randomUUID();

    await storage.upload(outputPath, {
      destination: storagePath,
      metadata: {
        contentType: 'audio/mpeg',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          sessionId,
          campaignId,
          version: version.toString(),
          userId
        }
      }
    });

    const encodedPath = encodeURIComponent(storagePath);
    const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${storage.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    const fileSize = fs.statSync(outputPath).size;

    // Cleanup temp podcast file
    safeUnlink(outputPath);
    safeRemoveDir(tempDir);

    // FINAL: Mark as completed
    const processingStartTime = sessionData.processingStartedAt
      ? new Date(sessionData.processingStartedAt).getTime()
      : Date.now();
    const processingDurationMs = Date.now() - processingStartTime;

    await updateProgress(
      sessionRef,
      'completed',
      100,
      'Processing complete!',
      {
        podcasts: upsertPodcast(existingPodcasts, {
          version,
          status: 'completed',
          progress: 100,
          progressMessage: 'Podcast ready!',
          audioUrl: fileUrl,
          fileSize,
          audioGeneratedAt: new Date(),
          error: null
        }),
        processingCompletedAt: new Date().toISOString(),
        processingDurationMs,
        modelsUsed: {
          transcription: transcriptionConfig.model,
          storyGeneration: storyConfig.model,
          podcastScript: podcastConfig.model
        }
      }
    );

    console.log(`Complete processing finished in ${(processingDurationMs / 1000).toFixed(1)}s`);

  } catch (error: any) {
    console.error('Error processing audio:', error);

    await updateProgress(
      sessionRef,
      'failed',
      0,
      'Processing failed',
      {
        completeProcessingError: error?.message || 'Unknown error'
      }
    );
  }
}

// Helper functions

async function loadKankaContext(): Promise<KankaSearchResult> {
  // This would load from Kanka integration - simplified for now
  // In real implementation, this would call Kanka API or load from cache
  return {};
}


function parseScriptResponse(text: string): PodcastScript {
  const segments: PodcastSegment[] = [];
  const lines = text.split('\n').filter(line => line.trim());

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('HOST1:')) {
      segments.push({
        speaker: 'host1',
        text: trimmedLine.replace('HOST1:', '').trim()
      });
    } else if (trimmedLine.startsWith('HOST2:')) {
      segments.push({
        speaker: 'host2',
        text: trimmedLine.replace('HOST2:', '').trim()
      });
    }
  }

  const totalWords = segments.reduce((sum, seg) => sum + seg.text.split(/\s+/).length, 0);
  const estimatedDuration = Math.ceil((totalWords / 150) * 60);

  return { segments, estimatedDuration };
}

function upsertPodcast(existing: any[], nextEntry: any): any[] {
  const index = existing.findIndex(podcast => podcast?.version === nextEntry.version);
  if (index === -1) {
    return [...existing, nextEntry];
  }
  const updated = [...existing];
  updated[index] = { ...existing[index], ...nextEntry };
  return updated;
}

function resolveHostVoices(settings: AISettings): Record<'host1' | 'host2', string> {
  const configured = settings.features?.podcastVoices;
  const host1 = configured?.host1VoiceId?.trim() || DEFAULT_HOST_VOICES.host1;
  const host2 = configured?.host2VoiceId?.trim() || DEFAULT_HOST_VOICES.host2;

  if (!host1 || !host2) {
    throw new Error(
      'Podcast voice settings are missing. Configure them in Admin or set ELEVENLABS_HOST1_VOICE and ELEVENLABS_HOST2_VOICE.'
    );
  }

  return { host1, host2 };
}

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn('Failed to delete temp file:', filePath, error);
  }
}

function safeRemoveDir(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn('Failed to delete temp dir:', dirPath, error);
  }
}
