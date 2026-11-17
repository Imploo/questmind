import type { Translations } from '../../core/i18n/translations';

type ErrorTexts = Translations['errors'];

/** Error code of a failed callable (`functions/permission-denied` → `permission-denied`), or null. */
export function callableErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== 'string' || !code) return null;
  return code.startsWith('functions/') ? code.slice('functions/'.length) : code;
}

export function isPermissionDenied(error: unknown): boolean {
  return callableErrorCode(error) === 'permission-denied';
}

/**
 * The `reason` a callable sends along with a refusal the user can act on
 * (`new HttpsError(code, message, { reason: 'podcast-not-ready' })`), or null.
 */
export function callableErrorReason(error: unknown): string | null {
  const reason = (error as { details?: { reason?: unknown } | null } | null)?.details?.reason;
  return typeof reason === 'string' && reason ? reason : null;
}

/**
 * Every `reason` the backend sends (`functions/src/utils/error-reasons.ts` holds
 * the same list). Each one has a text under `errors.reasons` in the translations.
 */
export const CALLABLE_ERROR_REASONS = [
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
] as const;

export type CallableErrorReason = (typeof CALLABLE_ERROR_REASONS)[number];

const CODE_TEXT: Record<string, keyof Omit<ErrorTexts, 'reasons'>> = {
  'permission-denied': 'permissionDenied',
  unauthenticated: 'unauthenticated',
  'resource-exhausted': 'tooManyRequests',
  unavailable: 'unavailable',
  'deadline-exceeded': 'unavailable',
  'not-found': 'notFound',
};

/** `podcast-not-ready` → `podcastNotReady`, the key of that reason in the translations. */
function reasonKey(reason: string): string {
  return reason.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * The text to show for a failed Cloud Function call, in the active language.
 * The server's own message is never shown: its `reason` decides first, then
 * its error code, then `fallback` (or the general message).
 */
export function callableErrorMessage(error: unknown, texts: ErrorTexts, fallback?: string): string {
  const reason = callableErrorReason(error);
  if (reason) {
    const text = (texts.reasons as Record<string, string | undefined>)[reasonKey(reason)];
    if (text) return text;
  }
  const code = callableErrorCode(error);
  const codeKey = code ? CODE_TEXT[code] : undefined;
  if (codeKey) return texts[codeKey];
  return fallback ?? texts.generic;
}
