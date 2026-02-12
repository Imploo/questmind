import { DndCharacter } from '../schemas/dnd-character.schema';
import {CharacterChatRequest, ChatHistoryMessage} from "../../chat/chat.service";

export function buildCharacterChatRequest(character: DndCharacter | null, systemPrompt: string, message: string, history: ChatHistoryMessage[]): CharacterChatRequest {
  const messages = [
    {role: 'user', message: `Huidig karakter:\n${JSON.stringify(character, null, 2)}`},
      ...history,
    {role: 'user', message}
  ] as ChatHistoryMessage[];

  return {systemPrompt: systemPrompt, message, chatHistory: messages};
}
