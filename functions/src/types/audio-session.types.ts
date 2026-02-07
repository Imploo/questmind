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

export type RetranscribeStatus =
  | 'loading_context'
  | 'transcribing'
  | 'transcription_complete'
  | 'generating_story'
  | 'story_complete'
  | 'completed'
  | 'failed';

export type RegenerateStoryStatus =
  | 'loading_context'
  | 'generating_story'
  | 'completed'
  | 'failed';

export interface AIFeatureConfig {
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
}

export interface PodcastVoiceSettings {
  host1VoiceId: string;
  host2VoiceId: string;
}

export interface TranscriptionModeConfig {
  enabled: boolean;
  maxFileSizeMB?: number;
  costMultiplier?: number;
  timeoutSeconds?: number;
  expectedProcessingMinutes?: number;
}

export interface TranscriptionFeatureConfig extends AIFeatureConfig {
  modes?: {
    fast?: TranscriptionModeConfig;
    batch?: TranscriptionModeConfig;
  };
}

export interface AISettings {
  defaultModel: string;
  availableModels?: string[];
  apiProvider?: string;
  features?: {
    transcription?: TranscriptionFeatureConfig;
    storyGeneration?: AIFeatureConfig;
    podcastScript?: AIFeatureConfig;
    podcastVoices?: PodcastVoiceSettings;
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
  storageUrl: string;
  audioFileName: string;
  audioFileSize: number;
  sessionTitle: string;
  sessionDate?: string;
  enableKankaContext?: boolean;
  userCorrections?: string;
}

export interface RetranscribeAudioRequest {
  campaignId: string;
  sessionId: string;
  enableKankaContext?: boolean;
  userCorrections?: string;
  regenerateStoryAfterTranscription?: boolean;
}

export interface RegenerateStoryRequest {
  campaignId: string;
  sessionId: string;
  enableKankaContext?: boolean;
  userCorrections?: string;
}
