export interface AudioUpload {
  file: File;
  sessionName?: string;
  sessionDate?: string;
  userId: string;
  campaignId: string;
}

export interface StorageMetadata {
  sessionId: string;
  campaignId: string;
  storagePath: string;
  downloadUrl: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
  durationSeconds?: number;
  sizeBytes?: number;
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
  durationSeconds?: number;
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
  audioFileName: string;
  storageUrl: string;
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

  // Enhanced progress tracking
  status:
    | 'pending'
    | 'loading_context'      // NEW: 0-10%
    | 'generating_script'    // NEW: 10-50%
    | 'script_complete'      // NEW: 50%
    | 'generating_audio'     // 50-80%
    | 'uploading'            // 80-95%
    | 'completed'            // 100%
    | 'failed';
  progress: number; // 0-100
  progressMessage: string; // e.g., "Generating audio with text-to-dialogue..."
  error?: string;

  // NEW: Track model used
  modelUsed?: string;
}

export interface UploadProgress {
  sessionId: string;
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  status: 'uploading' | 'completed' | 'failed';
}

export interface AudioSessionRecord extends SessionStory {
  campaignId: string;
  ownerId: string;
  ownerEmail: string;
  createdBy: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  updatedAt: string;
  transcription?: TranscriptionResult;
  storageMetadata?: StorageMetadata;
  storagePath?: string;
  fileSize?: number;
  contentType?: string;
  activeTranscriptionId?: string;
  transcriptions?: TranscriptionRecord[];
  userCorrections?: string;
  correctionsUpdatedAt?: string;
  storyRegeneratedAt?: string;
  storyRegenerationCount?: number;
  podcasts?: PodcastVersion[];
  latestPodcastVersion?: number;
}
