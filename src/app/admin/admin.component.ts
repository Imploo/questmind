import { ChangeDetectionStrategy, Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../core/user.service';
import { AiSettingsRepository } from '../shared/repository/ai-settings.repository';
import { type AiSettings, type AiModelConfig, type AiImageConfig, type PodcastVoiceSettings } from '../core/services/ai-settings.service';

type FeatureFormType = 'standard' | 'imageOnly' | 'voicesOnly';

interface FeatureDefinition {
  key: string;
  label: string;
  icon: string;
  provider: string;
  providerColor: string;
  formType: FeatureFormType;
  description: string;
}

@Component({
  selector: 'app-admin',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-white/90 backdrop-blur rounded-2xl shadow-lg overflow-hidden">
      @if (!userService.isAdmin()) {
        <div class="p-8 text-center">
          <div class="text-6xl mb-4">🚫</div>
          <h2 class="text-2xl font-bold text-gray-800 mb-2">Access Denied</h2>
          <p class="text-gray-600">You do not have permission to access the admin panel.</p>
        </div>
      } @else {
        <!-- Header -->
        <div class="p-6 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-2xl font-bold text-gray-800">AI Settings</h2>
              <p class="text-sm text-gray-500">Configure AI model parameters per feature</p>
            </div>
            <div class="h-6">
              @switch (saveIndicator()) {
                @case ('saving') {
                  <span class="text-xs text-gray-400 flex items-center gap-1">
                    <span class="inline-block animate-spin">⏳</span> Saving...
                  </span>
                }
                @case ('saved') {
                  <span class="text-xs text-green-600 flex items-center gap-1">
                    ✓ Saved
                  </span>
                }
                @case ('error') {
                  <span class="text-xs text-red-500 flex items-center gap-1">
                    ✕ Save failed
                  </span>
                }
              }
            </div>
          </div>
        </div>

        @if (loadingSettings()) {
          <div class="flex items-center justify-center py-16">
            <span class="inline-block animate-spin text-2xl">⏳</span>
            <span class="ml-2 text-gray-600">Loading settings...</span>
          </div>
        } @else if (settingsError()) {
          <div class="p-6">
            <div class="p-4 rounded-lg bg-red-50 border border-red-200">
              <div class="flex items-start gap-2">
                <span class="text-lg">❌</span>
                <div class="flex-1">
                  <p class="font-semibold text-red-800">Error Loading Settings</p>
                  <p class="text-sm text-red-700">{{ settingsError() }}</p>
                </div>
              </div>
              <button
                type="button"
                class="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-all"
                (click)="loadSettings()"
              >
                Retry
              </button>
            </div>
          </div>
        } @else if (aiSettings()) {
          <!-- Master-detail layout -->
          <div class="flex flex-col md:flex-row min-h-[500px]">

            <!-- LEFT: Feature list -->
            <div class="w-full md:w-72 md:border-r border-b md:border-b-0 border-gray-200 bg-gray-50/50 shrink-0">
              <div class="p-3 space-y-1">
                @for (feature of featureDefinitions; track feature.key) {
                  <button
                    type="button"
                    (click)="selectFeature(feature)"
                    class="w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-3"
                    [class]="feature.key === selectedFeature().key
                      ? 'bg-white shadow-sm border border-gray-200'
                      : 'hover:bg-white/60'"
                  >
                    <span class="text-lg shrink-0">{{ feature.icon }}</span>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-gray-800 truncate">{{ feature.label }}</div>
                      <span
                        class="inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        [ngClass]="feature.providerColor"
                      >{{ feature.provider }}</span>
                    </div>
                  </button>
                }
              </div>
            </div>

            <!-- RIGHT: Settings form -->
            <div class="flex-1 p-6">
              <!-- Feature header -->
              <div class="mb-6">
                <div class="flex items-center gap-3 mb-1">
                  <span class="text-2xl">{{ selectedFeature().icon }}</span>
                  <h3 class="text-lg font-semibold text-gray-800">{{ selectedFeature().label }}</h3>
                  <span
                    class="text-xs font-semibold px-2 py-0.5 rounded-full"
                    [ngClass]="selectedFeature().providerColor"
                  >{{ selectedFeature().provider }}</span>
                </div>
                <p class="text-sm text-gray-500 ml-11">{{ selectedFeature().description }}</p>
              </div>

              <!-- Form fields based on formType -->
              @switch (selectedFeature().formType) {
                @case ('standard') {
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2">
                      <label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
                      <input
                        type="text"
                        [ngModel]="getFeatureValue('model')"
                        (ngModelChange)="setFeatureValue('model', $event)"
                        [name]="selectedFeature().key + '-model'"
                        (blur)="onFieldBlur()"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Temperature</label>
                      <input
                        type="number"
                        [ngModel]="getFeatureValue('temperature')"
                        (ngModelChange)="setFeatureValue('temperature', $event)"
                        [name]="selectedFeature().key + '-temperature'"
                        (blur)="onFieldBlur()"
                        step="0.05"
                        min="0"
                        max="2"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Top P</label>
                      <input
                        type="number"
                        [ngModel]="getFeatureValue('topP')"
                        (ngModelChange)="setFeatureValue('topP', $event)"
                        [name]="selectedFeature().key + '-topP'"
                        (blur)="onFieldBlur()"
                        step="0.05"
                        min="0"
                        max="1"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Top K</label>
                      <input
                        type="number"
                        [ngModel]="getFeatureValue('topK')"
                        (ngModelChange)="setFeatureValue('topK', $event)"
                        [name]="selectedFeature().key + '-topK'"
                        (blur)="onFieldBlur()"
                        step="1"
                        min="1"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Max Output Tokens</label>
                      <input
                        type="number"
                        [ngModel]="getFeatureValue('maxOutputTokens')"
                        (ngModelChange)="setFeatureValue('maxOutputTokens', $event)"
                        [name]="selectedFeature().key + '-maxTokens'"
                        (blur)="onFieldBlur()"
                        step="1000"
                        min="1"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                  </div>
                }
                @case ('imageOnly') {
                  <div class="grid grid-cols-1 gap-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
                      <input
                        type="text"
                        [ngModel]="getFeatureValue('model')"
                        (ngModelChange)="setFeatureValue('model', $event)"
                        [name]="selectedFeature().key + '-model'"
                        (blur)="onFieldBlur()"
                        placeholder="e.g. fal-ai/flux/schnell"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                  </div>
                }
                @case ('voicesOnly') {
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2">
                      <label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
                      <input
                        type="text"
                        [ngModel]="getFeatureValue('model')"
                        (ngModelChange)="setFeatureValue('model', $event)"
                        [name]="selectedFeature().key + '-model'"
                        (blur)="onFieldBlur()"
                        placeholder="e.g. eleven_v3"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                    <div class="md:col-span-2">
                      <label class="block text-sm font-medium text-gray-700 mb-1">Max Characters</label>
                      <input
                        type="number"
                        [ngModel]="getFeatureValue('maxCharacters')"
                        (ngModelChange)="setFeatureValue('maxCharacters', $event)"
                        [name]="selectedFeature().key + '-maxCharacters'"
                        (blur)="onFieldBlur()"
                        step="1000"
                        min="1000"
                        placeholder="e.g. 5000"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Host 1 Voice ID</label>
                      <input
                        type="text"
                        [ngModel]="getFeatureValue('host1VoiceId')"
                        (ngModelChange)="setFeatureValue('host1VoiceId', $event)"
                        [name]="selectedFeature().key + '-host1'"
                        (blur)="onFieldBlur()"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Host 2 Voice ID</label>
                      <input
                        type="text"
                        [ngModel]="getFeatureValue('host2VoiceId')"
                        (ngModelChange)="setFeatureValue('host2VoiceId', $event)"
                        [name]="selectedFeature().key + '-host2'"
                        (blur)="onFieldBlur()"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                  </div>
                }
              }
            </div>
          </div>
        }
      }
    </div>
  `
})
export class AdminComponent implements OnInit {
  private readonly aiSettingsRepo = inject(AiSettingsRepository);
  readonly userService = inject(UserService);

  readonly featureDefinitions: readonly FeatureDefinition[] = [
    {
      key: 'characterChatText',
      label: 'Character Chat (Tekst)',
      icon: '💬',
      provider: 'Claude',
      providerColor: 'bg-orange-100 text-orange-700',
      formType: 'standard',
      description: 'AI 1 — Reageert als D&D Sidekick op chatberichten'
    },
    {
      key: 'characterDraft',
      label: 'Character Draft (JSON)',
      icon: '🧬',
      provider: 'Gemini',
      providerColor: 'bg-blue-100 text-blue-700',
      formType: 'standard',
      description: 'AI 2 — Genereert character JSON object uit chatcontext'
    },
    {
      key: 'spellResolution',
      label: 'Spell Resolution',
      icon: '✨',
      provider: 'Gemini',
      providerColor: 'bg-blue-100 text-blue-700',
      formType: 'standard',
      description: 'Spell beschrijvingen en mechanische details'
    },
    {
      key: 'featureResolution',
      label: 'Feature Resolution',
      icon: '📋',
      provider: 'Gemini',
      providerColor: 'bg-blue-100 text-blue-700',
      formType: 'standard',
      description: 'Feature/trait beschrijvingen met mechanische effecten'
    },
    {
      key: 'imagePromptGeneration',
      label: 'Image Prompt (LLM)',
      icon: '🖼️',
      provider: 'Gemini',
      providerColor: 'bg-blue-100 text-blue-700',
      formType: 'standard',
      description: 'Genereert beschrijvende image prompt uit karakter context'
    },
    {
      key: 'imageGeneration',
      label: 'Image Generation',
      icon: '🎨',
      provider: 'FAL.ai',
      providerColor: 'bg-purple-100 text-purple-700',
      formType: 'imageOnly',
      description: 'Fantasy character portrait generation'
    },
    {
      key: 'transcription',
      label: 'Audio Transcriptie',
      icon: '🎤',
      provider: 'Gemini',
      providerColor: 'bg-blue-100 text-blue-700',
      formType: 'standard',
      description: 'Transcribeert D&D sessie-audio naar raw story'
    },
    {
      key: 'storyGeneration',
      label: 'Story Generation',
      icon: '📖',
      provider: 'Gemini',
      providerColor: 'bg-blue-100 text-blue-700',
      formType: 'standard',
      description: 'Transformeert raw transcriptie naar sessie-verhaal'
    },
    {
      key: 'podcastScript',
      label: 'Podcast Script',
      icon: '🎙️',
      provider: 'Gemini',
      providerColor: 'bg-blue-100 text-blue-700',
      formType: 'standard',
      description: 'Converteert verhaal naar twee-host podcast dialoog'
    },
    {
      key: 'podcastVoices',
      label: 'Podcast Voices (TTS)',
      icon: '🗣️',
      provider: 'ElevenLabs',
      providerColor: 'bg-green-100 text-green-700',
      formType: 'voicesOnly',
      description: 'Text-to-speech voor dual-voice podcast audio'
    },
  ];

  private readonly defaultConfigs: Record<string, AiModelConfig | AiImageConfig | PodcastVoiceSettings> = {
    characterChatText: { model: 'claude-haiku-4-5-20251001', temperature: 0.7, topP: 0.95, topK: 40, maxOutputTokens: 512 },
    characterDraft: { model: 'gemini-3-flash-preview', temperature: 0.1, topP: 0.95, topK: 40, maxOutputTokens: 8192 },
    spellResolution: { model: 'gemini-3-flash-preview', temperature: 0.3, topP: 0.95, topK: 40, maxOutputTokens: 4096 },
    featureResolution: { model: 'gemini-3-flash-preview', temperature: 0.3, topP: 0.95, topK: 40, maxOutputTokens: 4096 },
    imagePromptGeneration: { model: 'gemini-2.5-flash', temperature: 0.7, topP: 0.95, topK: 40, maxOutputTokens: 1024 },
    imageGeneration: { model: 'fal-ai/flux/schnell' },
    transcription: { model: 'gemini-2.0-flash-exp', temperature: 0.1, topP: 1, topK: 40, maxOutputTokens: 128000 },
    storyGeneration: { model: 'gemini-2.0-flash-exp', temperature: 0.8, topP: 0.95, topK: 40, maxOutputTokens: 32000 },
    podcastScript: { model: 'gemini-2.5-flash', temperature: 0.9, topP: 0.95, topK: 40, maxOutputTokens: 4096 },
    characterChat: { model: 'gemini-2.0-flash-exp', temperature: 0.4, topP: 0.95, topK: 40, maxOutputTokens: 8192 },
    podcastVoices: { model: 'eleven_v3', maxCharacters: 5000, host1VoiceId: '', host2VoiceId: '' },
  };

  // State
  aiSettings = signal<AiSettings | null>(null);
  loadingSettings = signal(false);
  settingsError = signal<string | null>(null);
  selectedFeature = signal<FeatureDefinition>(this.featureDefinitions[0]);
  saveIndicator = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');

  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    if (this.userService.isAdmin()) {
      this.loadSettings();
    }
  }

  selectFeature(feature: FeatureDefinition): void {
    this.selectedFeature.set(feature);
  }

  getFeatureValue(field: string): unknown {
    const settings = this.aiSettings();
    const key = this.selectedFeature().key;
    if (!settings?.features) return '';
    const featureConfig = (settings.features as Record<string, Record<string, unknown>>)[key];
    return featureConfig?.[field] ?? '';
  }

  setFeatureValue(field: string, value: unknown): void {
    const settings = this.aiSettings();
    const key = this.selectedFeature().key;
    if (!settings?.features) return;
    const featureConfig = (settings.features as Record<string, Record<string, unknown>>)[key];
    if (featureConfig) {
      featureConfig[field] = value;
    }
  }

  onFieldBlur(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      void this.autoSave();
    }, 300);
  }

  async loadSettings(): Promise<void> {
    this.loadingSettings.set(true);
    this.settingsError.set(null);

    try {
      await this.aiSettingsRepo.waitForData();
      const data = this.aiSettingsRepo.get() as unknown as AiSettings | null;
      this.aiSettings.set(this.normalizeSettings(data ?? {} as AiSettings));
    } catch (error) {
      console.error('Error loading AI settings:', error);
      this.settingsError.set(
        error instanceof Error ? error.message : 'Failed to load AI settings'
      );
    } finally {
      this.loadingSettings.set(false);
    }
  }

  private async autoSave(): Promise<void> {
    const settings = this.aiSettings();
    if (!settings) return;

    this.saveIndicator.set('saving');

    try {
      await this.aiSettingsRepo.update(settings as AiSettings & Record<string, unknown>);

      this.saveIndicator.set('saved');
      setTimeout(() => this.saveIndicator.set('idle'), 2000);
    } catch (error) {
      console.error('Auto-save failed:', error);
      this.saveIndicator.set('error');
      setTimeout(() => this.saveIndicator.set('idle'), 3000);
    }
  }

  private normalizeSettings(settings: AiSettings): AiSettings {
    const features = settings.features ?? {};
    const normalized: Record<string, unknown> = {};

    for (const def of this.featureDefinitions) {
      const existing = (features as Record<string, unknown>)[def.key];
      const defaults = this.defaultConfigs[def.key];
      normalized[def.key] = { ...defaults, ...(existing as Record<string, unknown> | undefined) };
    }

    // Preserve characterChat for backward compatibility
    if (features.characterChat) {
      normalized['characterChat'] = {
        ...this.defaultConfigs['characterChat'],
        ...(features.characterChat as unknown as Record<string, unknown>),
      };
    }

    return { ...settings, features: normalized as AiSettings['features'] };
  }
}
