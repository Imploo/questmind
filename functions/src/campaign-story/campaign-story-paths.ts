/** Firestore/Storage locations for the campaign story (ticket #69). */
export const campaignStoriesCollectionPath = (campaignId: string) =>
  `campaigns/${campaignId}/campaignStories`;

export const campaignStoryDocPath = (campaignId: string, version: number) =>
  `${campaignStoriesCollectionPath(campaignId)}/v${version}`;

export const campaignStoryPodcastStoragePath = (campaignId: string, storyVersion: number, podcastVersion: number) =>
  `campaigns/${campaignId}/campaign-story-podcasts/v${storyVersion}/p${podcastVersion}.mp3`;

/** A generation still in progress after this long is considered abandoned (function timeout). */
export const STALE_GENERATION_MS = 15 * 60 * 1000;

export function toMillisOrZero(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

export function isActiveGeneration(createdAt: unknown, now = Date.now()): boolean {
  return now - toMillisOrZero(createdAt) < STALE_GENERATION_MS;
}
