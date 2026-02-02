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
}

export interface TranscriptionTimestamp {
  time: number;
  text: string;
}

export interface TranscriptionResult {
  id: string;
  rawTranscript: string;
  timestamps: TranscriptionTimestamp[];
  status: 'processing' | 'completed' | 'failed';
  storageMetadata: StorageMetadata;
}

export interface TranscriptionRecord {
  id: string;
  sessionId: string;
  rawTranscript: string;
  timestamps: TranscriptionTimestamp[];
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
  label?: string;
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
