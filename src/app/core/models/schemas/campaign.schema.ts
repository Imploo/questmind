import { z } from 'zod';

/**
 * Campaign role types
 */
export const CampaignRoleSchema = z.enum(['owner', 'member']);

/**
 * Campaign member schema
 */
export const CampaignMemberSchema = z.object({
  role: CampaignRoleSchema,
  email: z.string().email(),
  joinedAt: z.string(),
});

/**
 * Campaign settings schema
 */
export const CampaignSettingsSchema = z.object({
  allowMembersToCreateSessions: z.boolean(),
  kankaEnabled: z.boolean().optional(),
  kankaCampaignId: z.string().optional(),
});

/**
 * Campaign schema with runtime validation
 */
export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  ownerId: z.string(),
  ownerEmail: z.string().email(),
  members: z.record(z.string(), CampaignMemberSchema),
  settings: CampaignSettingsSchema.optional(),
});

/**
 * Types inferred from schemas
 */
export type CampaignRole = z.infer<typeof CampaignRoleSchema>;
export type CampaignMember = z.infer<typeof CampaignMemberSchema>;
export type CampaignSettings = z.infer<typeof CampaignSettingsSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;

/**
 * Validates unknown data against CampaignSchema
 * @throws ZodError if validation fails
 */
export function validateCampaign(data: unknown): Campaign {
  return CampaignSchema.parse(data);
}

/**
 * Safely validates data, returning undefined if invalid
 */
export function safeValidateCampaign(data: unknown): Campaign | undefined {
  const result = CampaignSchema.safeParse(data);
  return result.success ? result.data : undefined;
}
