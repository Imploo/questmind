import { DndCharacter } from '../schemas/dnd-character.schema';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CharacterChatRequest {
  systemPrompt: string;
  chatHistory: ChatHistoryMessage[];
}

function stripSpellDetails(character: DndCharacter): DndCharacter {
  const spells = character.spellcasting?.spells;
  if (!spells) return character;
  return {
    ...character,
    spellcasting: {
      ...character.spellcasting,
      spells: spells.map(spell => {
        if (typeof spell === 'string') return spell;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { description: _d, usage: _u, ...rest } = spell;
        return rest;
      }),
    },
  };
}

/**
 * Builds a CharacterChatRequest with the current character JSON embedded
 * in the new user message. The character JSON is part of the message text
 * (not a standalone history entry) to preserve Anthropic's alternating
 * user/assistant message requirement.
 * Spell descriptions and usage are stripped to reduce LLM input tokens.
 */
export function buildCharacterChatRequest(
  character: DndCharacter | null,
  systemPrompt: string,
  message: string,
  history: ChatHistoryMessage[]
): CharacterChatRequest {
  const characterForLlm = character ? stripSpellDetails(character) : null;

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
