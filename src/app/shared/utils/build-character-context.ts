import { DndCharacter } from '../schemas/dnd-character.schema';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CharacterChatRequest {
  systemPrompt: string;
  chatHistory: ChatHistoryMessage[];
}

/**
 * Builds a CharacterChatRequest with the current character JSON embedded
 * in the new user message. The character JSON is part of the message text
 * (not a standalone history entry) to preserve Anthropic's alternating
 * user/assistant message requirement.
 */
export function buildCharacterChatRequest(
  character: DndCharacter | null,
  systemPrompt: string,
  message: string,
  history: ChatHistoryMessage[]
): CharacterChatRequest {
  const characterPreamble: ChatHistoryMessage[] = character
    ? [
        { role: 'user', content: `Huidig karakter:\n${JSON.stringify(character)}\n\n` },
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
