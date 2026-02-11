import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';

// Helper for Firestore Timestamp
const TimestampSchema = z.custom<Timestamp>((val) => val instanceof Timestamp || (val && typeof val === 'object' && 'seconds' in val && 'nanoseconds' in val));

export const CharacterImageSchema = z.object({
  id: z.string(),
  characterId: z.string(),
  url: z.string(),
  mimeType: z.string(),
  versionId: z.string().optional(), // Optional: link to the version when it was created
  createdAt: TimestampSchema,
});

export type CharacterImage = z.infer<typeof CharacterImageSchema>;
