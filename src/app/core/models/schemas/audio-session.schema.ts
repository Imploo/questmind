import { z } from 'zod';

/**
 * Storage metadata schema
 */
export const StorageMetadataSchema = z.object({
  storagePath: z.string(),
  downloadUrl: z.string().url(),
  fileSize: z.number().positive(),
  contentType: z.string(),
  uploadedAt: z.string(),
  durationSeconds: z.number().positive().optional(),
});

/**
 * Transcription timestamp schema
 */
export const TranscriptionTimestampSchema = z.object({
  time: z.number().nonnegative(),
  text: z.string(),
});

/**
 * Transcription segment schema
 */
export const TranscriptionSegmentSchema = z.object({
  timeSeconds: z.number().nonnegative(),
  text: z.string(),
  speaker: z.string().optional(),
});

/**
 * Transcription chunk schema
 */
export const TranscriptionChunkSchema = z.object({
  index: z.number().nonnegative(),
  startTimeSeconds: z.number().nonnegative(),
  endTimeSeconds: z.number().nonnegative(),
  durationSeconds: z.number().positive(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  segments: z.array(TranscriptionSegmentSchema).optional(),
  completedAt: z.date().optional(),
  error: z.string().optional(),
  failedAt: z.date().optional(),
  retryCount: z.number().nonnegative().optional(),
  tokensUsed: z.number().nonnegative().optional(),
  thoughtsTokens: z.number().nonnegative().optional(),
  processingTimeMs: z.number().nonnegative().optional(),
});

/**
 * Transcription result schema
 */
export const TranscriptionResultSchema = z.object({
  id: z.string(),
  rawTranscript: z.string(),
  timestamps: z.array(TranscriptionTimestampSchema),
  status: z.enum(['processing', 'completed', 'failed']),
  storageMetadata: StorageMetadataSchema,
  segments: z.array(TranscriptionSegmentSchema).optional(),
});

/**
 * Transcription record schema
 */
export const TranscriptionRecordSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  rawTranscript: z.string(),
  timestamps: z.array(TranscriptionTimestampSchema),
  status: z.enum(['processing', 'completed', 'failed']),
  createdAt: z.string(),
  label: z.string().optional(),
  isComplete: z.boolean().optional(),
  completedChunks: z.number().nonnegative().optional(),
  totalChunks: z.number().positive().optional(),
  lastProcessedChunkIndex: z.number().nonnegative().optional(),
  chunks: z.array(TranscriptionChunkSchema).optional(),
});

/**
 * Session story schema
 */
export const SessionStorySchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  sessionDate: z.string().optional(),
  audioFileName: z.string().optional(),
  createdAt: z.string(),
});

/**
 * Podcast segment schema
 */
export const PodcastSegmentSchema = z.object({
  speaker: z.enum(['host1', 'host2']),
  text: z.string(),
  emotion: z.enum(['neutral', 'excited', 'curious', 'amused']).optional(),
});

/**
 * Podcast script schema
 */
export const PodcastScriptSchema = z.object({
  segments: z.array(PodcastSegmentSchema),
  estimatedDuration: z.number().positive(),
});

/**
 * Podcast version schema
 */
export const PodcastVersionSchema = z.object({
  version: z.number().positive(),
  createdAt: z.date(),
  scriptGeneratedAt: z.date().optional(),
  audioGeneratedAt: z.date().optional(),
  audioUrl: z.string().url().optional(),
  duration: z.number().positive().optional(),
  fileSize: z.number().positive().optional(),
  storyVersion: z.number().positive().optional(),
  script: PodcastScriptSchema.optional(),
  status: z.enum([
    'pending',
    'loading_context',
    'generating_script',
    'script_complete',
    'generating_audio',
    'uploading',
    'completed',
    'failed',
  ]),
  progress: z.number().min(0).max(100),
  progressMessage: z.string(),
  error: z.string().optional(),
  modelUsed: z.string().optional(),
});

/**
 * Upload progress schema
 */
export const UploadProgressSchema = z.object({
  sessionId: z.string(),
  progress: z.number().min(0).max(100),
  bytesTransferred: z.number().nonnegative(),
  totalBytes: z.number().positive(),
  status: z.enum(['uploading', 'completed', 'failed']),
});

/**
 * Progress stage type
 */
export const ProgressStageSchema = z.enum([
  'uploading',
  'submitted',
  'downloading',
  'chunking',
  'transcribing',
  'generating-story',
  'completed',
  'failed',
]);

/**
 * Progress failure schema
 */
export const ProgressFailureSchema = z.object({
  stage: z.string(),
  error: z.string(),
  timestamp: z.date(),
  details: z.any().optional(),
});

