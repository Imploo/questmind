import { describe, it, expect } from 'vitest';
import { UserProfileSchema, validateUserProfile, safeValidateUserProfile } from './user.schema';

describe('UserProfileSchema', () => {
  const validProfile = {
    uid: 'user-123',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: 'https://example.com/photo.jpg',
    admin: false,
    campaigns: ['campaign-1'],
    defaultCampaignId: 'campaign-1',
  };

  it('should validate a complete valid profile', () => {
    const result = UserProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  it('should validate a minimal profile (only required fields)', () => {
    const result = UserProfileSchema.safeParse({
      uid: 'user-123',
      email: 'test@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('should allow null email', () => {
    const result = UserProfileSchema.safeParse({
      uid: 'user-123',
      email: null,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing uid', () => {
    const result = UserProfileSchema.safeParse({
      email: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid email format', () => {
    const result = UserProfileSchema.safeParse({
      uid: 'user-123',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid photoURL', () => {
    const result = UserProfileSchema.safeParse({
      uid: 'user-123',
      email: 'test@example.com',
      photoURL: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('should allow null displayName', () => {
    const result = UserProfileSchema.safeParse({
      uid: 'user-123',
      email: 'test@example.com',
      displayName: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('validateUserProfile', () => {
  it('should return parsed data for valid input', () => {
    const result = validateUserProfile({
      uid: 'user-123',
      email: 'test@example.com',
    });
    expect(result.uid).toBe('user-123');
  });

  it('should throw for invalid input', () => {
    expect(() => validateUserProfile({ email: 'test@example.com' })).toThrow();
  });
});

describe('safeValidateUserProfile', () => {
  it('should return data for valid input', () => {
    const result = safeValidateUserProfile({
      uid: 'user-123',
      email: 'test@example.com',
    });
    expect(result).toBeDefined();
    expect(result!.uid).toBe('user-123');
  });

  it('should return undefined for invalid input', () => {
    const result = safeValidateUserProfile({ email: 'test@example.com' });
    expect(result).toBeUndefined();
  });
});
