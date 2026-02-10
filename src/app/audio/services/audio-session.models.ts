export interface AudioUpload {
  file: File;
  sessionName?: string;
  sessionDate?: string;
  userId: string;
  campaignId: string;
  transcriptionMode?: 'fast' | 'batch';
}

export interface StorageMetadata {
  storagePath: string;
  downloadUrl: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
  durationSeconds?: number;
}

export interface TranscriptionTimestamp {
  time: number;
  text: string;
}

export interface TranscriptionSegment {
  timeSeconds: number;
  text: string;
  speaker?: string;
}

export interface TranscriptionChunk {
  index: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  segments?: TranscriptionSegment[];
  completedAt?: Date;
  error?: string;
  failedAt?: Date;
  retryCount?: number;
  tokensUsed?: number;
  thoughtsTokens?: number;
  processingTimeMs?: number;
}

export interface TranscriptionResult {
  id: string;
  rawTranscript: string;
  timestamps: TranscriptionTimestamp[];
  status: 'processing' | 'completed' | 'failed';
  storageMetadata: StorageMetadata;
  segments?: TranscriptionSegment[];
}

export interface TranscriptionRecord {
  id: string;
  sessionId: string;
  rawTranscript: string;
  timestamps: TranscriptionTimestamp[];
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
  label?: string;
  isComplete?: boolean;
  completedChunks?: number;
  totalChunks?: number;
  lastProcessedChunkIndex?: number;
  chunks?: TranscriptionChunk[];
}

export interface SessionStory {
  id: string;
  title: string;
  content: string;
  sessionDate?: string;
  audioFileName?: string;
  createdAt: string;
}

export interface PodcastSegment {
  speaker: 'host1' | 'host2';
  text: string;
  emotion?: 'neutral' | 'excited' | 'curious' | 'amused';
}

export interface PodcastScript {
  segments: PodcastSegment[];
  estimatedDuration: number; // seconds
}

export interface PodcastVersion {
  version: number;
  createdAt: Date;
  scriptGeneratedAt?: Date;
  audioGeneratedAt?: Date;
  audioUrl?: string;
  duration?: number; // seconds
  fileSize?: number; // bytes
  storyVersion?: number;
  script?: PodcastScript;

  // @deprecated Progress fields (Ticket #43) - Use session.progress instead
  // These fields are still used for completed/failed podcasts but should not be used for in-progress tracking
  status:
    | 'pending'
    | 'loading_context'      // NEW: 0-10%
    | 'generating_script'    // NEW: 10-50%
    | 'script_complete'      // NEW: 50%
    | 'generating_audio'     // 50-80%
    | 'uploading'            // 80-95%
    | 'completed'            // 100%
    | 'failed';
  /** @deprecated Use session.progress instead (Ticket #43) */
  progress: number; // 0-100
  /** @deprecated Use session.progress.message instead (Ticket #43) */
  progressMessage: string; // e.g., "Generating audio with text-to-dialogue..."
  /** @deprecated Use session.progress.error instead (Ticket #43) */
  error?: string;

  // Track model used
  modelUsed?: string;
}

/**
 * Unified session progress stage (Ticket #43)
 */
export type SessionProgressStage =
  | 'idle'
  | 'uploading'
  | 'transcribing'          // Fast transcription
  | 'batch-submitted'       // Batch transcription submitted
  | 'batch-processing'      // Batch transcription running
  | 'retranscribing'
  | 'generating-story'
  | 'regenerating-story'
  | 'generating-podcast-script'
  | 'generating-podcast-audio'
  | 'completed'
  | 'failed';

/**
 * Unified session progress tracking (Ticket #43)
 * Single progress object per session for ALL operations
 */
export interface SessionProgress {
  stage: SessionProgressStage;
  progress: number;                    // 0-100 percentage
  message: string;                     // User-friendly status message
  startedAt: Date;                     // When current operation started
  estimatedCompletionAt?: Date;        // Estimated completion time
  error?: string;                      // Error message if failed
  updatedAt: Date;                     // Last update timestamp
}

export interface TranscriptionBatchMetadata {
  batchJobName?: string;
  status?: 'submitted' | 'running' | 'completed' | 'failed';
  error?: string;
  lastCheckedAt?: unknown; // Firestore timestamp
  enableKankaContext?: boolean;
  userCorrections?: string;
}

export interface AudioSessionRecord extends SessionStory {
  campaignId: string;
  ownerId: string;
  ownerEmail: string;
  createdBy: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  updatedAt: string;

  // Storage - storageUrl is the primary field, storageMetadata for additional details
  storageUrl?: string; // gs:// URL for Cloud Functions

  transcription?: TranscriptionResult;
  activeTranscriptionId?: string;
  transcriptions?: TranscriptionRecord[];
  userCorrections?: string;
  correctionsUpdatedAt?: string;
  storyRegeneratedAt?: string;
  storyRegenerationCount?: number;
  podcasts?: PodcastVersion[];
  latestPodcastVersion?: number;

  // Batch transcription tracking
  transcriptionCompletedAt?: string;

  // Story generation tracking
  storyGeneratedAt?: string;

  // Batch job tracking
  transcriptionBatch?: TranscriptionBatchMetadata;

  // Unified progress tracking (Ticket #43)
  progress?: SessionProgress;

  // Note: Legacy progress fields removed in Ticket #39 (2026-02-07)
  // Old fields: completeProcessingStatus, completeProcessingProgress,
  // completeProcessingMessage, completeProcessingError

  // Model tracking
  modelsUsed?: {
    transcription?: string;
    storyGeneration?: string;
    podcastScript?: string;
  };

  // Processing metadata
  processingStartedAt?: string;
  processingCompletedAt?: string;
  processingDurationMs?: number;

}

// Re-export types from schema for backward compatibility
export type { UploadProgress, UnifiedProgress } from '../../core/models/schemas/audio-session.schema';
