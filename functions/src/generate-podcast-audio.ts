import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { PODCAST_SCRIPT_GENERATOR_PROMPT } from './prompts/podcast-script-generator.prompt';

// ElevenLabs voice IDs - configure via environment variables or use defaults
// You can find voice IDs at: https://elevenlabs.io/voice-library
const HOST_VOICES: Record<'host1' | 'host2', string> = {
  host1: process.env.ELEVENLABS_HOST1_VOICE || 'tvFp0BgJPrEXGoDhDIA4', // Thomas  - deep, professional male voice
  host2: process.env.ELEVENLABS_HOST2_VOICE || '7qdUFMklKPaaAVMsBTBt', // Roos - warm, engaging female voice
};

// Helper to update progress in Firestore
async function updateProgress(
  sessionRef: FirebaseFirestore.DocumentReference,
  existingPodcasts: any[],
  version: number,
  status: string,
  progress: number,
  message: string,
  additionalData: any = {}
) {
  const updatedPodcast = {
    version,
    status,
    progress,
    progressMessage: message,
    ...additionalData
  };

  await sessionRef.update({
    podcasts: upsertPodcast(existingPodcasts, updatedPodcast),
    updatedAt: FieldValue.serverTimestamp()
  });
}

interface PodcastSegment {
  speaker: 'host1' | 'host2';
  text: string;
  emotion?: 'neutral' | 'excited' | 'curious' | 'amused';
}

interface PodcastScript {
  segments: PodcastSegment[];
  estimatedDuration: number;
}

interface AISettings {
  defaultModel: string;
  modelConfig: {
    [key: string]: {
      maxOutputTokens: number;
      temperature: number;
      topP: number;
      topK: number;
    };
  };
}

interface PodcastGenerationRequest {
  campaignId: string;
  sessionId: string;
  version: number;
  story?: string;           // For script generation
  sessionTitle?: string;    // For script generation
  sessionDate?: string;     // Optional
  script?: PodcastScript;   // Optional (backward compatibility)
}

type CallableRequest<T> = {
  auth?: { uid?: string };
  data: T;
};

export const generatePodcastAudio = onCall(
  {
    cors: [
      'https://questmind.nl',
      'http://localhost:4200',
      /^https:\/\/.*\.web\.app$/,
      /^https:\/\/.*\.firebaseapp\.com$/
    ],
    secrets: ['GOOGLE_AI_API_KEY', 'ELEVENLABS_API_KEY'],
    timeoutSeconds: 900,    // 15 minutes
    memory: '1GiB'         // 1GB
  },
  async (request: CallableRequest<PodcastGenerationRequest>) => {
    const { auth, data } = request;

    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { campaignId, sessionId, version, story, sessionTitle, sessionDate, script } = data;

    // Standard validations
    if (!campaignId || typeof campaignId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing campaignId.');
    }
    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing sessionId.');
    }
    if (!version || typeof version !== 'number') {
      throw new HttpsError('invalid-argument', 'Missing version.');
    }

    // If script not provided, story and sessionTitle required
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

    const googleAiKey = process.env.GOOGLE_AI_API_KEY;
    const elevenlabsKey = process.env.ELEVENLABS_API_KEY;

    if (!googleAiKey) {
      throw new HttpsError('failed-precondition', 'Google AI API key not configured.');
    }
    if (!elevenlabsKey) {
      throw new HttpsError('failed-precondition', 'ElevenLabs API key not configured.');
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
    const existingPodcasts = Array.isArray(sessionData.podcasts) ? sessionData.podcasts : [];
    const existingEntry = existingPodcasts.find((podcast: any) => podcast?.version === version);

    const now = new Date();
    const initialPodcastEntry = {
      version,
      createdAt: existingEntry?.createdAt ?? now,
      storyVersion: sessionData.storyRegenerationCount ?? existingEntry?.storyVersion ?? 1,
      status: 'pending' as const,
      progress: 0,
      progressMessage: 'Starting podcast generation...'
      // Remove scriptGeneratedAt, duration, script - set during generation
    };

    await sessionRef.update({
      podcasts: upsertPodcast(existingPodcasts, initialPodcastEntry),
      latestPodcastVersion: version,
      updatedAt: FieldValue.serverTimestamp()
    });

    // RETURN IMMEDIATELY - Generation continues in background
    // Frontend will listen to Firestore updates via onSnapshot

    // Start generation asynchronously (don't await)
    generatePodcastInBackground(
      campaignId,
      sessionId,
      version,
      script,        // May be undefined
      story,         // May be undefined
      sessionTitle,  // May be undefined
      sessionDate,   // May be undefined
      sessionRef,
      existingPodcasts,
      auth.uid,
      storage
    ).catch(error => {
      console.error('Background generation failed:', error);
    });

    return {
      success: true,
      message: 'Podcast generation started'
    };
  }
);

