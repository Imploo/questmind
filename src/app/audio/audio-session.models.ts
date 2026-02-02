export interface AudioUpload {
  file: File;
  sessionName?: string;
  sessionDate?: string;
  userId: string;
}

export interface StorageMetadata {
  sessionId: string;
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

export interface UploadProgress {
  sessionId: string;
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  status: 'uploading' | 'completed' | 'failed';
}

export interface AudioSessionRecord extends SessionStory {
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  updatedAt: string;
  transcription?: TranscriptionResult;
  storageMetadata?: StorageMetadata;
  storagePath?: string;
  fileSize?: number;
  contentType?: string;
  activeTranscriptionId?: string;
  transcriptions?: TranscriptionRecord[];
}
