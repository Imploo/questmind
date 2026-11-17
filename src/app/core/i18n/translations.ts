import type { CommonTranslations } from './parts/common';
import type { ErrorsTranslations } from './parts/errors';
import type { AppTranslations } from './parts/app';
import type { NavTranslations } from './parts/nav';
import type { ProfileTranslations } from './parts/profile';
import type { AuthTranslations } from './parts/auth';
import type { CampaignTranslations } from './parts/campaign';
import type { CampaignStoryTranslations } from './parts/campaign-story';
import type { AudioTranslations } from './parts/audio';
import type { PodcastTranslations } from './parts/podcast';
import type { ProgressTranslations } from './parts/progress';
import type { ChatTranslations } from './parts/chat';
import type { CharactersTranslations } from './parts/characters';
import type { SheetTranslations } from './parts/sheet';
import type { PlayTranslations } from './parts/play';

/**
 * Every text of the app, by key. Both languages must fill in all of it, so a
 * missing translation breaks the build. A text that takes values or has a
 * plural is a function; everything else is a plain string.
 */
export interface Translations {
  common: CommonTranslations;
  errors: ErrorsTranslations;
  app: AppTranslations;
  nav: NavTranslations;
  profile: ProfileTranslations;
  auth: AuthTranslations;
  campaign: CampaignTranslations;
  campaignStory: CampaignStoryTranslations;
  audio: AudioTranslations;
  podcast: PodcastTranslations;
  progress: ProgressTranslations;
  chat: ChatTranslations;
  characters: CharactersTranslations;
  sheet: SheetTranslations;
  play: PlayTranslations;
}
