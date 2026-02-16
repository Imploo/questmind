import { DndCharacter } from '../models/dnd-character.model';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Request interface for image generation (still uses systemPrompt from frontend).
 * Character chat uses a different interface — see ChatService.
 */
export interface ImageChatRequest {
  systemPrompt: string;
  chatHistory: ChatHistoryMessage[];
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

/**
 * Builds an ImageChatRequest for the image generation flow.
 * Character chat no longer uses this function — it sends characterId + currentCharacter directly.
 */
export function buildImageChatRequest(
  character: DndCharacter | null,
  systemPrompt: string,
  message: string,
  history: ChatHistoryMessage[]
): ImageChatRequest {
  const characterForLlm = character ? stripCharacterDetails(character) : null;

  const characterPreamble: ChatHistoryMessage[] = characterForLlm
    ? [
        { role: 'user', content: `Huidig karakter:\n${JSON.stringify(characterForLlm)}\n\n` },
        { role: 'assistant', content: 'Karakter ontvangen, zal het inlezen.' },
      ]
    : [];

  return {
    systemPrompt,
    chatHistory: [
      ...characterPreamble,
      ...history,
      { role: 'user', content: message },
    ],
  };
}
