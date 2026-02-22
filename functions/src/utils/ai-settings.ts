import { getFirestore } from 'firebase-admin/firestore';
import { AISettings, AIFeatureConfig, PodcastVoiceSettings } from '../types/audio-session.types';

const DEFAULT_CONFIGS: Record<string, AIFeatureConfig> = {
  characterChatText: { model: 'claude-haiku-4-5-20251001', temperature: 0.7, topP: 0.95, topK: 40, maxOutputTokens: 512 },
  characterDraft: { model: 'gemini-3-flash-preview', temperature: 0.1, topP: 0.95, topK: 40, maxOutputTokens: 8192 },
  spellResolution: { model: 'gemini-3-flash-preview', temperature: 0.3, topP: 0.95, topK: 40, maxOutputTokens: 4096 },
  featureResolution: { model: 'gemini-3-flash-preview', temperature: 0.3, topP: 0.95, topK: 40, maxOutputTokens: 4096 },
  transcription: { model: 'gemini-2.0-flash-exp', temperature: 0.1, topP: 1, topK: 40, maxOutputTokens: 128000 },
  storyGeneration: { model: 'gemini-2.0-flash-exp', temperature: 0.8, topP: 0.95, topK: 40, maxOutputTokens: 32000 },
  podcastScript: { model: 'gemini-2.5-flash', temperature: 0.9, topP: 0.95, topK: 40, maxOutputTokens: 4096 },
  imagePromptGeneration: { model: 'gemini-2.5-flash', temperature: 0.7, topP: 0.95, topK: 40, maxOutputTokens: 1024 },
};

const DEFAULT_IMAGE_CONFIG = { model: 'fal-ai/flux/schnell' };
const DEFAULT_PODCAST_VOICES: PodcastVoiceSettings = { model: 'eleven_v3', maxCharacters: 5000, host1VoiceId: '', host2VoiceId: '' };

export async function getAiFeatureConfig(featureKey: string): Promise<AIFeatureConfig> {
  const db = getFirestore();
  const snap = await db.doc('settings/ai').get();
  const settings = snap.data() as AISettings | undefined;
  const featureConfig = settings?.features?.[featureKey as keyof NonNullable<AISettings['features']>];
  const defaults = DEFAULT_CONFIGS[featureKey];
  return { ...defaults, ...(featureConfig as AIFeatureConfig | undefined) };
}

export async function getAiImageConfig(): Promise<{ model: string }> {
  const db = getFirestore();
  const snap = await db.doc('settings/ai').get();
  const settings = snap.data() as AISettings | undefined;
  return { ...DEFAULT_IMAGE_CONFIG, ...settings?.features?.imageGeneration };
}

export async function getPodcastVoiceConfig(): Promise<PodcastVoiceSettings> {
  const db = getFirestore();
  const snap = await db.doc('settings/ai').get();
  const settings = snap.data() as AISettings | undefined;
  return { ...DEFAULT_PODCAST_VOICES, ...settings?.features?.podcastVoices };
}
