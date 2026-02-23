import * as logger from './utils/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { GoogleGenAI } from '@google/genai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { Bucket } from '@google-cloud/storage';
import { SHARED_CORS } from './index';
import { getPodcastScriptPrompt } from './prompts/podcast-script-generator.prompt';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { wrapCallable, captureFunctionError } from './utils/sentry-error-handler';
import { getAiFeatureConfig, getPodcastVoiceConfig } from './utils/ai-settings';
import { AIFeatureConfig, PodcastEntry } from './types/audio-session.types';

const DEFAULT_HOST_VOICES: Record<'host1' | 'host2', string> = {
  host1: process.env.ELEVENLABS_HOST1_VOICE || 'tvFp0BgJPrEXGoDhDIA4', // Thomas
  host2: process.env.ELEVENLABS_HOST2_VOICE || '7qdUFMklKPaaAVMsBTBt', // Roos
};

async function updatePodcastEntry(
  sessionRef: FirebaseFirestore.DocumentReference,
  existingPodcasts: PodcastEntry[],
  version: number,
  data: Partial<PodcastEntry>
) {
  await sessionRef.update({
    podcasts: upsertPodcast(existingPodcasts, { version, ...data }),
    updatedAt: FieldValue.serverTimestamp()
  });
}

interface PodcastSegment {
  speaker: 'host1' | 'host2';
  text: string;
}

interface PodcastScript {
  segments: PodcastSegment[];
  estimatedDuration: number;
}

interface PodcastGenerationRequest {
  campaignId: string;
  sessionId: string;
  version: number;
  story?: string;
  sessionTitle?: string;
  sessionDate?: string;
  script?: PodcastScript;
}

export const generatePodcastAudio = onCall(
  {
    cors: SHARED_CORS,
    secrets: ['GOOGLE_AI_API_KEY', 'ELEVENLABS_API_KEY'],
  },
  wrapCallable<PodcastGenerationRequest, unknown>('generatePodcastAudio', async (request) => {
    ensureAuthForTesting(request);

    const { auth, data } = request;

    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { campaignId, sessionId, version, story, sessionTitle, sessionDate, script } = data;

    if (!campaignId || typeof campaignId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing campaignId.');
    }
    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing sessionId.');
    }
    if (!version || typeof version !== 'number') {
      throw new HttpsError('invalid-argument', 'Missing version.');
    }

    if (!script) {
      if (!story || typeof story !== 'string') {
        throw new HttpsError('invalid-argument', 'Missing story (required for script generation).');
      }
      if (!sessionTitle || typeof sessionTitle !== 'string') {
        throw new HttpsError('invalid-argument', 'Missing sessionTitle (required for script generation).');
      }
    } else {
      if (!Array.isArray(script.segments) || script.segments.length === 0) {
        throw new HttpsError('invalid-argument', 'Invalid script provided.');
      }
    }

    const db = getFirestore();
    const storage = getStorage().bucket();
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
      throw new HttpsError('permission-denied', 'Only the session owner can generate podcasts.');
    }
    const existingPodcasts: PodcastEntry[] = Array.isArray(sessionData.podcasts) ? sessionData.podcasts : [];
    const existingEntry = existingPodcasts.find(podcast => podcast?.version === version);

    const now = new Date();
    const initialPodcastEntry = {
      version,
      createdAt: existingEntry?.createdAt ?? now,
      storyVersion: sessionData.storyRegenerationCount ?? existingEntry?.storyVersion ?? 1,
      status: 'pending' as const,
      progress: 0,
      progressMessage: 'Starting podcast generation...'
    };

    await sessionRef.update({
      podcasts: upsertPodcast(existingPodcasts, initialPodcastEntry),
      latestPodcastVersion: version,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Await so Firebase keeps the function alive until completion
    try {
      await generatePodcastInBackground(
        campaignId,
        sessionId,
        version,
        script,
        story,
        sessionTitle,
        sessionDate,
        sessionRef,
        existingPodcasts,
        auth.uid,
        storage
      );
    } catch (error) {
      captureFunctionError('generatePodcastAudio', error instanceof Error ? error : new Error(String(error)), {
        campaignId, sessionId, version
      });
      // Don't throw — errors are already persisted to Firestore by generatePodcastInBackground
    }

    return {
      success: true,
      message: 'Podcast generation complete'
    };
  })
);

