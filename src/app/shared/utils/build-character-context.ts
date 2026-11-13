import { DndCharacter } from '../models/dnd-character.model';

export interface ChatAttachment {
  type: 'pdf' | 'image';
  fileName: string;
  mimeType: string;
  data: string; // base64-encoded
}

/**
 * Strips spell descriptions/usage and feature descriptions from a character
 * to reduce LLM input tokens. Both AI 1 and AI 2 receive the stripped version.
 */
export function stripCharacterDetails(character: DndCharacter): DndCharacter {
  let result = { ...character };

  // Strip spell descriptions/usage
  if (result.spellcasting?.spells) {
    result = {
      ...result,
      spellcasting: {
        ...result.spellcasting,
        spells: result.spellcasting.spells.map(spell => {
          if (typeof spell === 'string') return spell;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { description: _d, usage: _u, ...rest } = spell;
          return rest;
        }),
      },
    };
  }

  // Strip feature descriptions
  if (result.featuresAndTraits?.length) {
    result = {
      ...result,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      featuresAndTraits: result.featuresAndTraits.map(({ description: _d, ...rest }) => ({
        ...rest,
        description: '',
      })),
    };
  }

  return result;
}
