import * as logger from './utils/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { Anthropic } from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { SHARED_CORS } from './index';
import { PODCAST_SCRIPT_GENERATOR_PROMPT } from './prompts/podcast-script-generator.prompt';
import { ensureAuthForTesting } from './utils/emulator-helpers';
import { ProgressTrackerService } from './services/progress-tracker.service';
import { wrapCallable } from './utils/sentry-error-handler';

const AZURE_VOICES: Record<'host1' | 'host2', string> = {
  host1: 'nl-NL-Maarten:DragonHDOmniLatestNeural',
  host2: 'nl-NL-Colette:DragonHDOmniLatestNeural',
};

async function updatePodcastEntry(
  sessionRef: FirebaseFirestore.DocumentReference,
  existingPodcasts: any[],
  version: number,
  data: Record<string, unknown>
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
    secrets: ['CLAUDE_API_KEY', 'AZURE_SPEECH_KEY'],
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

function processLangTags(text: string): string {
  // First escape XML, then convert [en]...[/en] markers to <lang> tags
  const escaped = escapeXml(text);
  return escaped
    .replace(/\[en\](.*?)\[\/en\]/g, '<lang xml:lang="en-US">$1</lang>');
}

function buildSsml(segments: PodcastSegment[]): string {
  const ssmlParts = segments.map(seg =>
    `<voice name="${AZURE_VOICES[seg.speaker]}">${processLangTags(seg.text)}</voice>`
  );
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="nl-NL">${ssmlParts.join('\n')}</speak>`;
}

async function synthesizeSpeechAzure(ssml: string): Promise<Buffer> {
  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = 'swedencentral';

  if (!speechKey || !speechRegion) {
    throw new Error('Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION environment variables');
  }

  const endpoint = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-48khz-192kbitrate-mono-mp3',
      'User-Agent': 'QuestMind-PodcastGenerator',
    },
    body: ssml,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure TTS failed (${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
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
        campaignId, sessionId, 'generating-podcast-script', 10, 'Generating podcast script...'
      );

      const anthropicClient = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

      const scriptResponse = await anthropicClient.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
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
      logger.debug(`Generated script: ${totalCharacters} characters (limit: 6000)`);

      if (totalCharacters > 6000) {
        throw new Error(
          `Script too long (${totalCharacters} chars). Maximum is 6000. Try a shorter story.`
        );
      }

      await updatePodcastEntry(sessionRef, existingPodcasts, version, {
        status: 'script_complete',
        script: finalScript,
        scriptGeneratedAt: new Date(),
        duration: finalScript.estimatedDuration,
        modelUsed: 'claude-haiku-4-5-20251001'
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

    // STEP 2: Generate audio via Azure Speech
    await ProgressTrackerService.updateProgress(
      campaignId, sessionId, 'generating-podcast-audio', 55, 'Generating podcast audio with Azure Speech...'
    );

    const ssml = buildSsml(finalScript.segments);
    logger.debug(`Generating podcast audio via Azure Speech (${finalScript.segments.length} segments)`);

    await ProgressTrackerService.updateProgress(
      campaignId, sessionId, 'generating-podcast-audio', 65, 'Calling Azure Speech TTS API...'
    );

    const audioBuffer = await synthesizeSpeechAzure(ssml);

    if (audioBuffer.length === 0) {
      throw new Error('Empty audio buffer from Azure Speech TTS');
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
      modelUsed: 'claude-haiku-4-5-20251001',
      error: null
    });

    await ProgressTrackerService.markCompleted(campaignId, sessionId, 'Podcast generation complete');

    logger.debug(`Podcast generation completed: ${fileUrl}`);

  } catch (error: any) {
    console.error('Error generating podcast:', error);

    await updatePodcastEntry(sessionRef, existingPodcasts, version, {
      status: 'failed',
      error: error?.message || 'Unknown error'
    });

    await ProgressTrackerService.markFailed(campaignId, sessionId, 'generating-podcast-audio', error);
  }
}