/**
 * Unified progress schema
 */
export const UnifiedProgressSchema = z.object({
  stage: ProgressStageSchema,
  progress: z.number().min(0).max(100),
  currentStep: z.string().optional(),
  failure: ProgressFailureSchema.optional(),
  updatedAt: z.date(),
});

/**
 * Transcription batch metadata schema
 */
export const TranscriptionBatchMetadataSchema = z.object({
  batchJobName: z.string().optional(),
  status: z.enum(['submitted', 'running', 'completed', 'failed']).optional(),
  error: z.string().optional(),
  lastCheckedAt: z.any().optional(), // Firestore timestamp
  enableKankaContext: z.boolean().optional(),
  userCorrections: z.string().optional(),
});

/**
 * Audio session record schema (main schema)
 */
export const AudioSessionRecordSchema = SessionStorySchema.extend({
  campaignId: z.string(),
  ownerId: z.string(),
  ownerEmail: z.string().email(),
  createdBy: z.string(),
  status: z.enum(['uploading', 'processing', 'completed', 'failed']),
  updatedAt: z.string(),
  storageUrl: z.string().optional(), // gs:// URL for Cloud Functions (primary storage reference)
  transcription: TranscriptionResultSchema.optional(),
  storageMetadata: StorageMetadataSchema.optional(),
  activeTranscriptionId: z.string().optional(),
  transcriptions: z.array(TranscriptionRecordSchema).optional(),
  userCorrections: z.string().optional(),
  correctionsUpdatedAt: z.string().optional(),
  storyRegeneratedAt: z.string().optional(),
  storyRegenerationCount: z.number().nonnegative().optional(),
  podcasts: z.array(PodcastVersionSchema).optional(),
  latestPodcastVersion: z.number().positive().optional(),
  transcriptionCompletedAt: z.string().optional(),
  storyGeneratedAt: z.string().optional(),
  transcriptionBatch: TranscriptionBatchMetadataSchema.optional(),
  progress: UnifiedProgressSchema.optional(),
  modelsUsed: z
    .object({
      transcription: z.string().optional(),
      storyGeneration: z.string().optional(),
      podcastScript: z.string().optional(),
    })
    .optional(),
  processingStartedAt: z.string().optional(),
  processingCompletedAt: z.string().optional(),
  processingDurationMs: z.number().nonnegative().optional(),
});

/**
 * Audio upload schema
 */
export const AudioUploadSchema = z.object({
  file: z.instanceof(File),
  sessionName: z.string().optional(),
  sessionDate: z.string().optional(),
  userId: z.string(),
  campaignId: z.string(),
});

/**
 * Types inferred from schemas
 */
export type StorageMetadata = z.infer<typeof StorageMetadataSchema>;
export type TranscriptionTimestamp = z.infer<typeof TranscriptionTimestampSchema>;
export type TranscriptionSegment = z.infer<typeof TranscriptionSegmentSchema>;
export type TranscriptionChunk = z.infer<typeof TranscriptionChunkSchema>;
export type TranscriptionResult = z.infer<typeof TranscriptionResultSchema>;
export type TranscriptionRecord = z.infer<typeof TranscriptionRecordSchema>;
export type SessionStory = z.infer<typeof SessionStorySchema>;
export type PodcastSegment = z.infer<typeof PodcastSegmentSchema>;
export type PodcastScript = z.infer<typeof PodcastScriptSchema>;
export type PodcastVersion = z.infer<typeof PodcastVersionSchema>;
export type UploadProgress = z.infer<typeof UploadProgressSchema>;
export type ProgressStage = z.infer<typeof ProgressStageSchema>;
export type ProgressFailure = z.infer<typeof ProgressFailureSchema>;
export type UnifiedProgress = z.infer<typeof UnifiedProgressSchema>;
export type TranscriptionBatchMetadata = z.infer<typeof TranscriptionBatchMetadataSchema>;
export type AudioSessionRecord = z.infer<typeof AudioSessionRecordSchema>;
export type AudioUpload = z.infer<typeof AudioUploadSchema>;

/**
 * Validates unknown data against AudioSessionRecordSchema
 * @throws ZodError if validation fails
 */
export function validateAudioSessionRecord(data: unknown): AudioSessionRecord {
  return AudioSessionRecordSchema.parse(data);
}

/**
 * Safely validates data, returning undefined if invalid
 */
export function safeValidateAudioSessionRecord(data: unknown): AudioSessionRecord | undefined {
  const result = AudioSessionRecordSchema.safeParse(data);
  return result.success ? result.data : undefined;
}