function upsertPodcast(existing: PodcastEntry[], nextEntry: Partial<PodcastEntry> & { version: number }): PodcastEntry[] {
  const index = existing.findIndex(podcast => podcast?.version === nextEntry.version);
  if (index === -1) {
    return [...existing, nextEntry as PodcastEntry];
  }
  const updated = [...existing];
  updated[index] = { ...existing[index], ...nextEntry } as PodcastEntry;
  return updated;
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

async function generatePodcastInBackground(
  campaignId: string,
  sessionId: string,
  version: number,
  script: PodcastScript | undefined,
  story: string | undefined,
  sessionTitle: string | undefined,
  sessionDate: string | undefined,
  sessionRef: FirebaseFirestore.DocumentReference,
  existingPodcasts: PodcastEntry[],
  userId: string,
  storage: Bucket
) {
  try {
    let finalScript: PodcastScript;
    let scriptConfig: AIFeatureConfig | null = null;
    const voiceConfig = await getPodcastVoiceConfig();

    // STEP 1: Generate script if not provided
    if (!script) {
      await ProgressTrackerService.updateProgress(
        campaignId, sessionId, 'generating-podcast-script', 10, 'Generating podcast script...'
      );

      scriptConfig = await getAiFeatureConfig('podcastScript');

      const googleAiKey = process.env.GOOGLE_AI_API_KEY;
      if (!googleAiKey) {
        throw new Error('Google AI API key not configured');
      }

      const googleAi = new GoogleGenAI({ apiKey: googleAiKey });

      const scriptResponse = await googleAi.models.generateContent({
        model: scriptConfig.model,
        contents: [
          {
            role: 'user',
            parts: [{ text: `SESSION TITLE: ${sessionTitle}\nSESSION DATE: ${sessionDate || 'Unknown'}\n\nSESSION STORY:\n${story}` }],
          },
        ],
        config: {
          systemInstruction: getPodcastScriptPrompt(voiceConfig.maxCharacters),
          temperature: scriptConfig.temperature,
          topP: scriptConfig.topP,
          topK: scriptConfig.topK,
          maxOutputTokens: scriptConfig.maxOutputTokens,
        },
      });

      const scriptText = scriptResponse.text;
      if (!scriptText) {
        throw new Error('No script generated by AI');
      }

      finalScript = parseScriptResponse(scriptText);

      if (finalScript.segments.length === 0) {
        throw new Error('Failed to parse script segments');
      }

      const totalCharacters = finalScript.segments.reduce((sum, seg) => sum + seg.text.length, 0);
      logger.debug(`Generated script: ${totalCharacters} characters (limit: ${voiceConfig.maxCharacters})`);

      await updatePodcastEntry(sessionRef, existingPodcasts, version, {
        status: 'script_complete',
        script: finalScript,
        scriptGeneratedAt: new Date(),
        duration: finalScript.estimatedDuration,
        modelUsed: scriptConfig.model
      });

      logger.debug(`Script: ${finalScript.segments.length} segments, ~${finalScript.estimatedDuration}s`);
    } else {
      finalScript = script;
      await updatePodcastEntry(sessionRef, existingPodcasts, version, {
        status: 'script_complete',
        script: finalScript,
        scriptGeneratedAt: new Date(),
        duration: finalScript.estimatedDuration
      });
      logger.debug(`Using provided script: ${finalScript.segments.length} segments`);
    }

    // STEP 2: Generate audio via ElevenLabs text-to-dialogue
    await ProgressTrackerService.updateProgress(
      campaignId, sessionId, 'generating-podcast-audio', 55, 'Generating podcast audio with ElevenLabs...'
    );

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ElevenLabs API key is not configured');
    }

    const hostVoices: Record<'host1' | 'host2', string> = {
      host1: voiceConfig.host1VoiceId || DEFAULT_HOST_VOICES.host1,
      host2: voiceConfig.host2VoiceId || DEFAULT_HOST_VOICES.host2,
    };

    const elevenlabs = new ElevenLabsClient({ apiKey });
    const dialogueInputs = finalScript.segments.map(seg => ({
      text: seg.text,
      voiceId: hostVoices[seg.speaker]
    }));

    logger.debug(`Generating podcast audio via ElevenLabs text-to-dialogue (${finalScript.segments.length} segments)`);

    await ProgressTrackerService.updateProgress(
      campaignId, sessionId, 'generating-podcast-audio', 65, 'Calling ElevenLabs text-to-dialogue API...'
    );

    const audioStream = await elevenlabs.textToDialogue.convert({
      inputs: dialogueInputs,
      modelId: voiceConfig.model || undefined,
    });

    await ProgressTrackerService.updateProgress(
      campaignId, sessionId, 'generating-podcast-audio', 75, 'Receiving audio stream...'
    );

    const chunks: Buffer[] = [];
    const readable = Readable.from(audioStream as AsyncIterable<Uint8Array>);
    for await (const chunk of readable) {
      chunks.push(Buffer.from(chunk));
    }
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      throw new Error('Empty audio buffer from ElevenLabs text-to-dialogue');
    }

    logger.debug(`Generated podcast: ${audioBuffer.length} bytes`);

    // STEP 3: Upload to Firebase Storage
    await ProgressTrackerService.updateProgress(
      campaignId, sessionId, 'generating-podcast-audio', 85, 'Uploading podcast to storage...'
    );

    const storagePath = `campaigns/${campaignId}/podcasts/${sessionId}/v${version}.mp3`;
    const downloadToken = randomUUID();

    const storageFile = storage.file(storagePath);
    await storageFile.save(audioBuffer, {
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
    const fileSize = audioBuffer.length;

    await updatePodcastEntry(sessionRef, existingPodcasts, version, {
      status: 'completed',
      audioUrl: fileUrl,
      fileSize,
      audioGeneratedAt: new Date(),
      modelUsed: scriptConfig?.model,
      error: null
    });

    await ProgressTrackerService.markCompleted(campaignId, sessionId, 'Podcast generation complete');

    logger.debug(`Podcast generation completed: ${fileUrl}`);

  } catch (error: unknown) {
    console.error('Error generating podcast:', error);

    await updatePodcastEntry(sessionRef, existingPodcasts, version, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    await ProgressTrackerService.markFailed(campaignId, sessionId, 'generating-podcast-audio', error instanceof Error ? error : new Error(String(error)));
  }
}
