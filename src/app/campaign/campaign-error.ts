import type { Translations } from '../core/i18n/translations';
import { callableErrorMessage } from '../shared/utils/callable-error';

/**
 * An error the campaign services throw on purpose. Its message is already in
 * the user's language, so the UI may show it as it is.
 */
export class CampaignError extends Error {}

/**
 * The text to show for a failed campaign action: the message of a
 * `CampaignError`, otherwise a text for the error code (Firestore and callables
 * share their codes) or `fallback`. A raw Firebase message is never shown.
 */
export function campaignErrorMessage(error: unknown, texts: Translations['errors'], fallback: string): string {
  return error instanceof CampaignError ? error.message : callableErrorMessage(error, texts, fallback);
}
