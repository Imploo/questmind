import { describe, it, expect } from 'vitest';
import {
  RAW_STORY_TRANSCRIPTION_PROMPT,
  VOICE_INTRO_ROSTER_MAX_LENGTH,
  buildFullTranscriptionPrompt,
  buildSegmentTranscriptionPrompt,
  buildVoiceIntroReferencePrompt,
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
      expect(prompt).toContain('clearly and unambiguously matches exactly ONE profile from the introduction round');
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

    it('ranks explicit cues above voice matches and enforces one name per voice', () => {
      const prompt = buildFullTranscriptionPrompt({ hasVoiceIntro: true });
      expect(prompt).toContain('EVIDENCE ORDER');
      expect(prompt).toContain('the explicit cue wins');
      expect(prompt).toContain('two clearly different voices NEVER share the same name');
      expect(prompt).toContain('silently build a voice profile');
    });

    it('tells the model never to transcribe the introduction round', () => {
      const prompt = buildVoiceIntroReferencePrompt();
      expect(prompt).toContain('Do NOT transcribe the introduction round');
      expect(prompt).toContain('never transcribe the introduction round instead');
    });
  });

  describe('voice intro speaking order', () => {
    it('omits the speaking-order section when no roster is given', () => {
      expect(buildVoiceIntroReferencePrompt()).not.toContain('SPEAKING ORDER');
      expect(buildVoiceIntroReferencePrompt('   ')).not.toContain('SPEAKING ORDER');
    });

    it('includes the trimmed roster and limits it to the session scope', () => {
      const prompt = buildVoiceIntroReferencePrompt('  1. DM (Matt)\n2. Thorin (Jan)  ');
      expect(prompt).toContain('SPEAKING ORDER OF THE INTRODUCTION ROUND');
      expect(prompt).toContain('"""\n1. DM (Matt)\n2. Thorin (Jan)\n"""');
      expect(prompt).toContain('It is NOT evidence of who speaks in the session');
    });

    it('caps an overly long roster', () => {
      const prompt = buildVoiceIntroReferencePrompt('x'.repeat(VOICE_INTRO_ROSTER_MAX_LENGTH + 500));
      expect(prompt).toContain('x'.repeat(VOICE_INTRO_ROSTER_MAX_LENGTH));
      expect(prompt).not.toContain('x'.repeat(VOICE_INTRO_ROSTER_MAX_LENGTH + 1));
    });
  });
});
