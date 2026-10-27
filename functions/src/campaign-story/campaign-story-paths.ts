/** Firestore/Storage locations for the campaign story (ticket #69). */
export const campaignStoriesCollectionPath = (campaignId: string) =>
  `campaigns/${campaignId}/campaignStories`;

export const campaignStoryDocPath = (campaignId: string, version: number) =>
  `${campaignStoriesCollectionPath(campaignId)}/v${version}`;

export const campaignStoryPodcastStoragePath = (campaignId: string, storyVersion: number, podcastVersion: number) =>
  `campaigns/${campaignId}/campaign-story-podcasts/v${storyVersion}/p${podcastVersion}.mp3`;
