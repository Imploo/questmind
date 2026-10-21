import type { UserProfile } from '../core/models/user.model';

export type CampaignRole = 'owner' | 'member';

export interface CampaignMember {
  role: CampaignRole;
  email: string;
  joinedAt: string;
}

/**
 * Recording in which everyone at the table introduces themselves (player name +
 * character, DM as DM). Sent with every transcription as a voice reference (ticket #68).
 */
export interface CampaignVoiceIntro {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface CampaignSettings {
  allowMembersToCreateSessions: boolean;
  kankaEnabled?: boolean;
  kankaCampaignId?: string;
  voiceIntro?: CampaignVoiceIntro;
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
