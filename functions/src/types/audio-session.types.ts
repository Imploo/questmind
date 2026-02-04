/**
 * Shared types for audio session processing
 */

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

export interface KankaCharacter {
  name: string;
  entry?: string;
  entry_parsed?: string;
}

export interface KankaLocation {
  name: string;
  entry?: string;
  entry_parsed?: string;
}

export interface KankaQuest {
  name: string;
  entry?: string;
  entry_parsed?: string;
}

export interface KankaOrganisation {
  name: string;
  entry?: string;
  entry_parsed?: string;
}

export interface KankaSearchResult {
  characters?: KankaCharacter[];
  locations?: KankaLocation[];
  quests?: KankaQuest[];
  organisations?: KankaOrganisation[];
}

export type CompleteProcessingStatus =
  | 'idle'
  | 'loading_context'
  | 'transcribing'
  | 'transcription_complete'
  | 'generating_story'
  | 'story_complete'
  | 'generating_script'
  | 'script_complete'
  | 'generating_audio'
  | 'uploading'
  | 'completed'
  | 'failed';

export interface AIFeatureConfig {
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
}

export interface AISettings {
  defaultModel: string;
  availableModels?: string[];
  apiProvider?: string;
  features?: {
    transcription?: AIFeatureConfig;
    storyGeneration?: AIFeatureConfig;
    podcastScript?: AIFeatureConfig;
  };
  // Legacy support
  modelConfig?: {
    [key: string]: {
      maxOutputTokens: number;
      temperature: number;
      topP: number;
      topK: number;
    };
  };
}

export interface ProcessAudioSessionRequest {
  campaignId: string;
  sessionId: string;
  audioStorageUrl: string;
  audioFileName: string;
  audioFileSize: number;
  sessionTitle: string;
  sessionDate?: string;
  enableKankaContext?: boolean;
  userCorrections?: string;
}
