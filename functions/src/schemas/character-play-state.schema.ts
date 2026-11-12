import { z } from 'zod';

/**
 * The live table state of a character, stored on the character document (see
 * CharacterPlayState in the frontend). Only used to check data that comes from
 * outside, such as an imported character.
 */
export const CharacterPlayStateSchema = z.object({
  hp: z.object({ current: z.number(), temp: z.number() }).optional(),
  hitDice: z.number().optional(),
  deathSaves: z.object({ successes: z.number(), failures: z.number() }).optional(),
  slotsExpended: z.record(z.string(), z.number()).optional(),
  usesSpent: z.record(z.string(), z.number()).optional(),
  conditions: z.array(z.string()).optional(),
  exhaustion: z.number().optional(),
  concentration: z.string().nullable().optional(),
  inspiration: z.boolean().optional(),
  inventory: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    value: z.string().default(''),
    description: z.string().default(''),
  })).optional(),
});

export type CharacterPlayState = z.infer<typeof CharacterPlayStateSchema>;
