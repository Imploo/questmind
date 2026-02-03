import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

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

interface PodcastGenerationRequest {
  campaignId: string;
  sessionId: string;
  version: number;
  script: PodcastScript;
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
    secrets: ['ELEVENLABS_API_KEY'],
    timeoutSeconds: 600, // 10 minutes for text-to-dialogue generation
    memory: '512MiB' // Reduced memory (no ffmpeg processing needed)
  },
  async (request: CallableRequest<PodcastGenerationRequest>) => {
    const { auth, data } = request;

    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { campaignId, sessionId, version, script } = data as PodcastGenerationRequest;

    if (!campaignId || typeof campaignId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing campaignId.');
    }
    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing sessionId.');
    }
    if (!version || typeof version !== 'number') {
      throw new HttpsError('invalid-argument', 'Missing version.');
    }
    if (!script || !Array.isArray(script.segments) || script.segments.length === 0) {
      throw new HttpsError('invalid-argument', 'Script segments are required.');
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'ElevenLabs API key is not configured.');
    }

    const elevenlabs = new ElevenLabsClient({ apiKey });
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
      scriptGeneratedAt: existingEntry?.scriptGeneratedAt ?? now,
      duration: script.estimatedDuration,
      storyVersion: sessionData.storyRegenerationCount ?? existingEntry?.storyVersion,
      script,
      status: 'pending' as const,
      progress: 0,
      progressMessage: 'Starting podcast generation...'
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
      script,
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

// Background generation function
async function generatePodcastInBackground(
  campaignId: string,
  sessionId: string,
  version: number,
  script: any,
  sessionRef: FirebaseFirestore.DocumentReference,
  existingPodcasts: any[],
  userId: string,
  storage: any
) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    await updateProgress(sessionRef, existingPodcasts, version, 'failed', 0, 'API key not configured', {
      error: 'ElevenLabs API key is not configured'
    });
    return;
  }

  const elevenlabs = new ElevenLabsClient({ apiKey });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
  const outputPath = path.join(tempDir, `podcast-${sessionId}-v${version}.mp3`);

  try {
    // Update: Starting audio generation
    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'generating_audio',
      10,
      'Generating conversational audio with text-to-dialogue...'
    );

    // 1. Format script for text-to-dialogue
    // Convert segments to text-to-dialogue input format: array of { text, voiceId }
    const dialogueInputs = script.segments.map((seg: any) => ({
      text: seg.text,
      voiceId: HOST_VOICES[seg.speaker as 'host1' | 'host2'] || HOST_VOICES.host1
    }));

    console.log(`Generating podcast with text-to-dialogue (${script.segments.length} segments)`);

    // 2. Call ElevenLabs text-to-dialogue API (SINGLE CALL)
    await updateProgress(
      sessionRef,
      existingPodcasts,
      version,
      'generating_audio',
      30,
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
      60,
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
      80,
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
