import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { GoogleGenAI } from '@google/genai';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const GEMINI_TTS_MODEL = process.env.PODCAST_TTS_MODEL || 'gemini-2.5-flash-tts';
const HOST_VOICES: Record<'host1' | 'host2', string> = {
  host1: 'Puck',
  host2: 'Aoede'
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
    ]
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

    const apiKey =
      process.env.GOOGLE_AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Google AI API key is not configured.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const db = getFirestore();
    const storage = getStorage().bucket();
    const campaignRef = db.doc(`campaigns/${campaignId}/metadata`);
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

    const basePodcastEntry = {
      version,
      createdAt: existingEntry?.createdAt ?? FieldValue.serverTimestamp(),
      scriptGeneratedAt: existingEntry?.scriptGeneratedAt ?? FieldValue.serverTimestamp(),
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
      for (let i = 0; i < script.segments.length; i++) {
        const segment = script.segments[i];
        const voiceName = HOST_VOICES[segment.speaker] ?? HOST_VOICES.host1;

        const ttsConfig = {
          responseModalities: ['AUDIO'],
          audioConfig: {
            audioEncoding: 'MP3',
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName
              }
            }
          }
        } as any;

        const response = await ai.models.generateContent({
          model: GEMINI_TTS_MODEL,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: segment.text
                }
              ]
            }
          ],
          config: ttsConfig
        });

        const audioData = extractAudioData(response);
        if (!audioData) {
          throw new Error(`No audio data returned for segment ${i + 1}.`);
        }

        const segmentPath = path.join(tempDir, `segment-${i}.mp3`);
        fs.writeFileSync(segmentPath, Buffer.from(audioData, 'base64'));
        segmentFiles.push(segmentPath);
      }

      await combineAudioSegments(segmentFiles, outputPath);

      const storagePath = `campaigns/${campaignId}/podcasts/${sessionId}/v${version}.mp3`;
      await storage.upload(outputPath, {
        destination: storagePath,
        metadata: {
          contentType: 'audio/mpeg',
          metadata: {
            sessionId,
            campaignId,
            version: version.toString(),
            userId: auth.uid
          }
        }
      });

      const [fileUrl] = await storage.file(storagePath).getSignedUrl({
        action: 'read',
        expires: '03-01-2030'
      });

      const fileSize = fs.statSync(outputPath).size;
      const completedEntry = {
        ...basePodcastEntry,
        audioUrl: fileUrl,
        fileSize,
        audioGeneratedAt: FieldValue.serverTimestamp(),
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

function extractAudioData(response: any): string | null {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!parts || !Array.isArray(parts)) {
    return null;
  }
  const audioPart = parts.find((part: any) => part?.inlineData?.data);
  return audioPart?.inlineData?.data ?? null;
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
