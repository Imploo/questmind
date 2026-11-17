import { describe, it, expect } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { ERROR_REASONS, refusal } from './error-reasons';

describe('ERROR_REASONS', () => {
  // The contract with the frontend (`CALLABLE_ERROR_REASONS` in src/app/shared/utils/callable-error.ts,
  // one text per reason in each language). Changing this list means changing it there too.
  it('is the list the frontend has a text for', () => {
    expect([...ERROR_REASONS]).toEqual([
      'voice-intro-too-long',
      'import-link-missing',
      'import-link-invalid',
      'import-link-not-questmind',
      'import-link-not-character',
      'import-character-not-found',
      'import-character-unreadable',
      'story-already-generating',
      'no-session-stories',
      'story-version-not-ready',
      'podcast-already-generating',
      'podcast-not-ready',
      'session-has-no-story',
      'no-uploaded-audio',
      'no-transcription',
      'message-length',
      'message-already-sent',
      'attachment-not-pdf',
      'attachment-too-large',
    ]);
  });

  it('holds every reason once, in the kebab-case the frontend turns into a translation key', () => {
    expect(new Set(ERROR_REASONS).size).toBe(ERROR_REASONS.length);
    for (const reason of ERROR_REASONS) {
      expect(reason).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

describe('refusal', () => {
  it('is an HttpsError that carries the reason where the client reads it: details.reason', () => {
    const error = refusal('failed-precondition', 'A podcast is already being generated.', 'podcast-already-generating');

    expect(error).toBeInstanceOf(HttpsError);
    expect(error.code).toBe('failed-precondition');
    expect(error.message).toBe('A podcast is already being generated.');
    expect(error.details).toEqual({ reason: 'podcast-already-generating' });
    // What goes over the wire to the client.
    expect(error.toJSON()).toEqual({
      status: 'FAILED_PRECONDITION',
      message: 'A podcast is already being generated.',
      details: { reason: 'podcast-already-generating' },
    });
  });
});
