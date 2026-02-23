import { describe, it, expect } from 'vitest';
import {
  CampaignSchema,
  CampaignRoleSchema,
  CampaignMemberSchema,
  CampaignSettingsSchema,
  validateCampaign,
  safeValidateCampaign,
} from './campaign.schema';

describe('CampaignRoleSchema', () => {
  it('should accept "owner"', () => {
    expect(CampaignRoleSchema.safeParse('owner').success).toBe(true);
  });

  it('should accept "member"', () => {
    expect(CampaignRoleSchema.safeParse('member').success).toBe(true);
  });

  it('should reject invalid role', () => {
    expect(CampaignRoleSchema.safeParse('admin').success).toBe(false);
  });
});

describe('CampaignMemberSchema', () => {
  it('should validate a valid member', () => {
    const result = CampaignMemberSchema.safeParse({
      role: 'owner',
      email: 'owner@example.com',
      joinedAt: '2026-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = CampaignMemberSchema.safeParse({
      role: 'member',
      email: 'not-email',
      joinedAt: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });
});

describe('CampaignSettingsSchema', () => {
  it('should validate minimal settings', () => {
    const result = CampaignSettingsSchema.safeParse({
      allowMembersToCreateSessions: true,
    });
    expect(result.success).toBe(true);
  });

  it('should validate settings with kanka fields', () => {
    const result = CampaignSettingsSchema.safeParse({
      allowMembersToCreateSessions: false,
      kankaEnabled: true,
      kankaCampaignId: 'kanka-123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing allowMembersToCreateSessions', () => {
    const result = CampaignSettingsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('CampaignSchema', () => {
  const validCampaign = {
    id: 'campaign-1',
    name: 'Test Campaign',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    ownerId: 'user-1',
    ownerEmail: 'owner@example.com',
    members: {
      'user-1': { role: 'owner', email: 'owner@example.com', joinedAt: '2026-01-01' },
    },
  };

  it('should validate a complete campaign', () => {
    const result = CampaignSchema.safeParse(validCampaign);
    expect(result.success).toBe(true);
  });

  it('should reject empty name', () => {
    const result = CampaignSchema.safeParse({ ...validCampaign, name: '' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid ownerEmail', () => {
    const result = CampaignSchema.safeParse({ ...validCampaign, ownerEmail: 'not-email' });
    expect(result.success).toBe(false);
  });

  it('should reject missing required fields', () => {
    const result = CampaignSchema.safeParse({ name: 'Test' });
    expect(result.success).toBe(false);
  });

  it('should allow optional description', () => {
    const result = CampaignSchema.safeParse({
      ...validCampaign,
      description: 'A great campaign',
    });
    expect(result.success).toBe(true);
  });
});

describe('validateCampaign', () => {
  it('should throw for invalid data', () => {
    expect(() => validateCampaign({ name: '' })).toThrow();
  });
});

describe('safeValidateCampaign', () => {
  it('should return undefined for invalid data', () => {
    expect(safeValidateCampaign({ name: '' })).toBeUndefined();
  });
});
