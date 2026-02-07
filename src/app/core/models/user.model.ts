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
  createdAt?: Date;               // Use Date type
  updatedAt?: Date;
}
