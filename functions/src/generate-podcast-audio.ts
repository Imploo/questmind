import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import ffmpeg from 'fluent-ffmpeg';
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
    timeoutSeconds: 1200, // 20 minutes for multi-segment TTS generation
    memory: '1GiB' // Increased memory for ffmpeg processing
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
    const basePodcastEntry = {
      version,
      createdAt: existingEntry?.createdAt ?? now,
      scriptGeneratedAt: existingEntry?.scriptGeneratedAt ?? now,
      duration: script.estimatedDuration,
      storyVersion: sessionData.storyRegenerationCount ?? existingEntry?.storyVersion,
      script,
      status: 'generating_audio' as const
    };

    await sessionRef.update({
      podcasts: upsertPodcast(existingPodcasts, basePodcastEntry),
      latestPodcastVersion: version,
      updatedAt: FieldValue.serverTimestamp()
    });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
    const segmentFiles: string[] = [];
    const outputPath = path.join(tempDir, `podcast-${sessionId}-v${version}.mp3`);

    try {
      // Generate segments with ElevenLabs
      // Limit to two concurrent calls to respect rate limits.
      const CONCURRENCY_LIMIT = 3;
      const generatedSegments: string[] = [];

      for (let batchStart = 0; batchStart < script.segments.length; batchStart += CONCURRENCY_LIMIT) {
        const batchEnd = Math.min(batchStart + CONCURRENCY_LIMIT, script.segments.length);
        const batch = script.segments.slice(batchStart, batchEnd);

        console.log(`Processing segments ${batchStart + 1}-${batchEnd} of ${script.segments.length}`);

        const batchPromises = batch.map(async (segment, batchIndex) => {
          const i = batchStart + batchIndex;
          const voiceId = HOST_VOICES[segment.speaker] ?? HOST_VOICES.host1;

          // Retry logic with exponential backoff for rate limits
          let audioStream;
          let retries = 0;
          const maxRetries = 3;

          while (retries <= maxRetries) {
            try {
              audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
                text: segment.text,
                modelId: 'eleven_turbo_v2_5', // Fast, high-quality model
                voiceSettings: {
                  stability: 0.3,
                  style: 0.0,
                  useSpeakerBoost: true
                }
              });
              break; // Success, exit retry loop
            } catch (error: any) {
              if ((error?.status === 429 || error?.statusCode === 429) && retries < maxRetries) {
                const delay = Math.pow(2, retries) * 2000; // 2s, 4s, 8s
                console.log(`Rate limit hit for segment ${i + 1}, retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                retries++;
              } else {
                throw error; // Re-throw if not rate limit or max retries exceeded
              }
            }
          }

          if (!audioStream) {
            throw new Error(`No audio stream returned for segment ${i + 1}.`);
          }

          // Convert stream to buffer
          const chunks: Buffer[] = [];
          const readable = Readable.from(audioStream as any);

          for await (const chunk of readable) {
            chunks.push(Buffer.from(chunk));
          }

          const audioBuffer = Buffer.concat(chunks);

          // Verify we have valid audio data
          if (audioBuffer.length === 0) {
            throw new Error(`Empty audio buffer for segment ${i + 1}.`);
          }

          console.log(`Segment ${i + 1}: Generated ${audioBuffer.length} bytes`);

          const segmentPath = path.join(tempDir, `segment-${i}.mp3`);
          fs.writeFileSync(segmentPath, audioBuffer);

          return segmentPath;
        });

        const batchResults = await Promise.all(batchPromises);
        generatedSegments.push(...batchResults);

        // Small delay between batches to be respectful of API limits
        if (batchEnd < script.segments.length) {
          console.log('Waiting 2 seconds before next batch...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      segmentFiles.push(...generatedSegments);

      await combineAudioSegments(segmentFiles, outputPath);

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
            userId: auth.uid
          }
        }
      });

      const encodedPath = encodeURIComponent(storagePath);
      const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${storage.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

      const fileSize = fs.statSync(outputPath).size;
      const completedEntry = {
        ...basePodcastEntry,
        audioUrl: fileUrl,
        fileSize,
        audioGeneratedAt: new Date(),
        status: 'completed' as const,
        error: null
      };

      await sessionRef.update({
        podcasts: upsertPodcast(existingPodcasts, completedEntry),
        latestPodcastVersion: version,
        updatedAt: FieldValue.serverTimestamp()
      });

      return {
        success: true,
        audioUrl: fileUrl,
        fileSize,
        duration: script.estimatedDuration
      };
    } catch (error: any) {
      console.error('Error generating podcast audio:', error);
      const failedEntry = {
        ...basePodcastEntry,
        status: 'failed' as const,
        error: error?.message || 'Audio generation failed.'
      };

      await sessionRef.update({
        podcasts: upsertPodcast(existingPodcasts, failedEntry),
        updatedAt: FieldValue.serverTimestamp()
      });

      throw new HttpsError('internal', 'Failed to generate podcast audio.');
    } finally {
      for (const file of segmentFiles) {
        safeUnlink(file);
      }
      safeUnlink(outputPath);
      safeRemoveDir(tempDir);
    }
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

function combineAudioSegments(segmentFiles: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (segmentFiles.length === 1) {
      fs.copyFileSync(segmentFiles[0], outputPath);
      resolve();
      return;
    }

    const command = ffmpeg();
    segmentFiles.forEach(file => command.input(file));

    const filter =
      segmentFiles.map((_, index) => `[${index}:a]`).join('') +
      `concat=n=${segmentFiles.length}:v=0:a=1[out]`;

    command
      .complexFilter(filter)
      .outputOptions(['-map [out]', '-ac 1', '-b:a 128k'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: unknown) => reject(err))
      .run();
  });
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
