import { z } from 'zod';

/**
 * Zod schema for UserProfile with runtime validation
 */
export const UserProfileSchema = z.object({
  uid: z.string(),
  email: z.string().email().nullable(),
  displayName: z.string().nullable().optional(),
  photoURL: z.string().url().nullable().optional(),
  admin: z.boolean().optional(),
  campaigns: z.array(z.string()).optional(),
  defaultCampaignId: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

/**
 * Type inferred from UserProfileSchema
 * This ensures types stay in sync with the schema
 */
export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * Validates unknown data against UserProfileSchema
 * @throws ZodError if validation fails
 */
export function validateUserProfile(data: unknown): UserProfile {
  return UserProfileSchema.parse(data);
}

/**
 * Safely validates data, returning undefined if invalid
 */
export function safeValidateUserProfile(data: unknown): UserProfile | undefined {
  const result = UserProfileSchema.safeParse(data);
  return result.success ? result.data : undefined;
}
