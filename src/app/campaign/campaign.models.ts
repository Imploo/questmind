import type { UserProfile } from '../core/models/user.model';

export type CampaignRole = 'owner' | 'member';

export interface CampaignMember {
  role: CampaignRole;
  email: string;
  joinedAt: string;
}

export interface CampaignSettings {
  allowMembersToCreateSessions: boolean;
  kankaEnabled?: boolean;
  kankaCampaignId?: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  ownerEmail: string;
  members: Record<string, CampaignMember>;
  settings?: CampaignSettings;
}

// Re-export UserProfile from core models for backwards compatibility
export type { UserProfile };
