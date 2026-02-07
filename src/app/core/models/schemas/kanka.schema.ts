import { z } from 'zod';

/**
 * Kanka entity type schema
 */
export const KankaEntityTypeSchema = z.enum(['characters', 'locations', 'quests', 'organisations']);

/**
 * Kanka tag schema
 */
export const KankaTagSchema = z.object({
  id: z.number(),
  name: z.string(),
});

/**
 * Kanka entity schema
 */
export const KankaEntitySchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  entry: z.string().optional(),
  entry_parsed: z.string().optional(),
  tags: z.array(KankaTagSchema).optional(),
  image: z.string().optional(),
  is_private: z.boolean().optional(),
});

/**
 * Kanka API response schema
 */
export const KankaApiResponseSchema = z.object({
  data: z.array(z.unknown()),
  links: z.unknown().optional(),
  meta: z.unknown().optional(),
});

/**
 * Kanka search result schema
 */
export const KankaSearchResultSchema = z.object({
  characters: z.array(KankaEntitySchema),
  locations: z.array(KankaEntitySchema),
  quests: z.array(KankaEntitySchema),
  organisations: z.array(KankaEntitySchema),
});

/**
 * Backend Kanka types (simplified)
 */
export const KankaCharacterSchema = z.object({
  name: z.string(),
  entry: z.string().optional(),
  entry_parsed: z.string().optional(),
});

export const KankaLocationSchema = z.object({
  name: z.string(),
  entry: z.string().optional(),
  entry_parsed: z.string().optional(),
});

export const KankaQuestSchema = z.object({
  name: z.string(),
  entry: z.string().optional(),
  entry_parsed: z.string().optional(),
});

export const KankaOrganisationSchema = z.object({
  name: z.string(),
  entry: z.string().optional(),
  entry_parsed: z.string().optional(),
});

/**
 * Types inferred from schemas
 */
export type KankaEntityType = z.infer<typeof KankaEntityTypeSchema>;
export type KankaTag = z.infer<typeof KankaTagSchema>;
export type KankaEntity = z.infer<typeof KankaEntitySchema>;
export type KankaApiResponse<T> = {
  data: T[];
  links?: unknown;
  meta?: unknown;
};
export type KankaSearchResult = z.infer<typeof KankaSearchResultSchema>;
export type KankaCharacter = z.infer<typeof KankaCharacterSchema>;
export type KankaLocation = z.infer<typeof KankaLocationSchema>;
export type KankaQuest = z.infer<typeof KankaQuestSchema>;
export type KankaOrganisation = z.infer<typeof KankaOrganisationSchema>;

/**
 * Validates unknown data against KankaEntitySchema
 * @throws ZodError if validation fails
 */
export function validateKankaEntity(data: unknown): KankaEntity {
  return KankaEntitySchema.parse(data);
}

/**
 * Validates unknown data against KankaSearchResultSchema
 * @throws ZodError if validation fails
 */
export function validateKankaSearchResult(data: unknown): KankaSearchResult {
  return KankaSearchResultSchema.parse(data);
}

/**
 * Safely validates data, returning undefined if invalid
 */
export function safeValidateKankaEntity(data: unknown): KankaEntity | undefined {
  const result = KankaEntitySchema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Safely validates data, returning undefined if invalid
 */
export function safeValidateKankaSearchResult(data: unknown): KankaSearchResult | undefined {
  const result = KankaSearchResultSchema.safeParse(data);
  return result.success ? result.data : undefined;
}
