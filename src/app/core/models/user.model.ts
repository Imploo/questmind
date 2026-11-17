import type { LanguageCode } from '../i18n/language-strategy';

/**
 * Unified UserProfile interface combining fields from campaign.models.ts and user.service.ts
 * This is the single source of truth for user profile data across the application.
 */
export interface UserProfile {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;      // From campaign.models
  admin?: boolean;                // From user.service
  campaigns?: string[];
  defaultCampaignId?: string;     // From campaign.models
  /** The language the user chose for the app; absent until they choose one. */
  language?: LanguageCode;
  createdAt?: Date;               // Use Date type
  updatedAt?: Date;
}
