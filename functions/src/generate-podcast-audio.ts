import * as logger from './utils/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { randomUUID } from 'crypto';
import { SHARED_CORS } from './index';
import { PODCAST_SCRIPT_GENERATOR_PROMPT } from './prompts/podcast-script-generator.prompt';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { wrapCallable } from './utils/sentry-error-handler';

const CHIRP_VOICES: Record<'host1' | 'host2', string> = {
  host1: 'nl-NL-Chirp3-HD-Charon',
  host2: 'nl-NL-Chirp3-HD-Aoede',
};

/**
 * @deprecated Use ProgressTrackerService instead (Ticket #43)
 * Helper to update podcast-specific progress in Firestore
 * Still needed for updating individual podcast records, but unified session progress
 * should be tracked via ProgressTrackerService
 */
async function updatePodcastProgress(
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
    secrets: [],
    timeoutSeconds: 900, // 15 minutes
    memory: '1GiB'
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
    };

    await sessionRef.update({
      podcasts: upsertPodcast(existingPodcasts, initialPodcastEntry),
      latestPodcastVersion: version,
      updatedAt: FieldValue.serverTimestamp()
    });

    // RETURN IMMEDIATELY - Generation continues in background
    generatePodcastInBackground(
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
    ).catch(error => {
      console.error('Background generation failed:', error);
    });

    return {
      success: true,
      message: 'Podcast generation started'
    };
  })
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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSsml(segments: PodcastSegment[]): string {
  const ssmlParts = segments.map(seg =>
    `<voice name="${CHIRP_VOICES[seg.speaker]}">${escapeXml(seg.text)}</voice>`
  );
  return `<speak>${ssmlParts.join('\n')}</speak>`;
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
  existingPodcasts: any[],
  userId: string,
  storage: any
) {
  try {
    let finalScript: PodcastScript;

    // STEP 1: Generate script if not provided
    if (!script) {
      await ProgressTrackerService.updateProgress(
        campaignId,
        sessionId,
        'generating-podcast-script',
        10,
        'Generating podcast script...'
      );

      await updatePodcastProgress(sessionRef, existingPodcasts, version, 'generating_script', 15,
        'Generating script with Claude Haiku...');

      const anthropicClient = new AnthropicVertex({
        projectId: process.env.GCLOUD_PROJECT,
        region: 'europe-west1',
      });

      const scriptResponse = await anthropicClient.messages.create({
        model: 'claude-haiku-4-5@20251001',
        max_tokens: 2048,
        system: PODCAST_SCRIPT_GENERATOR_PROMPT,
        messages: [
          {
            role: 'user',
            content: `SESSION TITLE: ${sessionTitle}\nSESSION DATE: ${sessionDate || 'Unknown'}\n\nSESSION STORY:\n${story}`,
          },
        ],
      });

      const scriptTextBlock = scriptResponse.content.find(block => block.type === 'text');
      if (!scriptTextBlock || scriptTextBlock.type !== 'text' || !scriptTextBlock.text) {
        throw new Error('No script generated by AI');
      }

      finalScript = parseScriptResponse(scriptTextBlock.text);

      if (finalScript.segments.length === 0) {
        throw new Error('Failed to parse script segments');
      }

      const totalCharacters = finalScript.segments.reduce((sum, seg) => sum + seg.text.length, 0);
      logger.debug(`Generated script: ${totalCharacters} characters (limit: 5000)`);

      if (totalCharacters > 5000) {
        throw new Error(
          `Script too long (${totalCharacters} chars). Maximum is 5000. Try a shorter story.`
        );
      }

      await updatePodcastProgress(sessionRef, existingPodcasts, version, 'script_complete', 50,
        `Script generated with ${finalScript.segments.length} segments`,
        {
          script: finalScript,
          scriptGeneratedAt: new Date(),
          duration: finalScript.estimatedDuration,
          modelUsed: 'claude-haiku-4-5@20251001'
        }
      );

      logger.debug(`Script: ${finalScript.segments.length} segments, ~${finalScript.estimatedDuration}s`);
    } else {
      finalScript = script;
      await updatePodcastProgress(sessionRef, existingPodcasts, version, 'script_complete', 50,
        'Using provided script',
        {
          script: finalScript,
          scriptGeneratedAt: new Date(),
          duration: finalScript.estimatedDuration
        }
      );
      logger.debug(`Using provided script: ${finalScript.segments.length} segments`);
    }

    // STEP 2: Generate audio via Chirp 3 HD
    await ProgressTrackerService.updateProgress(
      campaignId,
      sessionId,
      'generating-podcast-audio',
      55,
      'Generating podcast audio with Chirp 3 HD...'
    );

    await updatePodcastProgress(
      sessionRef,
      existingPodcasts,
      version,
      'generating_audio',
      55,
      'Generating audio with Chirp 3 HD TTS...'
    );

    const ttsClient = new TextToSpeechClient({
      apiEndpoint: 'eu-texttospeech.googleapis.com',
    });

    const ssml = buildSsml(finalScript.segments);

    logger.debug(`Generating podcast audio via Chirp 3 HD (${finalScript.segments.length} segments)`);

    await updatePodcastProgress(
      sessionRef,
      existingPodcasts,
      version,
      'generating_audio',
      65,
      'Calling Chirp 3 HD TTS API...'
    );

    const [audioResponse] = await ttsClient.synthesizeSpeech({
      input: { ssml },
      voice: { languageCode: 'nl-NL' },
      audioConfig: {
        audioEncoding: 'MP3' as unknown as import('@google-cloud/text-to-speech').protos.google.cloud.texttospeech.v1.AudioEncoding,
      },
    });

    if (!audioResponse.audioContent) {
      throw new Error('No audio content returned from TTS API');
    }

    const audioBuffer = Buffer.from(audioResponse.audioContent as Uint8Array);

    if (audioBuffer.length === 0) {
      throw new Error('Empty audio buffer from Chirp 3 HD TTS');
    }

    logger.debug(`Generated podcast: ${audioBuffer.length} bytes`);

    // STEP 3: Upload to Firebase Storage
    await updatePodcastProgress(
      sessionRef,
      existingPodcasts,
      version,
      'uploading',
      85,
      'Uploading podcast to storage...'
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

    await updatePodcastProgress(
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
        modelUsed: 'claude-haiku-4-5@20251001',
        error: null
      }
    );

    await ProgressTrackerService.markCompleted(
      campaignId,
      sessionId,
      'Podcast generation complete'
    );

    logger.debug(`Podcast generation completed: ${fileUrl}`);

  } catch (error: any) {
    console.error('Error generating podcast:', error);

    await updatePodcastProgress(
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

    await ProgressTrackerService.markFailed(
      campaignId,
      sessionId,
      'generating-podcast-audio',
      error
    );
  }
}
