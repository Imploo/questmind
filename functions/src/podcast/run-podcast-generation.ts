import { DocumentData, DocumentReference, FieldValue, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError } from 'firebase-functions/v2/https';
import * as logger from '../utils/logger';
import { captureFunctionError } from '../utils/sentry-error-handler';
import { getAiFeatureConfig, getPodcastVoiceConfig } from '../utils/ai-settings';
import { generatePodcastAudioBuffer } from '../utils/podcast-tts';
import { PodcastEntry } from '../types/audio-session.types';
import { isActiveGeneration } from '../utils/generation-timeouts';
import { PodcastScriptSource, generatePodcastScript, upsertPodcast, uploadPodcastMp3 } from './podcast-pipeline';

/**
 * Shared orchestration of a podcast generation (session podcast and campaign
 * story podcast): allocate a version, write the script, synthesize the audio,
 * upload it and keep the PodcastEntry up to date. Callables are thin wrappers
 * that do the access checks and provide a `PodcastEntryStore`.
 */

/** Where the podcast entries of one source document live, and how to read its text. */
export interface PodcastEntryStore {
  /**
   * Atomically allocate the next podcast version, register a pending entry and
   * return the source to narrate. Throws `failed-precondition` when the source
   * isn't ready or a generation is already running.
   */
  allocate(): Promise<{ version: number; source: PodcastScriptSource; storyVersion: number }>;
  /** Merge `patch` into the entry of `version` (transactional, so other entries aren't lost). */
  patch(version: number, patch: Partial<PodcastEntry>): Promise<void>;
}

/** Optional side channel for progress (e.g. the session's unified progress). */
export interface PodcastProgressListener {
  onProgress(progress: number, message: string): Promise<void>;
  onCompleted(): Promise<void>;
  onFailed(error: Error): Promise<void>;
}

export interface RunPodcastGenerationOptions {
  store: PodcastEntryStore;
  /** Function name for Sentry. */
  functionName: string;
  storagePath: (version: number) => string;
  uploadMetadata: (version: number) => Record<string, string>;
  /** Extra Sentry context. */
  context?: Record<string, unknown>;
  listener?: PodcastProgressListener;
}

/** User-facing progress messages (Dutch, like the rest of the UI). */
export const PODCAST_MESSAGES = {
  starting: 'Podcast generatie starten...',
  script: 'Podcast script schrijven...',
  audio: 'Audio genereren...',
  uploading: 'Podcast opslaan...',
  done: 'Klaar',
  failed: 'Mislukt',
} as const;

/**
 * Run a full podcast generation. Never throws after allocation: a failure is
 * stored on the entry (and reported to Sentry once). Allocation errors (not
 * ready, already running) are thrown to the caller.
 */
export async function runPodcastGeneration(opts: RunPodcastGenerationOptions): Promise<{ version: number }> {
  const { store, listener } = opts;
  const { version, source } = await store.allocate();

  const report = async (progress: number, message: string, patch: Partial<PodcastEntry> = {}) => {
    await store.patch(version, { ...patch, progress, progressMessage: message });
    await listener?.onProgress(progress, message);
  };

  try {
    const voiceConfig = await getPodcastVoiceConfig();
    const scriptConfig = await getAiFeatureConfig('podcastScript');

    await report(10, PODCAST_MESSAGES.script);
    const script = await generatePodcastScript(source, scriptConfig, voiceConfig.maxCharacters);
    logger.debug(`Podcast script: ${script.segments.length} segments, ~${script.estimatedDuration}s`);

    await report(50, PODCAST_MESSAGES.audio, {
      status: 'script_complete',
      script,
      scriptGeneratedAt: new Date(),
      duration: script.estimatedDuration,
      modelUsed: scriptConfig.model,
    });

    const audioBuffer = await generatePodcastAudioBuffer(script.segments, voiceConfig, (progress, message) =>
      report(progress, message)
    );

    await report(85, PODCAST_MESSAGES.uploading);
    const storagePath = opts.storagePath(version);
    const { audioUrl, fileSize } = await uploadPodcastMp3(
      getStorage().bucket(),
      storagePath,
      audioBuffer,
      opts.uploadMetadata(version)
    );

    await store.patch(version, {
      status: 'completed',
      audioUrl,
      fileSize,
      audioGeneratedAt: new Date(),
      progress: 100,
      progressMessage: PODCAST_MESSAGES.done,
      error: null,
    });
    await listener?.onCompleted();
    logger.debug(`Podcast completed: ${storagePath}`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    // The single Sentry event for this failure.
    captureFunctionError(opts.functionName, err, { ...opts.context, version });
    await store.patch(version, { status: 'failed', error: err.message, progressMessage: PODCAST_MESSAGES.failed });
    await listener?.onFailed(err);
  }

  return { version };
}

export interface DocPodcastEntryStoreOptions {
  /** Source to narrate; throw `failed-precondition` when the document isn't ready. */
  readSource(data: DocumentData): PodcastScriptSource;
  /** Story version the podcast is made from (stored on the entry). */
  storyVersion(data: DocumentData): number;
  /** Also bump `updatedAt` (server timestamp) on every write — session documents use it. */
  touchUpdatedAt?: boolean;
}

/**
 * Entry store for a document with a `podcasts` array and `latestPodcastVersion`
 * (audio session or campaign story version). Every write is a transaction.
 */
export function createDocPodcastEntryStore(
  db: Firestore,
  ref: DocumentReference,
  opts: DocPodcastEntryStoreOptions
): PodcastEntryStore {
  const touched = (fields: Record<string, unknown>) =>
    opts.touchUpdatedAt ? { ...fields, updatedAt: FieldValue.serverTimestamp() } : fields;

  return {
    allocate: () => db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Podcast source not found.');
      }
      const data = snap.data() ?? {};
      const source = opts.readSource(data);
      const podcasts = podcastsOf(data);
      const inProgress = podcasts.some(p =>
        (p?.status === 'pending' || p?.status === 'script_complete') && isActiveGeneration(p.createdAt)
      );
      if (inProgress) {
        throw new HttpsError('failed-precondition', 'Er wordt al een podcast gegenereerd.');
      }

      const version = nextPodcastVersion(data, podcasts);
      const storyVersion = opts.storyVersion(data);
      tx.update(ref, touched({
        podcasts: upsertPodcast(podcasts, {
          version,
          createdAt: new Date(),
          storyVersion,
          status: 'pending',
          progress: 0,
          progressMessage: PODCAST_MESSAGES.starting,
        }),
        latestPodcastVersion: version,
      }));
      return { version, source, storyVersion };
    }),

    patch: (version, patch) => db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      tx.update(ref, touched({ podcasts: upsertPodcast(podcastsOf(snap.data() ?? {}), { version, ...patch }) }));
    }),
  };
}

/** One above every version in use (so a lost counter or gaps never cause a collision). */
export function nextPodcastVersion(data: DocumentData, podcasts: PodcastEntry[]): number {
  const highestEntry = podcasts.reduce((max, p) => Math.max(max, typeof p?.version === 'number' ? p.version : 0), 0);
  const counter = typeof data.latestPodcastVersion === 'number' ? data.latestPodcastVersion : 0;
  return Math.max(highestEntry, counter, podcasts.length) + 1;
}

function podcastsOf(data: DocumentData): PodcastEntry[] {
  return Array.isArray(data.podcasts) ? data.podcasts : [];
}
