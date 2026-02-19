import { Injectable, inject, computed } from '@angular/core';
import { AiSettingsRepository } from '../../shared/repository/ai-settings.repository';

export interface AiModelConfig {
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
}

export interface AiImageConfig {
  model: string;
}

export interface PodcastVoiceSettings {
  host1VoiceId: string;
  host2VoiceId: string;
}

export interface AiSettings {
  features: {
    transcription?: AiModelConfig;
    storyGeneration?: AiModelConfig;
    podcastScript?: AiModelConfig;
    characterChat?: AiModelConfig;
    characterChatText?: AiModelConfig;
    characterDraft?: AiModelConfig;
    spellResolution?: AiModelConfig;
    featureResolution?: AiModelConfig;
    imageGeneration?: AiImageConfig;
    podcastVoices?: PodcastVoiceSettings;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AiSettingsService {
  private readonly repo = inject(AiSettingsRepository);

  // Default fallback values
  private readonly defaultCharacterChatConfig: AiModelConfig = {
    model: 'gemini-3-flash-preview',
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192
  };

  private readonly defaultImageGenerationConfig: AiImageConfig = {
    model: 'fal-ai/flux/schnell'
  };

  /**
   * Get character chat config (with fallback to defaults)
   */
  getCharacterChatConfig(): AiModelConfig {
    const settings = this.repo.get() as AiSettings | null;
    return settings?.features?.characterChat ?? this.defaultCharacterChatConfig;
  }

  /**
   * Get image generation config (with fallback to defaults)
   */
  getImageGenerationConfig(): AiImageConfig {
    const settings = this.repo.get() as AiSettings | null;
    return settings?.features?.imageGeneration ?? this.defaultImageGenerationConfig;
  }

  /**
   * Get all settings (readonly signal)
   */
  getSettings() {
    return computed(() => this.repo.get() as unknown as AiSettings | null);
  }

  /**
   * Get loading state
   */
  isLoading() {
    return this.repo.loading;
  }

  /**
   * Get error state
   */
  getError() {
    return computed(() => {
      const error = this.repo.error();
      return error?.message ?? null;
    });
  }
}
