import { describe, it, expect } from 'vitest';
import {
  RAW_STORY_TRANSCRIPTION_PROMPT,
  VOICE_INTRO_REFERENCE_PROMPT,
  buildFullTranscriptionPrompt,
  buildSegmentTranscriptionPrompt,
} from './raw-story-transcription.prompt';

const meta = { index: 2, total: 5, startSec: 1800, endSec: 3600 };

describe('raw story transcription prompts', () => {
  describe('without voice intro', () => {
    it('keeps the full prompt unchanged', () => {
      expect(buildFullTranscriptionPrompt()).toBe(RAW_STORY_TRANSCRIPTION_PROMPT);
      expect(buildFullTranscriptionPrompt({ hasVoiceIntro: false })).toBe(RAW_STORY_TRANSCRIPTION_PROMPT);
    });

    it('only allows names the audio itself makes clear', () => {
      const prompt = buildSegmentTranscriptionPrompt(meta);
      expect(prompt).toContain('ONLY when the audio itself makes it clear');
      expect(prompt).toContain('only use a character name when THIS clip makes it clear');
      expect(prompt).not.toContain('VOICE REFERENCE');
    });
  });

  describe('with voice intro (ticket #68)', () => {
    it('allows voice matching against the introduction round in the full prompt', () => {
      const prompt = buildFullTranscriptionPrompt({ hasVoiceIntro: true });
      expect(prompt).toContain('clearly matches a voice from that introduction round');
      expect(prompt).not.toContain('ONLY when the audio itself makes it clear');
    });

    it('replaces the per-segment speaker line with voice-reference matching', () => {
      const prompt = buildSegmentTranscriptionPrompt(meta, { hasVoiceIntro: true });
      expect(prompt).toContain('matching voices against the voice reference recording');
      expect(prompt).not.toContain('only use a character name when THIS clip makes it clear');
    });

    it('keeps the DM and unknown-speaker rules', () => {
      const prompt = buildSegmentTranscriptionPrompt(meta, { hasVoiceIntro: true });
      expect(prompt).toContain('it stays "DM"');
      expect(prompt).toContain('label it exactly as: Speler (onbekend)');
    });

    it('tells the model never to transcribe the introduction round', () => {
      expect(VOICE_INTRO_REFERENCE_PROMPT).toContain('Do NOT transcribe the introduction round');
      expect(VOICE_INTRO_REFERENCE_PROMPT).toContain('never transcribe the introduction round instead');
    });
  });
});
