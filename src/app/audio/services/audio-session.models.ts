export interface AudioUpload {
  file: File;
  sessionName?: string;
  sessionDate?: string;
  userId: string;
  campaignId: string;
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

export interface TranscriptionResult {
  id: string;
  rawTranscript: string;
  timestamps: TranscriptionTimestamp[];
  status: 'processing' | 'completed' | 'failed';
  segments?: TranscriptionSegment[];
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

export type PodcastStatus = 'pending' | 'script_complete' | 'completed' | 'failed';

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

  /**
   * Statuses the backend writes: pending → script_complete → completed, or failed.
   * Live progress is tracked on `session.progress` (Ticket #43).
   */
  status: PodcastStatus;
  /** @deprecated Use session.progress instead (Ticket #43) */
  progress?: number; // 0-100
  /** @deprecated Use session.progress.message instead (Ticket #43) */
  progressMessage?: string; // e.g., "Generating audio with text-to-dialogue..."
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
  | 'compressing'           // Client-side audio compression
  | 'uploading'
  | 'processing-audio'      // Backend ffmpeg: join, downmix, normalize, encode
  | 'transcribing'          // Fast transcription
  | 'generating-story'
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

/** Fast-transcription metadata persisted on the session (ticket #67). */
export interface TranscriptionFastMetadata {
  mode?: string;
  status?: 'processing' | 'completed' | 'failed';
  segmentCount?: number;
  audioFileName?: string;
  error?: string;
}

/** The session's processed recording (compressed + normalized MP3) in Firebase Storage. */
export interface AudioRecording {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  uploadedAt: string;
}

/** An uploaded source file awaiting backend processing (original M4A/MP3, or browser-compressed WAV). */
export interface AudioSource {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AudioSessionRecord extends SessionStory {
  campaignId: string;
  ownerId: string;
  ownerEmail: string;
  createdBy: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  updatedAt: string;

  /** Stored recording used for playback and re-transcription. */
  audioRecording?: AudioRecording;
  /** Uploaded sources; removed by the backend once `audioRecording` is ready. */
  audioSources?: AudioSource[];

  transcription?: TranscriptionResult;
  userCorrections?: string;
  correctionsUpdatedAt?: string;
  rawStory?: string;
  storyRegeneratedAt?: string;
  storyRegenerationCount?: number;
  podcasts?: PodcastVersion[];
  latestPodcastVersion?: number;

  transcriptionCompletedAt?: string;

  // Story generation tracking
  storyGeneratedAt?: string;

  // Fast transcription tracking (ticket #67)
  transcriptionFast?: TranscriptionFastMetadata;

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
