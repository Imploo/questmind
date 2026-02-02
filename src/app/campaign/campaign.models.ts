export type CampaignRole = 'owner' | 'member';

export interface CampaignMember {
  role: CampaignRole;
  email: string;
  joinedAt: string;
}

export interface CampaignSettings {
  allowMembersToCreateSessions: boolean;
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

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  campaigns: string[];
  defaultCampaignId?: string;
  updatedAt?: string;
  createdAt?: string;
}
