import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { DndCharacterSchema } from '../../../shared/schemas/dnd-character.schema';

// Helper for Firestore Timestamp
const TimestampSchema = z.custom<Timestamp>((val) => val instanceof Timestamp || (val && typeof val === 'object' && 'seconds' in val && 'nanoseconds' in val));

export const CharacterSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  activeVersionId: z.string(),
  campaignId: z.string().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type Character = z.infer<typeof CharacterSchema>;

export const CharacterVersionSchema = z.object({
  id: z.string(),
  versionNumber: z.number(),
  character: DndCharacterSchema,
  commitMessage: z.string(),
  source: z.enum(['ai', 'restore', 'manual']),
  restoredFromVersionId: z.string().optional(),
  createdAt: TimestampSchema,
});

export type CharacterVersion = z.infer<typeof CharacterVersionSchema>;
