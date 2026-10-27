/**
 * Shared types for audio session processing
 */

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

/** Gemini 3.x reasoning effort. Maps to the SDK `ThinkingLevel` enum. */
export type GeminiThinkingLevel = 'low' | 'medium' | 'high';

export interface AIFeatureConfig {
  model: string;
  maxOutputTokens: number;
  /** Gemini 3.x reasoning effort — controls response speed vs. depth. */
  thinkingLevel?: GeminiThinkingLevel;
}

export interface PodcastVoiceSettings {
  maxCharacters: number;
  geminiModel: string;      // e.g. 'gemini-3.8-flash-tts'
  host1VoiceName: string;   // Gemini prebuilt voice (e.g. 'Puck')
  host2VoiceName: string;   // Gemini prebuilt voice (e.g. 'Leda')
}

/**
 * Controls how long recordings are split into shorter segments for transcription
 * (ticket #67). Overridable via `settings/ai.transcriptionSegmentation` so segment
 * length, overlap and failure policy can be tuned without a deploy.
 */
export interface TranscriptionSegmentationSettings {
  /** Master switch — when false the backend transcribes the recording as a single segment. */
  enabled: boolean;
  /** Target length of each segment, in minutes. */
  segmentMinutes: number;
  /** Lead-in overlap pulled from the previous segment, in seconds. */
  overlapSeconds: number;
  /** Recordings at or below this length are not split. */
  minSplitMinutes: number;
  /** Max segments transcribed concurrently on the backend (bounded by Gemini rate limits). */
  concurrency: number;
  /** Per-segment transcription attempts before falling back to the failure policy. */
  maxAttempts: number;
  /** When a segment fails after all retries: insert a transparent gap marker, or fail the session. */
  onSegmentFailure: 'gap' | 'fail';
}

/** Dynamic loudness normalization of uploaded session audio (ffmpeg dynaudnorm). */
export interface AudioNormalizationSettings {
  enabled: boolean;
  /** Maximum amplification of quiet passages, in dB. */
  maxGainDb: number;
}

export interface AISettings {
  defaultModel: string;
  availableModels?: string[];
  apiProvider?: string;
  cacheEnabled?: boolean;
  /** Audio segmentation tuning for fast transcription (ticket #67). */
  transcriptionSegmentation?: Partial<TranscriptionSegmentationSettings>;
  audioNormalization?: Partial<AudioNormalizationSettings>;
  features?: {
    transcription?: AIFeatureConfig;
    storyGeneration?: AIFeatureConfig;
    podcastScript?: AIFeatureConfig;
    /** Campaign story (ticket #69); targetWords is the desired length */
    campaignStory?: AIFeatureConfig & { targetWords?: number };
    podcastVoices?: PodcastVoiceSettings;
    characterChatText?: AIFeatureConfig;
    characterDraft?: AIFeatureConfig;
    spellResolution?: AIFeatureConfig;
    featureResolution?: AIFeatureConfig;
    imagePromptGeneration?: AIFeatureConfig;
    imageGeneration?: { model: string };
  };
}

/**
 * Unified session progress stage (Ticket #43)
 */
export type SessionProgressStage =
  | 'idle'
  | 'compressing'
  | 'uploading'
  | 'processing-audio'
  | 'transcribing'
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

export type PodcastStatus = 'pending' | 'script_complete' | 'completed' | 'failed';

/** One turn of a two-host podcast script. */
export interface PodcastSegment {
  speaker: 'host1' | 'host2';
  text: string;
}

export interface PodcastScript {
  segments: PodcastSegment[];
  estimatedDuration: number;
}

export interface PodcastEntry {
  version: number;
  createdAt?: Date;
  storyVersion?: number;
  status: PodcastStatus;
  progress?: number;
  progressMessage?: string;
  script?: PodcastScript;
  scriptGeneratedAt?: Date;
  duration?: number;
  modelUsed?: string;
  audioUrl?: string;
  fileSize?: number;
  audioGeneratedAt?: Date;
  error?: string | null;
}

export interface PreviousStory {
  title: string;
  sessionDate: string;
  content: string;
}
