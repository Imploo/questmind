import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGet = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: vi.fn(() => ({ get: mockGet })),
  }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ai-settings', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetAiSettingsCache } = await import('./ai-settings');
    resetAiSettingsCache();
  });

  describe('getAiFeatureConfig', () => {
    it('should return defaults when Firestore has no settings', async () => {
      mockGet.mockResolvedValueOnce({
        data: () => undefined,
      });

      const { getAiFeatureConfig } = await import('./ai-settings');
      const config = await getAiFeatureConfig('spellResolution');

      expect(config).toEqual({
        model: 'gemini-3-flash-preview',
        temperature: 0.3,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 4096,
      });
    });

    it('should merge Firestore overrides with defaults', async () => {
      mockGet.mockResolvedValueOnce({
        data: () => ({
          features: {
            spellResolution: { model: 'custom-model', temperature: 0.5 },
          },
        }),
      });

      const { getAiFeatureConfig } = await import('./ai-settings');
      const config = await getAiFeatureConfig('spellResolution');

      expect(config.model).toBe('custom-model');
      expect(config.temperature).toBe(0.5);
      // Defaults preserved for non-overridden fields
      expect(config.topP).toBe(0.95);
      expect(config.maxOutputTokens).toBe(4096);
    });

    it('should return defaults for unknown feature keys', async () => {
      mockGet.mockResolvedValueOnce({
        data: () => ({}),
      });

      const { getAiFeatureConfig } = await import('./ai-settings');
      const config = await getAiFeatureConfig('unknownFeature');

      // Returns undefined merged with undefined = empty object-like
      expect(config).toBeDefined();
    });
  });

  describe('getAiImageConfig', () => {
    it('should return default image model when no Firestore settings', async () => {
      mockGet.mockResolvedValueOnce({
        data: () => undefined,
      });

      const { getAiImageConfig } = await import('./ai-settings');
      const config = await getAiImageConfig();

      expect(config.model).toBe('fal-ai/flux/schnell');
    });

    it('should override image model from Firestore', async () => {
      mockGet.mockResolvedValueOnce({
        data: () => ({
          features: {
            imageGeneration: { model: 'custom-image-model' },
          },
        }),
      });

      const { getAiImageConfig } = await import('./ai-settings');
      const config = await getAiImageConfig();

      expect(config.model).toBe('custom-image-model');
    });
  });

  describe('getPodcastVoiceConfig', () => {
    it('should return default podcast voice settings when no Firestore settings', async () => {
      mockGet.mockResolvedValueOnce({
        data: () => undefined,
      });

      const { getPodcastVoiceConfig } = await import('./ai-settings');
      const config = await getPodcastVoiceConfig();

      expect(config.model).toBe('eleven_v3');
      expect(config.maxCharacters).toBe(5000);
      expect(config.host1VoiceId).toBe('');
      expect(config.host2VoiceId).toBe('');
    });

    it('should merge Firestore overrides for podcast voices', async () => {
      mockGet.mockResolvedValueOnce({
        data: () => ({
          features: {
            podcastVoices: { host1VoiceId: 'custom-voice-1', maxCharacters: 8000 },
          },
        }),
      });

      const { getPodcastVoiceConfig } = await import('./ai-settings');
      const config = await getPodcastVoiceConfig();

      expect(config.host1VoiceId).toBe('custom-voice-1');
      expect(config.maxCharacters).toBe(8000);
      // Default preserved
      expect(config.model).toBe('eleven_v3');
    });
  });
});
