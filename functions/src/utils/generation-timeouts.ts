import { toMillis } from './timestamp';

/**
 * Timeouts of the callables that mark a generation as "in progress" on a
 * document, and the window after which such a marker counts as abandoned.
 */
export const CAMPAIGN_STORY_TIMEOUT_SECONDS = 540;
export const CAMPAIGN_STORY_PODCAST_TIMEOUT_SECONDS = 900;
export const SESSION_PODCAST_TIMEOUT_SECONDS = 1200;

/**
 * A generation still in progress after this long is considered abandoned: the
 * function that started it has certainly been killed by its timeout. Derived
 * from the LONGEST timeout of the functions using it, so a second generation can
 * never start while the first is still running.
 */
export const STALE_GENERATION_MS = Math.max(
  CAMPAIGN_STORY_TIMEOUT_SECONDS,
  CAMPAIGN_STORY_PODCAST_TIMEOUT_SECONDS,
  SESSION_PODCAST_TIMEOUT_SECONDS
) * 1000;

/** True while a generation that started at `createdAt` may still be running. */
export function isActiveGeneration(createdAt: unknown, now = Date.now()): boolean {
  return now - (toMillis(createdAt) ?? 0) < STALE_GENERATION_MS;
}
