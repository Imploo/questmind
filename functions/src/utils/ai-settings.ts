import { getFirestore } from 'firebase-admin/firestore';
import { AISettings, AIFeatureConfig, PodcastVoiceSettings } from '../types/audio-session.types';

let cachedSettings: AISettings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getCachedAiSettings(): Promise<AISettings | undefined> {
  const now = Date.now();
  const cacheExpired = !cachedSettings || now - cacheTimestamp > CACHE_TTL_MS;

  if (cacheExpired) {
    const snap = await getFirestore().doc('settings/ai').get();
    cachedSettings = (snap.data() as AISettings) ?? null;
    cacheTimestamp = now;
  }

  // When cache is disabled, always fetch fresh (but still store for cacheEnabled check)
  if (cachedSettings && cachedSettings.cacheEnabled === false && !cacheExpired) {
    const snap = await getFirestore().doc('settings/ai').get();
    cachedSettings = (snap.data() as AISettings) ?? null;
    cacheTimestamp = now;
  }

  return cachedSettings ?? undefined;
}

/** Reset the in-memory cache (for testing) */
export function resetAiSettingsCache(): void {
  cachedSettings = null;
  cacheTimestamp = 0;
}

const DEFAULT_CONFIGS: Record<string, AIFeatureConfig> = {
  characterChatText: { model: 'gemini-3.5-flash', maxOutputTokens: 4096, thinkingLevel: 'low' },
  characterDraft: { model: 'gemini-3.5-flash', maxOutputTokens: 8192, thinkingLevel: 'medium' },
  spellResolution: { model: 'gemini-3.5-flash', maxOutputTokens: 4096, thinkingLevel: 'low' },
  featureResolution: { model: 'gemini-3.5-flash', maxOutputTokens: 4096, thinkingLevel: 'low' },
  transcription: { model: 'gemini-3.5-flash', maxOutputTokens: 65536, thinkingLevel: 'low' },
  storyGeneration: { model: 'gemini-3.5-flash', maxOutputTokens: 32000, thinkingLevel: 'medium' },
  podcastScript: { model: 'gemini-3.5-flash', maxOutputTokens: 4096, thinkingLevel: 'medium' },
  imagePromptGeneration: { model: 'gemini-3.5-flash', maxOutputTokens: 1024, thinkingLevel: 'low' },
};

const DEFAULT_IMAGE_CONFIG = { model: 'fal-ai/flux/schnell' };
const DEFAULT_PODCAST_VOICES: PodcastVoiceSettings = {
  ttsProvider: 'elevenlabs',                     // first release: default to proven ElevenLabs path
  maxCharacters: 5000,
  model: 'eleven_v3',
  host1VoiceId: '',
  host2VoiceId: '',
  geminiModel: 'gemini-3.1-flash-tts-preview',   // fallback: 'gemini-2.5-flash-preview-tts'
  host1VoiceName: 'Puck',                        // male — verify on Dutch
  host2VoiceName: 'Leda',                        // female — verify on Dutch
};

export async function getAiFeatureConfig(featureKey: string): Promise<AIFeatureConfig> {
  const settings = await getCachedAiSettings();
  const featureConfig = settings?.features?.[featureKey as keyof NonNullable<AISettings['features']>];
  const defaults = DEFAULT_CONFIGS[featureKey];
  return { ...defaults, ...(featureConfig as AIFeatureConfig | undefined) };
}

export async function getAiImageConfig(): Promise<{ model: string }> {
  const settings = await getCachedAiSettings();
  return { ...DEFAULT_IMAGE_CONFIG, ...settings?.features?.imageGeneration };
}

export async function getPodcastVoiceConfig(): Promise<PodcastVoiceSettings> {
  const settings = await getCachedAiSettings();
  return { ...DEFAULT_PODCAST_VOICES, ...settings?.features?.podcastVoices };
}
