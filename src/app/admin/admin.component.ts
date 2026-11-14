import { ChangeDetectionStrategy, Component, signal, computed, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserService } from '../core/user.service';
import { AiSettingsRepository } from '../shared/repository/ai-settings.repository';
import { type AiSettings, type AiModelConfig, type AiImageConfig, type CampaignStoryModelConfig, type PodcastVoiceSettings, DEFAULT_AUDIO_NORMALIZATION } from '../core/services/ai-settings.service';
import { ToastService } from '../shared/services/toast.service';
import * as logger from '../shared/logger';

type FeatureFormType = 'standard' | 'imageOnly' | 'voicesOnly';
type AiSettingsFeatures = NonNullable<AiSettings['features']>;
type FeatureKey = keyof AiSettingsFeatures;

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
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-6xl mx-auto">
      @if (!userService.isAdmin()) {
        <div class="qm-panel qm-hero qm-empty max-w-xl mx-auto">
          <span class="qm-medallion qm-medallion-lg">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </span>
          <h2 class="qm-empty-title">Access Denied</h2>
          <p class="qm-empty-text">You do not have permission to access the admin panel.</p>
        </div>
      } @else {
        <!-- Header -->
        <header class="flex flex-wrap items-end justify-between gap-4 mb-5 sm:mb-6">
          <div>
            <div class="qm-page-eyebrow">Admin</div>
            <h2 class="qm-page-title mt-1">AI Settings</h2>
            <p class="qm-page-sub mt-1">Configure AI model parameters per feature</p>
          </div>
          <div class="qm-panel !py-2 !px-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <!-- Backend cache toggle -->
            <div class="flex items-center gap-2 select-none">
              <span class="qm-eyebrow">Backend Cache</span>
              <button
                type="button"
                role="switch"
                aria-label="Backend Cache"
                [attr.aria-checked]="cacheEnabled()"
                (click)="toggleCache()"
                class="qm-switch"
                [class.is-on]="cacheEnabled()"
              ></button>
              <span class="w-6 text-[10px] font-semibold qm-muted">{{ cacheEnabled() ? 'ON' : 'OFF' }}</span>
            </div>

            <button
              type="button"
              (click)="resetToDefaults()"
              [disabled]="saveIndicator() === 'saving'"
              class="qm-btn qm-btn-sm qm-btn-danger"
            >
              Reset to defaults
            </button>

            <div class="min-w-16 text-xs" aria-live="polite">
              @switch (saveIndicator()) {
                @case ('saving') {
                  <span class="qm-muted flex items-center gap-1.5">
                    <span class="qm-spinner !w-3 !h-3" aria-hidden="true"></span> Saving...
                  </span>
                }
                @case ('saved') {
                  <span class="font-semibold text-[#3a652f]">✓ Saved</span>
                }
                @case ('error') {
                  <span class="font-semibold text-wine">✕ Save failed</span>
                }
              }
            </div>
          </div>
        </header>

        @if (loadingSettings()) {
          <div class="flex items-center justify-center gap-3 py-16 text-white" role="status">
            <span class="qm-spinner qm-spinner-lg qm-spinner-light" aria-hidden="true"></span>
            <span>Loading settings...</span>
          </div>
        } @else if (settingsError()) {
          <div class="qm-panel">
            <div class="qm-alert" role="alert">
              <p class="font-semibold">Error Loading Settings</p>
              <p>{{ settingsError() }}</p>
            </div>
            <button type="button" class="qm-btn qm-btn-primary mt-3" (click)="loadSettings()">
              Retry
            </button>
          </div>
        } @else if (aiSettings()) {
          <!-- Master-detail layout -->
          <div class="qm-panel !p-0 overflow-hidden flex flex-col md:flex-row min-h-[500px]">

            <!-- LEFT: Feature list -->
            <div class="w-full md:w-72 md:border-r border-b md:border-b-0 border-line bg-paper-2 shrink-0">
              <div class="p-3 space-y-1">
                @for (feature of featureDefinitions; track feature.key) {
                  <button
                    type="button"
                    (click)="selectFeature(feature)"
                    class="qm-item flex items-center gap-3"
                    [class.is-active]="feature.key === selectedFeature().key"
                    [attr.aria-current]="feature.key === selectedFeature().key ? 'true' : null"
                  >
                    <span class="text-lg shrink-0" aria-hidden="true">{{ feature.icon }}</span>
                    <span class="flex-1 min-w-0">
                      <span class="block text-sm font-semibold truncate">{{ feature.label }}</span>
                      <span class="qm-badge mt-0.5 !text-[10px]" [class]="feature.providerColor">{{ feature.provider }}</span>
                    </span>
                  </button>
                }
              </div>
            </div>

            <!-- RIGHT: Settings form -->
            <div class="flex-1 min-w-0 p-5 sm:p-6">
              <!-- Feature header -->
              <div class="mb-6">
                <div class="flex flex-wrap items-center gap-3 mb-1">
                  <span class="qm-medallion text-xl" aria-hidden="true">{{ selectedFeature().icon }}</span>
                  <h3 class="qm-display text-lg">{{ selectedFeature().label }}</h3>
                  <span class="qm-badge" [class]="selectedFeature().providerColor">{{ selectedFeature().provider }}</span>
                </div>
                <p class="text-sm qm-muted sm:ml-14">{{ selectedFeature().description }}</p>
              </div>

              <!-- Form fields based on formType -->
              @switch (selectedFeature().formType) {
                @case ('standard') {
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2">
                      <label class="qm-label">Model</label>
                      <input
                        type="text"
                        [ngModel]="getFeatureValue('model')"
                        (ngModelChange)="setFeatureValue('model', $event)"
                        [name]="selectedFeature().key + '-model'"
                        (blur)="onFieldBlur()"
                        class="qm-input"
                      />
                    </div>
                    <div>
                      <label class="qm-label">Max Output Tokens</label>
                      <input
                        type="number"
                        [ngModel]="getFeatureValue('maxOutputTokens')"
                        (ngModelChange)="setFeatureValue('maxOutputTokens', $event)"
                        [name]="selectedFeature().key + '-maxTokens'"
                        (blur)="onFieldBlur()"
                        step="1000"
                        min="1"
                        class="qm-input"
                      />
                    </div>
                    @if (selectedFeature().key === 'campaignStory') {
                      <div>
                        <label class="qm-label">
                          Doel (woorden)
                          <span class="font-sans font-normal normal-case tracking-normal">(~500-600 per A4, 500-1800)</span>
                        </label>
                        <input
                          type="number"
                          [ngModel]="getFeatureValue('targetWords')"
                          (ngModelChange)="setFeatureValue('targetWords', $event)"
                          [name]="selectedFeature().key + '-targetWords'"
                          (blur)="onFieldBlur()"
                          step="100"
                          min="500"
                          max="1800"
                          class="qm-input"
                        />
                      </div>
                    }
                    @if (currentModelIsGemini3()) {
                      <div class="md:col-span-2">
                        <label class="qm-label">
                          Thinking Level
                          <span class="font-sans font-normal normal-case tracking-normal">(Gemini 3.x — reasoning effort, vervangt thinking budget)</span>
                        </label>
                        <select
                          [ngModel]="getFeatureValue('thinkingLevel')"
                          (ngModelChange)="setFeatureValue('thinkingLevel', $event)"
                          [name]="selectedFeature().key + '-thinkingLevel'"
                          (change)="onFieldBlur()"
                          class="qm-input"
                        >
                          <option value="">Model default (medium)</option>
                          @for (level of thinkingLevels; track level) {
                            <option [value]="level">{{ level }}</option>
                          }
                        </select>
                      </div>
                    }
                    @if (selectedFeature().key === 'transcription') {
                      <div class="md:col-span-2 mt-2 pt-3 border-t border-dashed border-[#e0d2b6]">
                        <h4 class="font-display text-sm font-bold tracking-wide">Audio-normalisatie</h4>
                        <p class="qm-help">
                          Trekt zachte en luide sprekers (bv. spelers verder van de microfoon) gelijk vóór upload.
                          Geldt voor sessie-audio en de voice intro.
                        </p>
                      </div>
                      <div>
                        <label class="qm-label">Normalisatie</label>
                        <div class="flex items-center gap-2 h-[42px]">
                          <button
                            type="button"
                            role="switch"
                            aria-label="Normalisatie"
                            [attr.aria-checked]="audioNormalization().enabled"
                            (click)="toggleAudioNormalization()"
                            class="qm-switch"
                            [class.is-on]="audioNormalization().enabled"
                          ></button>
                          <span class="text-xs qm-muted">{{ audioNormalization().enabled ? 'Aan' : 'Uit' }}</span>
                        </div>
                      </div>
                      <div>
                        <label class="qm-label">
                          Max. versterking (dB)
                          <span class="font-sans font-normal normal-case tracking-normal">(0-40, lager = minder ruis)</span>
                        </label>
                        <input
                          type="number"
                          [ngModel]="audioNormalization().maxGainDb"
                          (ngModelChange)="setAudioNormalizationMaxGain($event)"
                          name="audioNormalization-maxGainDb"
                          (blur)="onFieldBlur()"
                          [disabled]="!audioNormalization().enabled"
                          step="1"
                          min="0"
                          max="40"
                          class="qm-input"
                        />
                      </div>
                    }
                  </div>
                }
                @case ('imageOnly') {
                  <div class="grid grid-cols-1 gap-4">
                    <div>
                      <label class="qm-label">Model</label>
                      <input
                        type="text"
                        [ngModel]="getFeatureValue('model')"
                        (ngModelChange)="setFeatureValue('model', $event)"
                        [name]="selectedFeature().key + '-model'"
                        (blur)="onFieldBlur()"
                        placeholder="e.g. gemini-nano-banana-2.1"
                        class="qm-input"
                      />
                    </div>
                  </div>
                }
                @case ('voicesOnly') {
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2">
                      <label class="qm-label">Max Characters</label>
                      <input
                        type="number"
                        [ngModel]="getFeatureValue('maxCharacters')"
                        (ngModelChange)="setFeatureValue('maxCharacters', $event)"
                        [name]="selectedFeature().key + '-maxCharacters'"
                        (blur)="onFieldBlur()"
                        step="1000"
                        min="1000"
                        placeholder="e.g. 5000"
                        class="qm-input"
                      />
                    </div>

                    <!-- Gemini -->
                    <div class="md:col-span-2 mt-2 pt-3 border-t border-dashed border-[#e0d2b6]">
                      <h4 class="font-display text-sm font-bold tracking-wide flex items-center gap-2">
                        <span class="qm-badge qm-badge-info font-sans tracking-normal">Gemini</span>
                        Native multi-speaker TTS
                      </h4>
                    </div>
                    <div class="md:col-span-2">
                      <label class="qm-label">Gemini Model</label>
                      <input
                        type="text"
                        [ngModel]="getFeatureValue('geminiModel')"
                        (ngModelChange)="setFeatureValue('geminiModel', $event)"
                        [name]="selectedFeature().key + '-geminiModel'"
                        (blur)="onFieldBlur()"
                        placeholder="e.g. gemini-3.8-flash-tts"
                        class="qm-input"
                      />
                    </div>
                    <div>
                      <label class="qm-label">Host 1 Voice (male)</label>
                      <select
                        [ngModel]="getFeatureValue('host1VoiceName')"
                        (ngModelChange)="setFeatureValue('host1VoiceName', $event)"
                        [name]="selectedFeature().key + '-host1VoiceName'"
                        (change)="onFieldBlur()"
                        class="qm-input"
                      >
                        @for (voice of geminiVoiceNames; track voice) {
                          <option [value]="voice">{{ voice }}</option>
                        }
                      </select>
                    </div>
                    <div>
                      <label class="qm-label">Host 2 Voice (female)</label>
                      <select
                        [ngModel]="getFeatureValue('host2VoiceName')"
                        (ngModelChange)="setFeatureValue('host2VoiceName', $event)"
                        [name]="selectedFeature().key + '-host2VoiceName'"
                        (change)="onFieldBlur()"
                        class="qm-input"
                      >
                        @for (voice of geminiVoiceNames; track voice) {
                          <option [value]="voice">{{ voice }}</option>
                        }
                      </select>
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
  private readonly toastService = inject(ToastService);
  readonly userService = inject(UserService);

  readonly thinkingLevels = ['low', 'medium', 'high'] as const;

  readonly featureDefinitions: readonly FeatureDefinition[] = [
    {
      key: 'characterChatText',
      label: 'Character Chat (Tekst)',
      icon: '💬',
      provider: 'Gemini',
      providerColor: 'qm-badge-info',
      formType: 'standard',
      description: 'AI 1 — Reageert als D&D Sidekick op chatberichten'
    },
    {
      key: 'characterDraft',
      label: 'Character Draft (JSON)',
      icon: '🧬',
      provider: 'Gemini',
      providerColor: 'qm-badge-info',
      formType: 'standard',
      description: 'AI 2 — Genereert character JSON object uit chatcontext'
    },
    {
      key: 'spellResolution',
      label: 'Spell Resolution',
      icon: '✨',
      provider: 'Gemini',
      providerColor: 'qm-badge-info',
      formType: 'standard',
      description: 'Spell beschrijvingen en mechanische details'
    },
    {
      key: 'featureResolution',
      label: 'Feature Resolution',
      icon: '📋',
      provider: 'Gemini',
      providerColor: 'qm-badge-info',
      formType: 'standard',
      description: 'Feature/trait beschrijvingen met mechanische effecten'
    },
    {
      key: 'imagePromptGeneration',
      label: 'Image Prompt (LLM)',
      icon: '🖼️',
      provider: 'Gemini',
      providerColor: 'qm-badge-info',
      formType: 'standard',
      description: 'Genereert beschrijvende image prompt uit karakter context'
    },
    {
      key: 'imageGeneration',
      label: 'Image Generation',
      icon: '🎨',
      provider: 'Gemini',
      providerColor: 'qm-badge-info',
      formType: 'imageOnly',
      description: 'Fantasy character portrait generation'
    },
    {
      key: 'transcription',
      label: 'Audio Transcriptie',
      icon: '🎤',
      provider: 'Gemini',
      providerColor: 'qm-badge-info',
      formType: 'standard',
      description: 'Transcribeert D&D sessie-audio naar raw story'
    },
    {
      key: 'storyGeneration',
      label: 'Story Generation',
      icon: '📖',
      provider: 'Gemini',
      providerColor: 'qm-badge-info',
      formType: 'standard',
      description: 'Transformeert raw transcriptie naar sessie-verhaal'
    },
    {
      key: 'podcastScript',
      label: 'Podcast Script',
      icon: '🎙️',
      provider: 'Gemini',
      providerColor: 'qm-badge-info',
      formType: 'standard',
      description: 'Converteert verhaal naar twee-host podcast dialoog'
    },
    {
      key: 'campaignStory',
      label: 'Campaign-verhaal',
      icon: '📚',
      provider: 'Gemini',
      providerColor: 'qm-badge-info',
      formType: 'standard',
      description: 'Vat alle sessieverhalen samen tot één campagneverhaal (~1-3 A4)'
    },
    {
      key: 'podcastVoices',
      label: 'Podcast Voices (TTS)',
      icon: '🗣️',
      provider: 'Gemini',
      providerColor: 'qm-badge-violet',
      formType: 'voicesOnly',
      description: 'Text-to-speech voor dual-voice podcast audio'
    },
  ];

  /** Gemini prebuilt multi-speaker voice names (30 voices). */
  readonly geminiVoiceNames = [
    'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
    'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
    'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
    'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
    'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
  ] as const;

  private readonly defaultConfigs: Record<string, AiModelConfig | CampaignStoryModelConfig | AiImageConfig | PodcastVoiceSettings> = {
    characterChatText: { model: 'gemini-3.8-flash', maxOutputTokens: 8192, thinkingLevel: 'low' },
    characterDraft: { model: 'gemini-3.8-flash', maxOutputTokens: 8192, thinkingLevel: 'medium' },
    spellResolution: { model: 'gemini-3.8-flash', maxOutputTokens: 4096, thinkingLevel: 'low' },
    featureResolution: { model: 'gemini-3.8-flash', maxOutputTokens: 4096, thinkingLevel: 'low' },
    imagePromptGeneration: { model: 'gemini-3.8-flash', maxOutputTokens: 1024, thinkingLevel: 'low' },
    imageGeneration: { model: 'gemini-nano-banana-2.1' },
    transcription: { model: 'gemini-3.8-flash', maxOutputTokens: 65536, thinkingLevel: 'low' },
    storyGeneration: { model: 'gemini-3.8-flash', maxOutputTokens: 60000, thinkingLevel: 'medium' },
    podcastScript: { model: 'gemini-3.8-flash', maxOutputTokens: 32768, thinkingLevel: 'medium' },
    campaignStory: { model: 'gemini-3.8-flash', maxOutputTokens: 16384, thinkingLevel: 'medium', targetWords: 1200 },
    podcastVoices: {
      maxCharacters: 5000,
      geminiModel: 'gemini-3.8-flash-tts',
      host1VoiceName: 'Puck',
      host2VoiceName: 'Leda',
    },
  };

  // State
  aiSettings = signal<AiSettings | null>(null);
  loadingSettings = signal(false);
  settingsError = signal<string | null>(null);
  selectedFeature = signal<FeatureDefinition>(this.featureDefinitions[0]);
  saveIndicator = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  cacheEnabled = computed(() => this.aiSettings()?.cacheEnabled ?? true);
  audioNormalization = computed(() => ({
    ...DEFAULT_AUDIO_NORMALIZATION,
    ...this.aiSettings()?.audioNormalization,
  }));

  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    if (this.userService.isAdmin()) {
      this.loadSettings();
    }
  }

  selectFeature(feature: FeatureDefinition): void {
    this.selectedFeature.set(feature);
  }

  toggleCache(): void {
    this.aiSettings.update(settings => {
      if (!settings) return settings;
      return { ...settings, cacheEnabled: !(settings.cacheEnabled ?? true) };
    });
    void this.autoSave();
  }

  toggleAudioNormalization(): void {
    this.aiSettings.update(settings => {
      if (!settings) return settings;
      const current = this.audioNormalization();
      return { ...settings, audioNormalization: { ...current, enabled: !current.enabled } };
    });
    void this.autoSave();
  }

  setAudioNormalizationMaxGain(value: number | null): void {
    this.aiSettings.update(settings => {
      if (!settings || value === null || !Number.isFinite(value)) return settings;
      const maxGainDb = Math.min(40, Math.max(0, value));
      return { ...settings, audioNormalization: { ...this.audioNormalization(), maxGainDb } };
    });
  }

  currentModelIsGemini3(): boolean {
    const model = this.getFeatureValue('model');
    return typeof model === 'string' && /^gemini-3/.test(model);
  }

  getFeatureValue(field: string): unknown {
    const settings = this.aiSettings();
    const key = this.selectedFeature().key as FeatureKey;
    if (!settings?.features) return '';
    const featureConfig = settings.features[key];
    return (featureConfig as Record<string, unknown> | undefined)?.[field] ?? '';
  }

  setFeatureValue(field: string, value: unknown): void {
    this.aiSettings.update(settings => {
      if (!settings?.features) return settings;
      const key = this.selectedFeature().key as FeatureKey;
      const featureConfig = settings.features[key];
      if (!featureConfig) return settings;
      const updated = structuredClone(settings);
      (updated.features[key] as unknown as Record<string, unknown>)[field] = value;
      return updated;
    });
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
      logger.error('Error loading AI settings:', error);
      this.settingsError.set(
        error instanceof Error ? error.message : 'Failed to load AI settings'
      );
    } finally {
      this.loadingSettings.set(false);
    }
  }

  /**
   * Wipes all stored AI settings so the code defaults (frontend + backend) apply again.
   * The defaults are only shown locally — not written back — so future default changes take effect.
   */
  async resetToDefaults(): Promise<void> {
    const confirmed = await this.toastService.confirm(
      'Alle custom AI settings verwijderen en terugzetten naar de defaults?'
    );
    if (!confirmed) return;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    this.saveIndicator.set('saving');

    try {
      await this.aiSettingsRepo.replace({ features: {} });
      this.aiSettings.set(this.normalizeSettings({ features: {} }));

      this.saveIndicator.set('saved');
      setTimeout(() => this.saveIndicator.set('idle'), 2000);
    } catch (error) {
      logger.error('Reset to defaults failed:', error);
      this.saveIndicator.set('error');
      setTimeout(() => this.saveIndicator.set('idle'), 3000);
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
      logger.error('Auto-save failed:', error);
      this.saveIndicator.set('error');
      setTimeout(() => this.saveIndicator.set('idle'), 3000);
    }
  }

  private normalizeSettings(settings: AiSettings): AiSettings {
    const features = (settings.features ?? {}) as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};

    for (const def of this.featureDefinitions) {
      const existing = features[def.key] as Record<string, unknown> | undefined;
      const defaults = this.defaultConfigs[def.key];
      normalized[def.key] = { ...defaults, ...existing };
    }

    return { ...settings, features: normalized as AiSettings['features'] };
  }
}
