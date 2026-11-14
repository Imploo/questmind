import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';

// Helper for Firestore Timestamp
const TimestampSchema = z.custom<Timestamp>((val) => val instanceof Timestamp || (val && typeof val === 'object' && 'seconds' in val && 'nanoseconds' in val));

export const CharacterImageSchema = z.object({
  id: z.string(),
  characterId: z.string(),
  url: z.string().optional(),
  mimeType: z.string(),
  storagePath: z.string(),
  versionId: z.string().optional(), // Optional: link to the version when it was created
  createdAt: TimestampSchema,
});

export type CharacterImage = z.infer<typeof CharacterImageSchema>;

/** The picture that stands for the character: in the sheet's header and on the exported PDF. */
export function portraitUrlOf(images: CharacterImage[]): string | null {
  return images.find(img => !!img.url)?.url ?? null;
}
