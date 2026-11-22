import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';

/**
 * Every `reason` a callable sends along with a refusal the user can act on. The
 * frontend holds the same list (`CALLABLE_ERROR_REASONS` in
 * `src/app/shared/utils/callable-error.ts`) with a text per reason in each language,
 * so a reason is only added or renamed on both sides at once.
 */
export const ERROR_REASONS = [
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
  'podcast-generating',
  'session-has-no-story',
  'no-uploaded-audio',
  'no-transcription',
  'message-length',
  'message-already-sent',
  'attachment-not-pdf',
  'attachment-too-large',
] as const;

export type ErrorReason = (typeof ERROR_REASONS)[number];

/** What the client finds in `error.details` of such a refusal. */
export interface RefusalDetails {
  reason: ErrorReason;
}

/**
 * A refusal the user can act on. `message` is English and meant for the logs: the
 * frontend shows its own text for `reason`, in the user's language.
 */
export function refusal(code: FunctionsErrorCode, message: string, reason: ErrorReason): HttpsError {
  const details: RefusalDetails = { reason };
  return new HttpsError(code, message, details);
}