function upsertPodcast(existing: any[], nextEntry: any): any[] {
  const index = existing.findIndex(podcast => podcast?.version === nextEntry.version);
  if (index === -1) {
    return [...existing, nextEntry];
  }
  const updated = [...existing];
  updated[index] = { ...existing[index], ...nextEntry };
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

// Background generation function
async function generatePodcastInBackground(
  campaignId: string,
  sessionId: string,
  version: number,
  script: PodcastScript | undefined,
  story: string | undefined,
  sessionTitle: string | undefined,
  sessionDate: string | undefined,
  sessionRef: FirebaseFirestore.DocumentReference,
  existingPodcasts: any[],
  userId: string,
  storage: any
) {
  const googleAiKey = process.env.GOOGLE_AI_API_KEY;
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY;

  if (!googleAiKey || !elevenlabsKey) {
    await updateProgress(sessionRef, existingPodcasts, version, 'failed', 0, 'API keys not configured', {
      error: 'Required API keys are not configured'
    });
    return;
  }

  const db = getFirestore();
  const googleAi = new GoogleGenAI({ apiKey: googleAiKey });
  const elevenlabs = new ElevenLabsClient({ apiKey: elevenlabsKey });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
  const outputPath = path.join(tempDir, `podcast-${sessionId}-v${version}.mp3`);

  try {
    let finalScript: PodcastScript;
    let modelUsed: string | undefined;

    // STEP 1: Generate script if not provided
    if (!script) {
      // 1.1 Load AI settings
      await updateProgress(sessionRef, existingPodcasts, version, 'loading_context', 5, 'Loading AI settings...');

      const settingsSnap = await db.doc('settings/ai').get();
      const aiSettings = settingsSnap.data() as AISettings | undefined;

      if (!aiSettings) {
        throw new Error('AI settings not configured in database');
      }

      const selectedModel = aiSettings.defaultModel;
      const modelConfig = aiSettings.modelConfig[selectedModel];

      if (!modelConfig) {
        throw new Error(`Model configuration not found for: ${selectedModel}`);
      }

      modelUsed = selectedModel;
      console.log(`Using model: ${selectedModel}`);

      // 1.2 Generate script
      await updateProgress(sessionRef, existingPodcasts, version, 'generating_script', 15,
        `Generating script with ${selectedModel}...`);

      const promptText = `${PODCAST_SCRIPT_GENERATOR_PROMPT}\n\nSESSION TITLE: ${sessionTitle}\nSESSION DATE: ${
        sessionDate || 'Unknown'
      }\n\nSESSION STORY:\n${story}\n\nGenereer een podcast script met natuurlijke dialoog tussen HOST1 (man) en HOST2 (vrouw).`;

      const scriptResponse = await googleAi.models.generateContent({
        model: selectedModel,
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        config: modelConfig
      });

      if (!scriptResponse.text) {
        throw new Error('No script generated by AI');
      }

      // 1.3 Parse script
      finalScript = parseScriptResponse(scriptResponse.text);

      if (finalScript.segments.length === 0) {
        throw new Error('Failed to parse script segments');
      }

      // Validate character limit
      const totalCharacters = finalScript.segments.reduce((sum, seg) => sum + seg.text.length, 0);
      console.log(`Generated script: ${totalCharacters} characters (limit: 5000)`);

      if (totalCharacters > 5000) {
        throw new Error(
          `Script too long (${totalCharacters} chars). Maximum is 5000. Try a shorter story.`
        );
      }

      await updateProgress(sessionRef, existingPodcasts, version, 'script_complete', 50,
        `Script generated with ${finalScript.segments.length} segments`,
        {
          script: finalScript,
          scriptGeneratedAt: new Date(),
          duration: finalScript.estimatedDuration,
          modelUsed: selectedModel
        }
      );

      console.log(`Script: ${finalScript.segments.length} segments, ~${finalScript.estimatedDuration}s`);
    } else {
      // Script provided, skip generation
      finalScript = script;
      await updateProgress(sessionRef, existingPodcasts, version, 'script_complete', 50,
        'Using provided script',
        {
          script: finalScript,
          scriptGeneratedAt: new Date(),
          duration: finalScript.estimatedDuration
        }
      );
      console.log(`Using provided script: ${finalScript.segments.length} segments`);
    }

    // STEP 2: Generate audio (existing code continues)
    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'generating_audio',
      55,
      'Generating conversational audio with text-to-dialogue...'
    );

    // 1. Format script for text-to-dialogue
    // Convert segments to text-to-dialogue input format: array of { text, voiceId }
    const dialogueInputs = finalScript.segments.map((seg: any) => ({
      text: seg.text,
      voiceId: HOST_VOICES[seg.speaker as 'host1' | 'host2'] || HOST_VOICES.host1
    }));

    console.log(`Generating podcast with text-to-dialogue (${finalScript.segments.length} segments)`);

    // 2. Call ElevenLabs text-to-dialogue API (SINGLE CALL)
    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'generating_audio',
      60,
      'Calling ElevenLabs text-to-dialogue API...'
    );

    const audioStream = await elevenlabs.textToDialogue.convert({
      inputs: dialogueInputs
    });

    // Update: Receiving audio
    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'generating_audio',
      70,
      'Receiving audio stream...'
    );

    // 3. Convert stream to buffer
    const chunks: Buffer[] = [];
    const readable = Readable.from(audioStream as any);

    for await (const chunk of readable) {
      chunks.push(Buffer.from(chunk));
    }

    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      throw new Error('Empty audio buffer from text-to-dialogue');
    }

    console.log(`Generated podcast: ${audioBuffer.length} bytes`);
    fs.writeFileSync(outputPath, audioBuffer);

    // Update: Uploading to storage
    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'uploading',
      85,
      'Uploading podcast to storage...'
    );

    // 4. Upload to Firebase Storage
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

    // Update: Completed!
    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'completed',
      100,
      'Podcast ready!',
      {
        audioUrl: fileUrl,
        fileSize,
        audioGeneratedAt: new Date(),
        modelUsed: modelUsed,  // Add model info
        error: null
      }
    );

    console.log(`Podcast generation completed: ${fileUrl}`);

  } catch (error: any) {
    console.error('Error generating podcast:', error);

    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'failed',
      0,
      'Failed to generate podcast',
      {
        error: error?.message || 'Unknown error'
      }
    );
  } finally {
    // Cleanup
    safeUnlink(outputPath);
    safeRemoveDir(tempDir);
  }
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
